import express from 'express';
import { randomUUID } from 'node:crypto';
import { sqlite } from './db.js';
import { getCaller } from './auth.js';
import { HttpError } from './entities.js';
import {
  HOLD_TTL_MS,
  assertSeatsAvailable,
  blockedSeatLabels,
  parseTripKey,
  sortedSeats,
  sweepExpiredHolds,
  takenSeatLabels,
} from './booking.js';

async function requireCaller(req) {
  const caller = await getCaller(req);
  if (!caller) throw new HttpError(401, 'Sign in required to hold seats');
  return caller;
}

function assertOperatorAccess(caller, operatorSlug) {
  if (!caller) throw new HttpError(401, 'Sign in required');
  if (caller.role === 'admin') return;
  const operator = sqlite.prepare('SELECT owner_email FROM operator WHERE slug = ?').get(operatorSlug);
  const owner = String(operator?.owner_email || '').toLowerCase();
  if (!owner || owner !== String(caller.email || '').toLowerCase()) {
    throw new HttpError(403, 'You can only manage seats for your own company');
  }
}

function tripParts(tripKey, travelDate) {
  const parsed = parseTripKey(tripKey);
  return {
    ...parsed,
    travel_date: travelDate || parsed.travel_date,
  };
}

export function createSeatsRouter() {
  const router = express.Router();

  router.post('/hold', async (req, res) => {
    const caller = await requireCaller(req);

    const body = req.body || {};
    const { route_slug, operator_slug, departure_time, travel_date } = parseTripKey(body.trip_key);
    if (!route_slug || !operator_slug || !departure_time || !travel_date) {
      throw new HttpError(400, 'Invalid trip');
    }
    const tripKey = String(body.trip_key);
    const seats = sortedSeats(body.seats);
    if (!seats.length || seats.length > 10) throw new HttpError(400, 'Invalid seat selection');

    const schedule = sqlite
      .prepare(
        `SELECT * FROM schedule
           WHERE route_slug = ? AND operator_slug = ? AND departure_time = ?
             AND active = 1 AND COALESCE(operator_status, 'approved') = 'approved'
           LIMIT 1`,
      )
      .get(route_slug, operator_slug, departure_time);
    if (!schedule) throw new HttpError(409, 'This departure is no longer available');

    const now = Date.now();
    const expiresAt = now + HOLD_TTL_MS;

    const insertHold = sqlite.prepare(
      `INSERT INTO departure_seat (
         id, trip_key, travel_date, route_slug, operator_slug, operator_name,
         departure_time, seats, seat_count, holder_id, expires_at, created_date, created_by_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const hold = sqlite.transaction(() => {
      sweepExpiredHolds(tripKey, travel_date, now);
      sqlite
        .prepare('DELETE FROM departure_seat WHERE trip_key = ? AND travel_date = ? AND holder_id = ?')
        .run(tripKey, travel_date, caller.id);
      assertSeatsAvailable(tripKey, travel_date, seats);
      insertHold.run(
        randomUUID(),
        tripKey,
        travel_date,
        route_slug,
        operator_slug,
        schedule.operator_name || '',
        departure_time,
        JSON.stringify(seats),
        seats.length,
        caller.id,
        expiresAt,
        new Date(now).toISOString(),
        caller.id,
      );
      return { trip_key: tripKey, travel_date, seats, expires_at: expiresAt };
    })();

    res.json(hold);
  });

  router.delete('/hold', async (req, res) => {
    const caller = await requireCaller(req);
    const body = req.body || {};
    const { route_slug, operator_slug, departure_time, travel_date } = parseTripKey(body.trip_key);
    if (!route_slug || !operator_slug || !departure_time || !travel_date) {
      throw new HttpError(400, 'Invalid trip');
    }
    const released = sqlite
      .prepare('DELETE FROM departure_seat WHERE trip_key = ? AND travel_date = ? AND holder_id = ?')
      .run(String(body.trip_key), travel_date, caller.id).changes;
    res.json({ released });
  });

  router.get('/taken', async (req, res) => {
    const tripKey = String(req.query.trip_key || '');
    const { travel_date } = tripParts(tripKey, req.query.travel_date);
    if (!tripKey || !travel_date) throw new HttpError(400, 'Invalid trip');
    res.json({ seats: [...takenSeatLabels(tripKey, travel_date)].sort((a, b) => Number(a) - Number(b)) });
  });

  router.get('/blocked', async (req, res) => {
    const tripKey = String(req.query.trip_key || '');
    const { travel_date } = tripParts(tripKey, req.query.travel_date);
    if (!tripKey || !travel_date) throw new HttpError(400, 'Invalid trip');
    const caller = await getCaller(req);
    const { operator_slug } = tripParts(tripKey, travel_date);
    assertOperatorAccess(caller, operator_slug);
    const items = sqlite
      .prepare('SELECT * FROM blocked_seat WHERE trip_key = ? AND travel_date = ? ORDER BY CAST(seat_label AS INTEGER)')
      .all(tripKey, travel_date);
    res.json({ items });
  });

  router.post('/blocked', async (req, res) => {
    const caller = await requireCaller(req);
    const body = req.body || {};
    const tripKey = String(body.trip_key || '');
    const parts = tripParts(tripKey, body.travel_date);
    if (!tripKey || !parts.travel_date || !parts.operator_slug) throw new HttpError(400, 'Invalid trip');
    assertOperatorAccess(caller, parts.operator_slug);

    const seatLabel = String(body.seat_label || '').trim();
    if (!/^\d{1,3}$/.test(seatLabel)) throw new HttpError(400, 'Invalid seat number');

    const schedule = sqlite
      .prepare('SELECT seats_total FROM schedule WHERE route_slug = ? AND operator_slug = ? AND departure_time = ? LIMIT 1')
      .get(parts.route_slug, parts.operator_slug, parts.departure_time);
    const total = Number(schedule?.seats_total) || 0;
    if (total && Number(seatLabel) > total) throw new HttpError(400, `This coach has ${total} seats`);

    if (blockedSeatLabels(tripKey, parts.travel_date).includes(seatLabel)) {
      throw new HttpError(409, `Seat ${seatLabel} is already blocked`);
    }

    const sold = sqlite
      .prepare("SELECT seats FROM booking WHERE trip_key = ? AND travel_date = ? AND status = 'paid'")
      .all(tripKey, parts.travel_date)
      .some((row) => {
        try {
          return JSON.parse(row.seats || '[]').map(String).includes(seatLabel);
        } catch {
          return false;
        }
      });
    if (sold) throw new HttpError(409, `Seat ${seatLabel} is already sold`);

    const id = randomUUID();
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO blocked_seat (
           id, trip_key, travel_date, route_slug, operator_slug, departure_time,
           seat_label, note, created_date, created_by_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        tripKey,
        parts.travel_date,
        parts.route_slug || null,
        parts.operator_slug,
        parts.departure_time || null,
        seatLabel,
        String(body.note || '').trim() || null,
        now,
        caller.id,
      );

    res.json({
      id,
      trip_key: tripKey,
      travel_date: parts.travel_date,
      seat_label: seatLabel,
      note: String(body.note || '').trim() || null,
      created_date: now,
    });
  });

  router.delete('/blocked/:id', async (req, res) => {
    const caller = await requireCaller(req);
    const row = sqlite.prepare('SELECT * FROM blocked_seat WHERE id = ?').get(String(req.params.id || ''));
    if (!row) throw new HttpError(404, 'Blocked seat not found');
    assertOperatorAccess(caller, row.operator_slug);
    sqlite.prepare('DELETE FROM blocked_seat WHERE id = ?').run(row.id);
    res.json({ success: true });
  });

  return router;
}
