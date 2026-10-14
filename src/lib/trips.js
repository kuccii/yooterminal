import { addMinutes, differenceInCalendarDays, format, parseISO } from 'date-fns';

const SEPARATOR = '~';

export function tripKeyOf(routeSlug, operatorSlug, departureTime, travelDate) {
  return [routeSlug, operatorSlug, departureTime, travelDate].join(SEPARATOR);
}

export function parseTripKey(key) {
  const [route_slug, operator_slug, departure_time, travel_date] = String(key || '').split(SEPARATOR);
  return { route_slug, operator_slug, departure_time, travel_date };
}

const PEAK_DAYS = [0, 5, 6];

export function isPeakDay(travelDate) {
  return PEAK_DAYS.includes(parseISO(`${travelDate}T12:00:00`).getDay());
}

export function buildTrip(schedule, travelDate) {
  const departure = parseISO(`${travelDate}T${schedule.departure_time}:00`);
  const arrival = addMinutes(departure, schedule.duration_minutes || 0);
  const basePrice = Number(schedule.price) || 0;
  const peakSurcharge = isPeakDay(travelDate) ? Number(schedule.peak_surcharge_percent) || 0 : 0;
  return {
    key: tripKeyOf(schedule.route_slug, schedule.operator_slug, schedule.departure_time, travelDate),
    schedule,
    travelDate,
    departure,
    arrival,
    nextDay: differenceInCalendarDays(arrival, departure) > 0,
    departureLabel: format(departure, 'HH:mm'),
    arrivalLabel: format(arrival, 'HH:mm'),
    basePrice,
    peakSurcharge,
    price: peakSurcharge ? Math.round(basePrice * (1 + peakSurcharge / 100)) : basePrice,
  };
}

export function buildTrips(schedules, travelDate) {
  return (schedules || []).map((schedule) => buildTrip(schedule, travelDate));
}

export const SEAT_LAYOUTS = [
  { id: '2x2', label: '2 + 2 · four seats per row' },
  { id: '2x1', label: '2 + 1 · three seats per row' },
];

const LAYOUT_LETTERS = {
  '2x2': ['A', 'B', 'C', 'D'],
  '2x1': ['A', 'B', 'C'],
};

export function seatRows(total, layout = '2x2') {
  const letters = LAYOUT_LETTERS[layout] || LAYOUT_LETTERS['2x2'];
  const perRow = letters.length;
  const seats = Number(total) || 0;
  const rows = [];
  for (let start = 0; start < seats; start += perRow) {
    const row = [];
    for (let offset = 0; offset < perRow && start + offset < seats; offset += 1) {
      row.push(`${start / perRow + 1}${letters[offset]}`);
    }
    rows.push(row);
  }
  return rows;
}

export function heldSeatsByTrip(records) {
  const map = {};
  (records || []).forEach((record) => {
    if (!record.trip_key) return;
    map[record.trip_key] = (map[record.trip_key] || []).concat(record.seats || []);
  });
  return map;
}

export function seatsLeft(trip, heldMap) {
  const total = trip.schedule?.seats_total || 0;
  const taken = (heldMap[trip.key] || []).length;
  return Math.max(total - taken, 0);
}

export const TIME_WINDOWS = [
  { id: 'early', label: 'Before 06:00', from: '00:00', to: '06:00' },
  { id: 'morning', label: '06:00 – 12:00', from: '06:00', to: '12:00' },
  { id: 'afternoon', label: '12:00 – 18:00', from: '12:00', to: '18:00' },
  { id: 'evening', label: 'After 18:00', from: '18:00', to: '24:00' },
];

export const SORT_OPTIONS = [
  { id: 'cheapest', label: 'Cheapest first', field: 'price' },
  { id: 'earliest', label: 'Earliest departure', field: 'departure_time' },
  { id: 'fastest', label: 'Shortest journey', field: 'duration_minutes' },
];

export function timeWindowKey(departureTime) {
  const hour = Number(String(departureTime).slice(0, 2));
  if (hour < 6) return 'early';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}