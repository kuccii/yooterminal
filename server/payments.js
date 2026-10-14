import express from 'express';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { sqlite } from './db.js';
import { getCaller } from './auth.js';
import { HttpError } from './entities.js';
import {
  assertCouponUsable,
  assertOwnActiveHold,
  assertSeatsAvailable,
  parseTripKey,
  quoteBooking,
  sortedSeats,
} from './booking.js';
import { writeAuditLog } from './audit.js';
import { sendBookingConfirmation, sendCancellation } from './notifications.js';

const FLW_VERIFY_URL = 'https://api.flutterwave.com/v3/transactions';
const FLW_REFUND_URL = 'https://api.flutterwave.com/v3/refunds';
const CANCEL_CUTOFF_HOURS = 3;
const KAMPALA_UTC_OFFSET = '+03:00';
const REFUND_BACKOFF_MS = [15 * 60 * 1000, 60 * 60 * 1000, 6 * 60 * 60 * 1000, 24 * 60 * 60 * 1000];

function refundBackoff(attempts) {
  const index = Math.min(Math.max(Number(attempts) || 0, 0), REFUND_BACKOFF_MS.length - 1);
  return REFUND_BACKOFF_MS[index];
}

export async function attemptRefund(booking) {
  const attempts = (Number(booking.refund_attempts) || 0) + 1;
  if (!booking.payment_tx_id) {
    sqlite
      .prepare("UPDATE booking SET refund_status = 'not_refunded', refund_attempts = ?, refund_next_attempt_at = NULL WHERE id = ?")
      .run(attempts, booking.id);
    return 'not_refunded';
  }
  const status = await requestFlutterwaveRefund(booking.payment_tx_id, process.env.FLW_SECRET_KEY);
  const nextAttemptAt = status === 'refunded' ? null : Date.now() + refundBackoff(attempts);
  sqlite
    .prepare('UPDATE booking SET refund_status = ?, refund_attempts = ?, refund_next_attempt_at = ? WHERE id = ?')
    .run(status, attempts, nextAttemptAt, booking.id);
  writeAuditLog({
    actorId: null,
    action: 'refund.attempt',
    entity: 'booking',
    entityId: booking.id,
    before: { refund_status: booking.refund_status || null, refund_attempts: Number(booking.refund_attempts) || 0 },
    after: { refund_status: status, refund_attempts: attempts },
  });
  return status;
}

export async function runRefundQueue() {
  if (!process.env.FLW_SECRET_KEY) return 0;
  const now = Date.now();
  const due = sqlite
    .prepare(
      `SELECT * FROM booking
        WHERE status = 'cancelled' AND refund_status = 'refund_pending'
          AND (refund_next_attempt_at IS NULL OR refund_next_attempt_at <= ?)
        LIMIT 20`,
    )
    .all(now);
  for (const booking of due) {
    try {
      await attemptRefund(booking);
    } catch (error) {
      console.error('[server] Refund retry failed for', booking.booking_ref, error);
    }
  }
  return due.length;
}

function rawWebhookHash() {
  return String(process.env.FLW_WEBHOOK_SECRET || '');
}

function hashMatches(expected, actual) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function findBookingForTx(ids) {
  for (const id of ids) {
    if (!id) continue;
    const found = sqlite
      .prepare('SELECT * FROM booking WHERE payment_tx_id = ? OR booking_ref = ? LIMIT 1')
      .get(String(id), String(id));
    if (found) return found;
  }
  return null;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function departureDate(booking) {
  return new Date(`${booking.travel_date}T${booking.departure_time}:00${KAMPALA_UTC_OFFSET}`);
}

async function requestFlutterwaveRefund(transactionId, secret) {
  let response;
  try {
    response = await fetch(FLW_REFUND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_id: transactionId }),
    });
  } catch {
    return 'refund_pending';
  }
  const body = await response.json().catch(() => null);
  if (response.ok && body && body.status === 'success') return 'refunded';
  return 'refund_pending';
}

