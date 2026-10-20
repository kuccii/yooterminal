import { randomUUID } from 'node:crypto';

process.env.BETTER_AUTH_SECRET ||= 'verify-seat-blocks-local';

const { sqlite } = await import('./db.js');
const { assertSeatsAvailable, blockedSeatLabels, takenSeatLabels } = await import('./booking.js');

const TRAVEL_DATE = '2030-01-01';
const OTHER_DATE = '2030-01-02';
const MISMATCH_DATE = '2030-01-03';

const schedule = sqlite
  .prepare(
    'SELECT route_slug, operator_slug, departure_time, seats_total FROM schedule WHERE active = 1 ORDER BY route_slug, departure_time LIMIT 1',
  )
  .get();

if (!schedule) {
  console.error('[verify] No active schedule found. Run `npm run seed` first.');
  process.exit(1);
}

const tripKeyFor = (date) =>
  `${schedule.route_slug}~${schedule.operator_slug}~${schedule.departure_time}~${date}`;

const tripKey = tripKeyFor(TRAVEL_DATE);
const blockedSeat = '1';
const freeSeat = '2';
const leakedSeat = '3';

const results = [];
let failures = 0;
const insertedIds = [];

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function check(name, fn) {
  try {
    fn();
    results.push(['PASS', name]);
  } catch (error) {
    failures += 1;
    results.push(['FAIL', `${name} - ${error.message}`]);
  }
}

function insertBlock(seatLabel, travelDate, key) {
  const id = `verify-block-${randomUUID()}`;
  insertedIds.push(id);
  sqlite
    .prepare(
      `INSERT INTO blocked_seat (
         id, trip_key, travel_date, route_slug, operator_slug, departure_time,
         seat_label, note, created_date, created_by_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL)`,
    )
    .run(
      id,
      key,
      travelDate,
      schedule.route_slug,
      schedule.operator_slug,
      schedule.departure_time,
      seatLabel,
      new Date().toISOString(),
    );
  return id;
}

try {
  insertBlock(blockedSeat, TRAVEL_DATE, tripKey);

  check('blocked seat is returned by blockedSeatLabels', () => {
    expect(blockedSeatLabels(tripKey, TRAVEL_DATE).includes(blockedSeat), 'blocked seat missing');
  });

  check('blocked seat is part of the taken set', () => {
    expect(takenSeatLabels(tripKey, TRAVEL_DATE).has(blockedSeat), 'blocked seat missing from taken set');
  });

  check('blocked seat cannot be held or booked', () => {
    let status = 0;
    try {
      assertSeatsAvailable(tripKey, TRAVEL_DATE, [blockedSeat]);
    } catch (error) {
      status = error.status;
    }
    expect(status === 409, `expected 409, received ${status}`);
  });

  check('a free seat on the same trip stays bookable', () => {
    assertSeatsAvailable(tripKey, TRAVEL_DATE, [freeSeat]);
  });

  check('a block does not leak into another travel date', () => {
    expect(!takenSeatLabels(tripKey, OTHER_DATE).has(blockedSeat), 'block leaked to another date');
  });

  insertBlock(leakedSeat, MISMATCH_DATE, tripKey);

  check('a block stored under another travel_date is invisible to the trip', () => {
    expect(!takenSeatLabels(tripKey, TRAVEL_DATE).has(leakedSeat), 'mismatched block was applied');
  });
} finally {
  for (const id of insertedIds) {
    sqlite.prepare('DELETE FROM blocked_seat WHERE id = ?').run(id);
  }
}

for (const [status, line] of results) console.log(`${status}  ${line}`);
console.log(failures ? `\n${failures} check(s) failed` : `\nAll ${results.length} seat-block checks passed`);
process.exit(failures ? 1 : 0);
