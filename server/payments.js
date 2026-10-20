import express from 'express';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { sqlite } from './db.js';
import { getCaller } from './auth.js';
import { HttpError } from './entities.js';
import {
  assertCouponUsable,
  assertOwnActiveHold,
  assertSeatsAvailable,
  commissionSplit,
  discountFor,
  parseTripKey,
  quoteBooking,
  sortedSeats,
} from './booking.js';
import { countCouponRedemptions, findCouponForCart } from './coupons.js';
import { writeAuditLog } from './audit.js';
import { createNotification, notifyBookingStaff } from './notify.js';
import { queueBookingReceipt, queueCancellationNotice } from './outbox.js';

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
    .prepare('UPDATE booking SET refund_status = ?, refund_attempts = ?, refund_next_attempt_at = ? WHERE payment_tx_id = ?')
    .run(status, attempts, nextAttemptAt, booking.payment_tx_id);
  if (status === 'refunded' || status === 'refund_pending') {
    void createNotification({
      userId: booking.created_by_id,
      type: status === 'refunded' ? 'refund_processed' : 'refund_pending',
      title: status === 'refunded' ? 'Refund processed' : 'Refund pending',
      message: status === 'refunded'
        ? `Your refund for booking ${booking.booking_ref} has been processed.`
        : `Your refund for booking ${booking.booking_ref} is pending.`,
      link: `/booking/${booking.booking_ref}`,
    });
    notifyBookingStaff(booking, status === 'refunded' ? 'refunded' : 'refund_pending');
  }
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
          AND id = (
            SELECT b2.id FROM booking b2
             WHERE b2.status = 'cancelled' AND b2.refund_status = 'refund_pending'
               AND b2.payment_tx_id IS booking.payment_tx_id
             ORDER BY b2.created_date ASC, b2.id ASC
             LIMIT 1
          )
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

function normalizeLeg(raw) {
  const tripKey = String(raw?.trip_key || '');
  const seats = sortedSeats(raw?.seats);
  if (!seats.length || seats.length > 10) throw new HttpError(400, 'Invalid seat selection');
  const { route_slug, operator_slug, departure_time, travel_date } = parseTripKey(tripKey);
  if (!route_slug || !operator_slug || !departure_time || !travel_date) throw new HttpError(400, 'Invalid trip');
  const passengers = normalizePassengers(raw?.passengers, seats);
  if (Number(raw?.passenger_count) !== seats.length) {
    throw new HttpError(400, 'Passenger count does not match the seats');
  }
  return { tripKey, route_slug, operator_slug, departure_time, travel_date, seats, passengers };
}

function nextBookingRef() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    let ref = 'BL';
    for (let index = 0; index < 8; index += 1) {
      ref += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    const clash = sqlite.prepare('SELECT id FROM booking WHERE booking_ref = ?').get(ref);
    if (!clash) return ref;
  }
}