async function verifyFlutterwave(transactionId, secret) {
  let response;
  try {
    response = await fetch(`${FLW_VERIFY_URL}/${encodeURIComponent(transactionId)}/verify`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
  } catch {
    throw new HttpError(502, 'Could not reach the payment provider');
  }
  if (!response.ok) throw new HttpError(502, 'Payment provider verification failed');
  const body = await response.json().catch(() => null);
  if (!body || body.status !== 'success' || !body.data) {
    throw new HttpError(502, 'Payment provider verification failed');
  }
  return body.data;
}

function normalizePassengers(passengers, seats) {
  if (!Array.isArray(passengers) || passengers.length !== seats.length) {
    throw new HttpError(400, 'Passenger details do not match the seat count');
  }
  const wanted = new Set(seats);
  const seen = new Set();
  return passengers.map((passenger) => {
    const seat = String(passenger?.seat || '');
    if (!wanted.has(seat) || seen.has(seat)) throw new HttpError(400, 'Passenger seats do not match');
    seen.add(seat);
    const name = String(passenger?.name || '').trim();
    if (!name) throw new HttpError(400, 'Every passenger needs a name');
    return { seat, name, phone: String(passenger?.phone || '').trim() };
  });
}

export function createPaymentsRouter() {
  const router = express.Router();

  router.post('/confirm', async (req, res) => {
    const caller = await getCaller(req);
    if (!caller) throw new HttpError(401, 'Sign in required');
    if (!process.env.FLW_SECRET_KEY) {
      throw new HttpError(503, 'Online payments are not configured on this server');
    }

    const body = req.body || {};
    const bookingRef = String(body.booking_ref || '').trim();
    const transactionId = String(body.transaction_id || '').trim();
    const seats = sortedSeats(body.seats);
    if (!/^BL[A-Z0-9]{4,12}$/.test(bookingRef)) throw new HttpError(400, 'Invalid booking reference');
    if (!transactionId) throw new HttpError(400, 'Missing payment transaction id');
    if (!seats.length || seats.length > 10) throw new HttpError(400, 'Invalid seat selection');

    const { route_slug, operator_slug, departure_time, travel_date } = parseTripKey(body.trip_key);
    if (!route_slug || !operator_slug || !departure_time || !travel_date) {
      throw new HttpError(400, 'Invalid trip');
    }
    const tripKey = String(body.trip_key);
    assertOwnActiveHold(tripKey, travel_date, seats, caller.id);

    const duplicate = sqlite.prepare('SELECT id FROM booking WHERE booking_ref = ?').get(bookingRef);
    if (duplicate) throw new HttpError(409, 'This booking reference was already used');

    const schedule = sqlite
      .prepare(
        `SELECT * FROM schedule
           WHERE route_slug = ? AND operator_slug = ? AND departure_time = ?
             AND active = 1 AND COALESCE(operator_status, 'approved') = 'approved'
           LIMIT 1`,
      )
      .get(route_slug, operator_slug, departure_time);
    if (!schedule) throw new HttpError(409, 'This departure is no longer available');

    const route = sqlite.prepare('SELECT * FROM route WHERE slug = ?').get(route_slug) || null;
    const operator = sqlite.prepare('SELECT * FROM operator WHERE slug = ?').get(operator_slug) || null;
    const setting = sqlite.prepare('SELECT * FROM platform_setting LIMIT 1').get() || null;

    let coupon = null;
    const couponCode = String(body.coupon_code || '').trim();
    if (couponCode) {
      coupon = sqlite.prepare('SELECT * FROM coupon WHERE UPPER(code) = UPPER(?)').get(couponCode) || null;
      if (!coupon) throw new HttpError(400, 'We cannot apply that code.');
    }

    for (const field of ['contact_name', 'contact_email', 'contact_phone']) {
      if (!String(body[field] || '').trim()) throw new HttpError(400, 'Missing contact details');
    }
    if (!/^\S+@\S+\.\S+$/.test(String(body.contact_email || ''))) {
      throw new HttpError(400, 'Invalid contact email');
    }
    const passengers = normalizePassengers(body.passengers, seats);
    if (Number(body.passenger_count) !== seats.length) {
      throw new HttpError(400, 'Passenger count does not match the seats');
    }

    const quote = quoteBooking({ schedule, route, operator, setting, coupon, travelDate: travel_date, seats });
    assertCouponUsable(coupon, quote.gross, todayISO());

    const data = await verifyFlutterwave(transactionId, process.env.FLW_SECRET_KEY);
    if (data.status !== 'successful') throw new HttpError(402, 'This payment was not completed');
    if (String(data.tx_ref) !== bookingRef) {
      throw new HttpError(402, 'Payment reference does not match this booking');
    }
    if (String(data.currency || '').toUpperCase() !== quote.currency.toUpperCase()) {
      throw new HttpError(402, 'Payment currency does not match this booking');
    }
    if (Math.round(Number(data.amount)) !== quote.amount) {
      throw new HttpError(402, 'Payment amount does not match this booking');
    }

    const now = new Date().toISOString();
    const bookingId = randomUUID();

    const insertBooking = sqlite.prepare(
      `INSERT INTO booking (
         id, booking_ref, status, trip_key, route_slug, travel_date,
         origin_city, destination_city, operator_name, operator_slug, operator_owner_email,
         departure_time, duration_minutes, bus_class, seats, passengers, passenger_count,
         contact_name, contact_email, contact_phone,
         amount, currency, coupon_code, discount_amount, commission_percent, platform_fee, operator_net,
         payment_provider, payment_ref, payment_tx_id, paid_at, validated, created_date, created_by_id
       ) VALUES (?, ?, 'paid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    );
    const insertHold = sqlite.prepare(
      `INSERT INTO departure_seat (
         id, trip_key, travel_date, route_slug, operator_slug, operator_name,
         departure_time, seats, seat_count, created_date, created_by_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const seatsJson = JSON.stringify(seats);
    const passengersJson = JSON.stringify(passengers);

    const booking = sqlite.transaction(() => {
      sqlite
        .prepare('DELETE FROM departure_seat WHERE trip_key = ? AND travel_date = ? AND holder_id = ?')
        .run(tripKey, travel_date, caller.id);
      assertSeatsAvailable(tripKey, travel_date, seats);
      insertBooking.run(
        bookingId,
        bookingRef,
        tripKey,
        route_slug,
        travel_date,
        schedule.origin_city || '',
        schedule.destination_city || '',
        schedule.operator_name || '',
        schedule.operator_slug,
        schedule.owner_email || operator?.owner_email || '',
        schedule.departure_time,
        schedule.duration_minutes ?? null,
        schedule.bus_class || '',
        seatsJson,
        passengersJson,
        seats.length,
        String(body.contact_name).trim(),
        String(body.contact_email).trim(),
        String(body.contact_phone).trim(),
        quote.amount,
        quote.currency,
        couponCode,
        quote.discount,
        quote.percent,
        quote.fee,
        quote.net,
        'flutterwave',
        bookingRef,
        String(data.id ?? transactionId),
        now,
        now,
        caller.id,
      );
      insertHold.run(
        randomUUID(),
        tripKey,
        travel_date,
        route_slug,
        schedule.operator_slug,
        schedule.operator_name || '',
        schedule.departure_time,
        seatsJson,
        seats.length,
        now,
        caller.id,
      );
      return sqlite.prepare('SELECT * FROM booking WHERE id = ?').get(bookingId);
    })();

    void sendBookingConfirmation(booking);

    res.json({
      id: booking.id,
      booking_ref: booking.booking_ref,
      status: booking.status,
      trip_key: booking.trip_key,
      route_slug: booking.route_slug,
      travel_date: booking.travel_date,
      origin_city: booking.origin_city,
      destination_city: booking.destination_city,
      operator_name: booking.operator_name,
      operator_slug: booking.operator_slug,
      departure_time: booking.departure_time,
      duration_minutes: booking.duration_minutes === null ? null : Number(booking.duration_minutes),
      bus_class: booking.bus_class,
      seats: JSON.parse(booking.seats),
      passengers: JSON.parse(booking.passengers),
      passenger_count: Number(booking.passenger_count),
      contact_name: booking.contact_name,
      contact_email: booking.contact_email,
      contact_phone: booking.contact_phone,
      amount: Number(booking.amount),
      currency: booking.currency,
      coupon_code: booking.coupon_code,
      discount_amount: Number(booking.discount_amount),
      commission_percent: Number(booking.commission_percent),
      platform_fee: Number(booking.platform_fee),
      operator_net: Number(booking.operator_net),
      payment_provider: booking.payment_provider,
      payment_ref: booking.payment_ref,
      paid_at: booking.paid_at,
      created_date: booking.created_date,
    });
  });

  router.post('/cancel', async (req, res) => {
    const caller = await getCaller(req);
    if (!caller) throw new HttpError(401, 'Sign in required');

    const bookingRef = String((req.body || {}).booking_ref || '').trim();
    const booking = sqlite.prepare('SELECT * FROM booking WHERE booking_ref = ?').get(bookingRef);
    if (!booking) throw new HttpError(404, 'Booking not found');
    if (booking.status !== 'paid') throw new HttpError(409, 'This booking cannot be cancelled');

    const isAdminCaller = caller.role === 'admin';
    const isOwner = booking.created_by_id === caller.id;
    if (!isAdminCaller && !isOwner) throw new HttpError(403, 'You can only cancel your own bookings');

    if (!isAdminCaller) {
      const cutoffMs = departureDate(booking).getTime() - CANCEL_CUTOFF_HOURS * 60 * 60 * 1000;
      if (Date.now() > cutoffMs) {
        throw new HttpError(409, `Cancellations close ${CANCEL_CUTOFF_HOURS} hours before departure. Contact the operator for help.`);
      }
    }

    const now = new Date().toISOString();
    const seats = JSON.parse(booking.seats || '[]');

    const cancelTx = sqlite.transaction(() => {
      sqlite
        .prepare(
          `UPDATE booking SET status = 'cancelled', cancelled_at = ?, cancelled_by = ?
             WHERE id = ? AND status = 'paid'`,
        )
        .run(now, caller.id, booking.id);

      const holds = sqlite
        .prepare('SELECT * FROM departure_seat WHERE trip_key = ? AND travel_date = ?')
        .all(booking.trip_key, booking.travel_date);
      const drop = new Set(seats.map(String));
      for (const hold of holds) {
        const kept = (JSON.parse(hold.seats || '[]')).filter((seat) => !drop.has(String(seat)));
        if (kept.length === 0) {
          sqlite.prepare('DELETE FROM departure_seat WHERE id = ?').run(hold.id);
        } else if (kept.length !== JSON.parse(hold.seats || '[]').length) {
          sqlite
            .prepare('UPDATE departure_seat SET seats = ?, seat_count = ? WHERE id = ?')
            .run(JSON.stringify(kept), kept.length, hold.id);
        }
      }
    });
    cancelTx();

    let refundStatus = 'not_refunded';
    if (booking.payment_tx_id && process.env.FLW_SECRET_KEY) {
      refundStatus = await attemptRefund(booking);
    }

    writeAuditLog({
      actorId: caller.id,
      action: 'booking.cancel',
      entity: 'booking',
      entityId: booking.id,
      before: { status: booking.status, refund_status: booking.refund_status || null },
      after: { status: 'cancelled', refund_status: refundStatus },
    });

    void sendCancellation({ ...booking, refund_status: refundStatus });

    res.json({ booking_ref: booking.booking_ref, status: 'cancelled', refund_status: refundStatus });
  });

  router.post('/webhook', async (req, res) => {
    const secret = rawWebhookHash();
    if (!secret) {
      throw new HttpError(503, 'Webhook is not configured on this server');
    }
    const received = String(req.get('verif-hash') || '');
    if (!received || !hashMatches(secret, received)) {
      throw new HttpError(401, 'Invalid webhook signature');
    }

    const event = String((req.body || {}).event || '');
    const data = (req.body || {}).data || {};

    if (event === 'charge.completed') {
      if (String(data.status || '') !== 'successful') return res.json({ received: true, ignored: true });
      const booking = findBookingForTx([data.tx_ref]);
      if (booking) {
        if (booking.status === 'paid') return res.json({ received: true, booking_ref: booking.booking_ref, already_paid: true });
        const now = new Date().toISOString();
        sqlite
          .prepare("UPDATE booking SET status = 'paid', payment_tx_id = ?, paid_at = ? WHERE id = ? AND status != 'paid'")
          .run(String(data.id ?? ''), now, booking.id);
        const fresh = sqlite.prepare('SELECT * FROM booking WHERE id = ?').get(booking.id);
        void sendBookingConfirmation(fresh);
        writeAuditLog({
          actorId: null,
          action: 'booking.webhook_paid',
          entity: 'booking',
          entityId: booking.id,
          before: { status: booking.status },
          after: { status: 'paid' },
        });
        return res.json({ received: true, booking_ref: booking.booking_ref });
      }
      writeAuditLog({
        actorId: null,
        action: 'payment.orphan_webhook',
        entity: 'payment',
        entityId: String(data.tx_ref || data.id || 'unknown'),
        before: null,
        after: { event, amount: data.amount ?? null, currency: data.currency ?? null, tx_ref: data.tx_ref ?? null },
      });
      return res.json({ received: true, ignored: true });
    }

    if (event.startsWith('refund.')) {
      const booking = findBookingForTx([data.charge_id, data.transaction_id, data.tx_ref, data.flwref]);
      if (booking && String(data.status || '').toLowerCase() === 'successful') {
        sqlite
          .prepare("UPDATE booking SET refund_status = 'refunded', refund_next_attempt_at = NULL WHERE id = ? AND refund_status != 'refunded'")
          .run(booking.id);
        writeAuditLog({
          actorId: null,
          action: 'refund.webhook_confirmed',
          entity: 'booking',
          entityId: booking.id,
          before: { refund_status: booking.refund_status || null },
          after: { refund_status: 'refunded', event },
        });
        return res.json({ received: true, booking_ref: booking.booking_ref });
      }
      return res.json({ received: true, ignored: true });
    }

    return res.json({ received: true, ignored: true });
  });

  return router;
}
