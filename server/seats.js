import express from 'express';
import { randomUUID } from 'node:crypto';
import { sqlite } from './db.js';
import { getCaller } from './auth.js';
import { HttpError } from './entities.js';
import {
  HOLD_TTL_MS,
  assertSeatsAvailable,
  parseTripKey,
  sortedSeats,
  sweepExpiredHolds,
} from './booking.js';

async function requireCaller(req) {
  const caller = await getCaller(req);
  if (!caller) throw new HttpError(401, 'Sign in required to hold seats');
  return caller;
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

  return router;
}