function serializeBooking(booking) {
  return {
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
    payment_tx_id: booking.payment_tx_id,
    paid_at: booking.paid_at,
    created_date: booking.created_date,
    group_ref: booking.group_ref || null,
    leg_index: booking.leg_index === null || booking.leg_index === undefined ? null : Number(booking.leg_index),
  };
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
    if (!/^BL[A-Z0-9]{4,12}$/.test(bookingRef)) throw new HttpError(400, 'Invalid booking reference');
    if (!transactionId) throw new HttpError(400, 'Missing payment transaction id');

    const legRaws = Array.isArray(body.legs) && body.legs.length ? body.legs : [body];
    if (legRaws.length > 4) throw new HttpError(400, 'Too many legs in one booking');
    const legs = legRaws.map((raw) => normalizeLeg(raw));
    for (const leg of legs) {
      assertOwnActiveHold(leg.tripKey, leg.travel_date, leg.seats, caller.id);
    }

    const duplicate = sqlite.prepare('SELECT id FROM booking WHERE booking_ref = ?').get(bookingRef);
    if (duplicate) throw new HttpError(409, 'This booking reference was already used');

    const groupRefRaw = String(body.group_ref || '').trim();
    let groupRef = null;
    if (groupRefRaw) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(groupRefRaw)) {
        throw new HttpError(400, 'Invalid trip group reference');
      }
      groupRef = groupRefRaw;
    } else if (legs.length > 1) {
      groupRef = randomUUID();
    }

    for (const field of ['contact_name', 'contact_email', 'contact_phone']) {
      if (!String(body[field] || '').trim()) throw new HttpError(400, 'Missing contact details');
    }
    if (!/^\S+@\S+\.\S+$/.test(String(body.contact_email || ''))) {
      throw new HttpError(400, 'Invalid contact email');
    }

    let coupon = null;
    const couponCode = String(body.coupon_code || '').trim();
    if (couponCode) {
      coupon = findCouponForCart(couponCode, legs.map((leg) => leg.operator_slug));
      if (!coupon) throw new HttpError(400, 'We cannot apply that code.');
    }

    const setting = sqlite.prepare('SELECT * FROM platform_setting LIMIT 1').get() || null;

    const legQuotes = legs.map((leg) => {
      const schedule = sqlite
        .prepare(
          `SELECT * FROM schedule
             WHERE route_slug = ? AND operator_slug = ? AND departure_time = ?
               AND active = 1 AND COALESCE(operator_status, 'approved') = 'approved'
             LIMIT 1`,
        )
        .get(leg.route_slug, leg.operator_slug, leg.departure_time);
      if (!schedule) throw new HttpError(409, 'This departure is no longer available');
      const route = sqlite.prepare('SELECT * FROM route WHERE slug = ?').get(leg.route_slug) || null;
      const operator = sqlite.prepare('SELECT * FROM operator WHERE slug = ?').get(leg.operator_slug) || null;
      const quote = quoteBooking({
        schedule,
        route,
        operator,
        setting,
        coupon: null,
        travelDate: leg.travel_date,
        seats: leg.seats,
      });
      return { leg, schedule, operator, quote };
    });

    const currencies = [...new Set(legQuotes.map((item) => item.quote.currency))];
    if (currencies.length !== 1) {
      throw new HttpError(400, 'Every leg of this booking must use the same currency');
    }
    const currency = currencies[0];
    const grossTotal = legQuotes.reduce((sum, item) => sum + item.quote.gross, 0);
    const usedRedemptions = coupon ? countCouponRedemptions(coupon.code, coupon.operator_slug || null) : 0;
    assertCouponUsable(coupon, grossTotal, todayISO(), { used: usedRedemptions, currency });
    const discount = coupon ? discountFor(coupon, grossTotal) : 0;
    const paidTotal = Math.max(grossTotal - discount, 0);
    const priced = legQuotes.map((item, index) => {
      const amount = Math.max(item.quote.gross - (index === 0 ? discount : 0), 0);
      const split = commissionSplit(amount, item.quote.percent);
      return { ...item, amount, fee: split.fee, net: split.net };
    });

    const data = await verifyFlutterwave(transactionId, process.env.FLW_SECRET_KEY);
    if (data.status !== 'successful') throw new HttpError(402, 'This payment was not completed');
    if (String(data.tx_ref) !== bookingRef) {
      throw new HttpError(402, 'Payment reference does not match this booking');
    }
    if (String(data.currency || '').toUpperCase() !== currency.toUpperCase()) {
      throw new HttpError(402, 'Payment currency does not match this booking');
    }
    if (Math.round(Number(data.amount)) !== paidTotal) {
      throw new HttpError(402, 'Payment amount does not match this booking');
    }

    const refs = [bookingRef, ...priced.slice(1).map(() => nextBookingRef())];
    const now = new Date().toISOString();
    const paymentTx = String(data.id ?? transactionId);

    const insertBooking = sqlite.prepare(
      `INSERT INTO booking (
         id, booking_ref, status, trip_key, route_slug, travel_date,
         origin_city, destination_city, operator_name, operator_slug, operator_owner_email,
         departure_time, duration_minutes, bus_class, seats, passengers, passenger_count,
         contact_name, contact_email, contact_phone,
         amount, currency, coupon_code, discount_amount, commission_percent, platform_fee, operator_net,
         payment_provider, payment_ref, payment_tx_id, paid_at, validated, created_date, created_by_id, group_ref,
         leg_index
       ) VALUES (?, ?, 'paid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    );
    const insertHold = sqlite.prepare(
      `INSERT INTO departure_seat (
         id, trip_key, travel_date, route_slug, operator_slug, operator_name,
         departure_time, seats, seat_count, created_date, created_by_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const bookings = sqlite.transaction(() =>
      priced.map((item, index) => {
        const bookingId = randomUUID();
        const seatsJson = JSON.stringify(item.leg.seats);
        const passengersJson = JSON.stringify(item.leg.passengers);
        sqlite
          .prepare('DELETE FROM departure_seat WHERE trip_key = ? AND travel_date = ? AND holder_id = ?')
          .run(item.leg.tripKey, item.leg.travel_date, caller.id);
        assertSeatsAvailable(item.leg.tripKey, item.leg.travel_date, item.leg.seats);
        insertBooking.run(
          bookingId,
          refs[index],
          item.leg.tripKey,
          item.leg.route_slug,
          item.leg.travel_date,
          item.schedule.origin_city || '',
          item.schedule.destination_city || '',
          item.schedule.operator_name || '',
          item.schedule.operator_slug,
          item.schedule.owner_email || item.operator?.owner_email || '',
          item.schedule.departure_time,
          item.schedule.duration_minutes ?? null,
          item.schedule.bus_class || '',
          seatsJson,
          passengersJson,
          item.leg.seats.length,
          String(body.contact_name).trim(),
          String(body.contact_email).trim(),
          String(body.contact_phone).trim(),
          item.amount,
          currency,
          index === 0 ? couponCode : '',
          index === 0 ? discount : 0,
          item.quote.percent,
          item.fee,
          item.net,
          'flutterwave',
          bookingRef,
          paymentTx,
          now,
          now,
          caller.id,
          groupRef,
          index,
        );
        insertHold.run(
          randomUUID(),
          item.leg.tripKey,
          item.leg.travel_date,
          item.leg.route_slug,
          item.schedule.operator_slug,
          item.schedule.operator_name || '',
          item.schedule.departure_time,
          seatsJson,
          item.leg.seats.length,
          now,
          caller.id,
        );
        return sqlite.prepare('SELECT * FROM booking WHERE id = ?').get(bookingId);
      }),
    )();

    for (const booking of bookings) void queueBookingReceipt(booking);
    void createNotification({
      userId: caller.id,
      type: 'booking_confirmed',
      title: 'Booking confirmed',
      message: `Your booking ${bookings[0].booking_ref} is confirmed.`,
      link: `/booking/${bookings[0].booking_ref}`,
    });
    notifyBookingStaff(bookings[0], 'confirmed');

    res.json({
      ...serializeBooking(bookings[0]),
      bookings: bookings.map(serializeBooking),
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

    const groupRows = booking.group_ref
      ? sqlite.prepare('SELECT * FROM booking WHERE group_ref = ?').all(booking.group_ref)
      : [booking];
    const cancelTargets = groupRows.filter((row) => row.status === 'paid');
    const refundInFlight = groupRows.find(
      (row) => row.refund_status === 'refunded' || row.refund_status === 'refund_pending',
    );

    if (!isAdminCaller) {
      for (const row of cancelTargets) {
        const cutoffMs = departureDate(row).getTime() - CANCEL_CUTOFF_HOURS * 60 * 60 * 1000;
        if (Date.now() > cutoffMs) {
          throw new HttpError(409, `Cancellations close ${CANCEL_CUTOFF_HOURS} hours before departure. Contact the operator for help.`);
        }
      }
    }

    const now = new Date().toISOString();

    const cancelTx = sqlite.transaction(() => {
      for (const row of cancelTargets) {
        sqlite
          .prepare(
            `UPDATE booking SET status = 'cancelled', cancelled_at = ?, cancelled_by = ?
               WHERE id = ? AND status = 'paid'`,
          )
          .run(now, caller.id, row.id);

        const seats = JSON.parse(row.seats || '[]');
        const holds = sqlite
          .prepare('SELECT * FROM departure_seat WHERE trip_key = ? AND travel_date = ?')
          .all(row.trip_key, row.travel_date);
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
      }
    });
    cancelTx();

    let refundStatus = 'not_refunded';
    if (refundInFlight) {
      refundStatus = refundInFlight.refund_status;
      for (const row of cancelTargets) {
        if (row.refund_status !== refundStatus) {
          sqlite.prepare('UPDATE booking SET refund_status = ? WHERE id = ?').run(refundStatus, row.id);
        }
      }
    } else if (booking.payment_tx_id && process.env.FLW_SECRET_KEY) {
      refundStatus = await attemptRefund(booking);
    }

    for (const row of cancelTargets) {
      writeAuditLog({
        actorId: caller.id,
        action: 'booking.cancel',
        entity: 'booking',
        entityId: row.id,
        before: { status: row.status, refund_status: row.refund_status || null },
        after: { status: 'cancelled', refund_status: refundStatus },
      });
      void queueCancellationNotice({ ...row, refund_status: refundStatus });
    }

    void createNotification({
      userId: booking.created_by_id,
      type: 'booking_cancelled',
      title: 'Booking cancelled',
      message: `Your booking ${booking.booking_ref} has been cancelled.`,
      link: `/booking/${booking.booking_ref}`,
    });
    notifyBookingStaff(booking, 'cancelled');

    res.json({
      booking_ref: booking.booking_ref,
      status: 'cancelled',
      refund_status: refundStatus,
      booking_refs: cancelTargets.map((row) => row.booking_ref),
    });
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
        void queueBookingReceipt(fresh);
        notifyBookingStaff(fresh, 'confirmed');
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
        if (booking.payment_tx_id) {
          sqlite
            .prepare("UPDATE booking SET refund_status = 'refunded', refund_next_attempt_at = NULL WHERE payment_tx_id = ? AND refund_status != 'refunded'")
            .run(booking.payment_tx_id);
        } else {
          sqlite
            .prepare("UPDATE booking SET refund_status = 'refunded', refund_next_attempt_at = NULL WHERE id = ? AND refund_status != 'refunded'")
            .run(booking.id);
        }
        void createNotification({
          userId: booking.created_by_id,
          type: 'refund_processed',
          title: 'Refund processed',
          message: `Your refund for booking ${booking.booking_ref} has been processed.`,
          link: `/booking/${booking.booking_ref}`,
        });
        notifyBookingStaff(booking, 'refunded');
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
