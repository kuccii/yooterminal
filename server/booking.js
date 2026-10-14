import { sqlite } from './db.js';
import { HttpError } from './entities.js';

const SEPARATOR = '~';
const PEAK_DAYS = [0, 5, 6];

export function parseTripKey(key) {
  const [route_slug, operator_slug, departure_time, travel_date] = String(key || '').split(SEPARATOR);
  return { route_slug, operator_slug, departure_time, travel_date };
}

function isPeakDay(travelDate) {
  const day = new Date(`${travelDate}T12:00:00`).getDay();
  return PEAK_DAYS.includes(day);
}

export function sortedSeats(seats) {
  const labels = [...new Set((Array.isArray(seats) ? seats : []).map((seat) => String(seat)))];
  return labels.sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b));
  });
}

function collectSeats(rows) {
  const taken = new Set();
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.seats);
      (Array.isArray(parsed) ? parsed : []).forEach((seat) => taken.add(String(seat)));
    } catch {
      // malformed legacy row — ignore
    }
  }
  return taken;
}

export function takenSeatLabels(tripKey, travelDate, now = Date.now()) {
  sweepExpiredHolds(tripKey, travelDate, now);
  const holds = sqlite
    .prepare(
      `SELECT seats FROM departure_seat
        WHERE trip_key = ? AND travel_date = ?
          AND (expires_at IS NULL OR expires_at > ?)`,
    )
    .all(tripKey, travelDate, now);
  const paid = sqlite
    .prepare("SELECT seats FROM booking WHERE trip_key = ? AND travel_date = ? AND status = 'paid'")
    .all(tripKey, travelDate);
  return collectSeats([...holds, ...paid]);
}

export const HOLD_TTL_MS = 10 * 60 * 1000;

export function sweepExpiredHolds(tripKey = null, travelDate = null, now = Date.now()) {
  if (tripKey && travelDate) {
    return sqlite
      .prepare(
        'DELETE FROM departure_seat WHERE trip_key = ? AND travel_date = ? AND expires_at IS NOT NULL AND expires_at <= ?',
      )
      .run(tripKey, travelDate, now).changes;
  }
  return sqlite
    .prepare('DELETE FROM departure_seat WHERE expires_at IS NOT NULL AND expires_at <= ?')
    .run(now).changes;
}

export function findActiveHold(tripKey, travelDate, holderId, now = Date.now()) {
  return sqlite
    .prepare(
      `SELECT * FROM departure_seat
        WHERE trip_key = ? AND travel_date = ? AND holder_id = ? AND expires_at > ?
        ORDER BY expires_at DESC`,
    )
    .get(tripKey, travelDate, holderId, now) || null;
}

export function holdCoversSeats(hold, seats) {
  if (!hold) return false;
  let held = [];
  try {
    held = JSON.parse(hold.seats);
  } catch {
    return false;
  }
  const heldSet = new Set(sortedSeats(Array.isArray(held) ? held : []));
  return sortedSeats(seats).every((seat) => heldSet.has(seat));
}

export function assertOwnActiveHold(tripKey, travelDate, seats, holderId) {
  const hold = findActiveHold(tripKey, travelDate, holderId);
  if (!holdCoversSeats(hold, seats)) {
    throw new HttpError(409, 'Your seat hold has expired — select your seats again to continue.');
  }
  return hold;
}

export function assertSeatsAvailable(tripKey, travelDate, seats) {
  const taken = takenSeatLabels(tripKey, travelDate);
  for (const seat of sortedSeats(seats)) {
    if (taken.has(seat)) throw new HttpError(409, `Seat ${seat} is no longer available`);
  }
}

export function commissionPercentFor(operator, setting, crossingBorder) {
  const own = Number(operator?.commission_percent);
  if (!Number.isNaN(own) && own > 0) return own;
  const platform = crossingBorder
    ? Number(setting?.cross_border_commission_percent)
    : Number(setting?.default_commission_percent);
  if (!Number.isNaN(platform) && platform > 0) return platform;
  const fallback = Number(setting?.default_commission_percent);
  return Number.isNaN(fallback) ? 0 : fallback || 0;
}

export function commissionSplit(amount, percent) {
  const total = Number(amount) || 0;
  const rate = Number(percent) || 0;
  const fee = Math.round((total * rate) / 100);
  return { fee, net: total - fee };
}

export function discountFor(coupon, amount) {
  const total = Number(amount) || 0;
  const value = Number(coupon?.discount_value) || 0;
  const raw = coupon?.discount_type === 'fixed' ? value : Math.round((total * value) / 100);
  return Math.min(Math.max(raw, 0), total);
}

export function priceFor(schedule, travelDate) {
  const base = Number(schedule.price) || 0;
  const surcharge = isPeakDay(travelDate) ? Number(schedule.peak_surcharge_percent) || 0 : 0;
  return surcharge ? Math.round(base * (1 + surcharge / 100)) : base;
}

export function assertCouponUsable(coupon, gross, today) {
  if (!coupon) return;
  if (!coupon.active) throw new HttpError(400, 'We cannot apply that code.');
  if (coupon.expires_at && coupon.expires_at < today) throw new HttpError(400, 'That code has expired.');
  if (coupon.min_amount && gross < Number(coupon.min_amount)) {
    throw new HttpError(400, 'That code needs a larger booking to apply.');
  }
}

export function quoteBooking({ schedule, route, operator, setting, coupon, travelDate, seats }) {
  const unit = priceFor(schedule, travelDate);
  const count = sortedSeats(seats).length;
  const gross = unit * count;
  const discount = coupon ? discountFor(coupon, gross) : 0;
  const amount = Math.max(gross - discount, 0);
  const percent = commissionPercentFor(operator, setting, Boolean(route?.crossing_border));
  const split = commissionSplit(amount, percent);
  return {
    unit,
    count,
    gross,
    discount,
    amount,
    currency: schedule.currency || 'UGX',
    percent,
    fee: split.fee,
    net: split.net,
  };
}
