import express from 'express';
import { randomUUID } from 'node:crypto';
import { sqlite } from './db.js';
import { getCaller } from './auth.js';
import { HttpError } from './entities.js';
import {
  assertCouponUsable,
  assertSeatsAvailable,
  parseTripKey,
  quoteBooking,
  sortedSeats,
} from './booking.js';

const FLW_VERIFY_URL = 'https://api.flutterwave.com/v3/transactions';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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
    const tripKey = String(body.trip_key);

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

  return router;
}
