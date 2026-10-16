import crypto from 'node:crypto';
import { sqlite } from './db.js';

const now = new Date().toISOString();
const newId = () => crypto.randomUUID();
const json = (value) => JSON.stringify(value);

const ROLE_RANK = { user: 0, operator: 1, admin: 2 };

function clearTable(table) {
  sqlite.prepare(`DELETE FROM "${table}"`).run();
}

function insert(table, row) {
  const columns = Object.keys(row);
  const placeholders = columns.map(() => '?').join(', ');
  sqlite
    .prepare(`INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`)
    .run(...columns.map((c) => (typeof row[c] === 'boolean' ? (row[c] ? 1 : 0) : row[c])));
}

function ensureUser({ email, name, role }) {
  const normalizedEmail = String(email).toLowerCase();
  const existing = sqlite.prepare('SELECT id, role FROM app_user WHERE email = ?').get(normalizedEmail);
  if (existing) {
    const existingRank = ROLE_RANK[existing.role] ?? 0;
    const wantedRank = ROLE_RANK[role] ?? 0;
    if (wantedRank > existingRank) {
      sqlite.prepare('UPDATE app_user SET role = ?, updated_date = ? WHERE id = ?')
        .run(role, new Date().toISOString(), existing.id);
      console.log(`[seed] User ${email} already exists (${existing.role}) - promoted to ${role}.`);
    } else {
      console.log(`[seed] User ${email} already exists (${existing.role}) - leaving as is.`);
    }
    return existing.id;
  }
  const result = sqlite
    .prepare('INSERT INTO app_user (email, full_name, role, created_date) VALUES (?, ?, ?, ?)')
    .run(normalizedEmail, name || email, role, new Date().toISOString());
  console.log(`[seed] Seeded ${role}: ${email}`);
  return String(result.lastInsertRowid);
}

const CITIES = [
  { name: 'Kampala', slug: 'kampala', country: 'Uganda', station_name: 'Nakumatt Grand City Terminal', station_address: 'Kampala Road, Kampala', featured: 1,    image_url: '/images/kampala.svg', description: 'Uganda capital and the busiest departure hub on the network.' },
  { name: 'Entebbe', slug: 'entebbe', country: 'Uganda', station_name: 'Entebbe Bus Park', station_address: 'Portal Street, Entebbe', featured: 0, image_url: '', description: 'Lakeside town home to the international airport.' },
  { name: 'Jinja', slug: 'jinja', country: 'Uganda', station_name: 'Jinja Bus Park', station_address: 'Nkrumah Road, Jinja', featured: 1, image_url: '', description: 'The adventure capital on the source of the Nile.' },
  { name: 'Mbarara', slug: 'mbarara', country: 'Uganda', station_name: 'Mbarara Bus Park', station_address: 'High Street, Mbarara', featured: 0, image_url: '', description: 'Gateway to the western parks and the Rwenzori foothills.' },
  { name: 'Kigali', slug: 'kigali', country: 'Rwanda', station_name: 'Kigali Bus Terminal', station_address: 'KN 3 Avenue, Kigali', featured: 1,    image_url: '/images/kigali.svg', description: 'Rwanda clean, hilly capital and regional crossroads.' },
  { name: 'Musanze', slug: 'musanze', country: 'Rwanda', station_name: 'Musanze Station', station_address: 'Avenue de la Paix, Musanze', featured: 0, image_url: '', description: 'Base for gorilla trekking in Volcanoes National Park.' },
  { name: 'Gisenyi', slug: 'gisenyi', country: 'Rwanda', station_name: 'Gisenyi Lakeside Stop', station_address: 'Lake Kivu Road, Gisenyi', featured: 0, image_url: '', description: 'Lake Kivu resort town on the DRC border.' },
];

const OPERATORS = [
  {
    name: 'Rwenzori Express', slug: 'rwenzori-express', country: 'Uganda', status: 'approved',
    owner_email: 'operator@example.com', commission_percent: 12, rating: 4.6, review_count: 214, featured: 1,
    brand_color: '#0f766e', founded_year: 2012, phone: '+256 700 000 001',
    description: 'Long-distance comfort buses across southern Uganda.',
    amenities: json(['Wi-Fi', 'USB charging', 'Refreshments']),
  },
  {
    name: 'Kigali Connect', slug: 'kigali-connect', country: 'Rwanda', status: 'approved',
    owner_email: 'kigali.ops@example.com', commission_percent: 14, rating: 4.8, review_count: 167, featured: 1,
    brand_color: '#1d4ed8', founded_year: 2016, phone: '+250 780 000 002',
    description: 'Punctual city-to-city coaches across Rwanda.',
    amenities: json(['Wi-Fi', 'USB charging', 'Air conditioning']),
  },
  {
    name: 'Savannah Voyages', slug: 'savannah-voyages', country: 'Uganda & Rwanda', status: 'approved',
    owner_email: 'operator@example.com', commission_percent: 15, rating: 4.4, review_count: 98, featured: 0,
    brand_color: '#b45309', founded_year: 2019, phone: '+256 700 000 003',
    description: 'Overnight cross-border coaches between Kampala and Kigali.',
    amenities: json(['Reclining seats', 'Blankets', 'Refreshments']),
  },
];

const BUSES = [
  { operator_slug: 'rwenzori-express', operator_name: 'Rwenzori Express', owner_email: 'operator@example.com', plate: 'UAT 401K', model: 'Yutong ZK6122', bus_class: 'VIP', seats_total: 45, seat_layout: '2x2', amenities: json(['Wi-Fi', 'USB charging']), status: 'active' },
  { operator_slug: 'rwenzori-express', operator_name: 'Rwenzori Express', owner_email: 'operator@example.com', plate: 'UAF 117H', model: 'Scania Touring', bus_class: 'Standard', seats_total: 49, seat_layout: '2x2', amenities: json(['Air conditioning']), status: 'active' },
  { operator_slug: 'kigali-connect', operator_name: 'Kigali Connect', owner_email: 'kigali.ops@example.com', plate: 'RAB 220Z', model: 'Marcopolo G7', bus_class: 'VIP', seats_total: 41, seat_layout: '2x2', amenities: json(['Wi-Fi', 'USB charging']), status: 'active' },
  { operator_slug: 'savannah-voyages', operator_name: 'Savannah Voyages', owner_email: 'operator@example.com', plate: 'UAK 903J', model: 'Higer CL6', bus_class: 'Executive', seats_total: 35, seat_layout: '2x1', amenities: json(['Reclining seats', 'Blankets']), status: 'active' },
];

const ROUTES = [
  { slug: 'kampala-kigali', origin_slug: 'kampala', destination_slug: 'kigali', origin_city: 'Kampala', destination_city: 'Kigali', distance_km: 520, duration_minutes: 480, crossing_border: 1, border_post: 'Katuna', stops: json(['Mbarara', 'Musanze']), popular: 1, currency: 'UGX', from_price: 45000, image_url: '/images/bus-road.svg', description: 'The flagship cross-border route through the Rwenzori foothills into Kigali.' },
  { slug: 'kampala-entebbe', origin_slug: 'kampala', destination_slug: 'entebbe', origin_city: 'Kampala', destination_city: 'Entebbe', distance_km: 40, duration_minutes: 70, crossing_border: 0, stops: json([]), popular: 1, currency: 'UGX', from_price: 6000, image_url: '', description: 'Frequent airport runs along the lake.' },
  { slug: 'kampala-jinja', origin_slug: 'kampala', destination_slug: 'jinja', origin_city: 'Kampala', destination_city: 'Jinja', distance_km: 80, duration_minutes: 120, crossing_border: 0, stops: json([]), popular: 1, currency: 'UGX', from_price: 12000, image_url: '', description: 'Express service to the source of the Nile.' },
  { slug: 'kampala-mbarara', origin_slug: 'kampala', destination_slug: 'mbarara', origin_city: 'Kampala', destination_city: 'Mbarara', distance_km: 270, duration_minutes: 300, crossing_border: 0, stops: json(['Masaka']), popular: 0, currency: 'UGX', from_price: 35000, image_url: '', description: 'Highway service to the western region.' },
  { slug: 'entebbe-kampala', origin_slug: 'entebbe', destination_slug: 'kampala', origin_city: 'Entebbe', destination_city: 'Kampala', distance_km: 40, duration_minutes: 70, crossing_border: 0, stops: json([]), popular: 0, currency: 'UGX', from_price: 6000, image_url: '', description: 'Return runs from the airport into the city.' },
  { slug: 'kigali-musanze', origin_slug: 'kigali', destination_slug: 'musanze', origin_city: 'Kigali', destination_city: 'Musanze', distance_km: 105, duration_minutes: 120, crossing_border: 0, stops: json([]), popular: 1, currency: 'RWF', from_price: 4000, image_url: '', description: 'Fast coach north to the volcano park.' },
  { slug: 'musanze-kigali', origin_slug: 'musanze', destination_slug: 'kigali', origin_city: 'Musanze', destination_city: 'Kigali', distance_km: 105, duration_minutes: 120, crossing_border: 0, stops: json([]), popular: 0, currency: 'RWF', from_price: 4000, image_url: '', description: 'Return service from Musanze.' },
  { slug: 'kigali-gisenyi', origin_slug: 'kigali', destination_slug: 'gisenyi', origin_city: 'Kigali', destination_city: 'Gisenyi', distance_km: 160, duration_minutes: 180, crossing_border: 0, stops: json(['Musanze']), popular: 1, currency: 'RWF', from_price: 3500, image_url: '', description: 'Lake Kivu getaway on the western route.' },
];

const SCHEDULES = [
  { route_slug: 'kampala-kigali', origin_city: 'Kampala', destination_city: 'Kigali', operator_slug: 'rwenzori-express', operator_name: 'Rwenzori Express', owner_email: 'operator@example.com', departure_time: '07:00', duration_minutes: 480, price: 45000, currency: 'UGX', peak_surcharge_percent: 10, bus_class: 'VIP', seats_total: 45, seat_layout: '2x2', bus_plate: 'UAT 401K' },
  { route_slug: 'kampala-kigali', origin_city: 'Kampala', destination_city: 'Kigali', operator_slug: 'savannah-voyages', operator_name: 'Savannah Voyages', owner_email: 'operator@example.com', departure_time: '21:00', duration_minutes: 510, price: 50000, currency: 'UGX', peak_surcharge_percent: 0, bus_class: 'Executive', seats_total: 35, seat_layout: '2x1', bus_plate: 'UAK 903J' },
  { route_slug: 'kampala-entebbe', origin_city: 'Kampala', destination_city: 'Entebbe', operator_slug: 'rwenzori-express', operator_name: 'Rwenzori Express', owner_email: 'operator@example.com', departure_time: '08:00', duration_minutes: 70, price: 6000, currency: 'UGX', peak_surcharge_percent: 0, bus_class: 'Standard', seats_total: 49, seat_layout: '2x2', bus_plate: 'UAF 117H' },
  { route_slug: 'kampala-entebbe', origin_city: 'Kampala', destination_city: 'Entebbe', operator_slug: 'rwenzori-express', operator_name: 'Rwenzori Express', owner_email: 'operator@example.com', departure_time: '14:00', duration_minutes: 70, price: 6000, currency: 'UGX', peak_surcharge_percent: 0, bus_class: 'Standard', seats_total: 49, seat_layout: '2x2', bus_plate: 'UAF 117H' },
  { route_slug: 'kampala-jinja', origin_city: 'Kampala', destination_city: 'Jinja', operator_slug: 'rwenzori-express', operator_name: 'Rwenzori Express', owner_email: 'operator@example.com', departure_time: '09:30', duration_minutes: 120, price: 12000, currency: 'UGX', peak_surcharge_percent: 5, bus_class: 'VIP', seats_total: 45, seat_layout: '2x2', bus_plate: 'UAT 401K' },
  { route_slug: 'kampala-jinja', origin_city: 'Kampala', destination_city: 'Jinja', operator_slug: 'rwenzori-express', operator_name: 'Rwenzori Express', owner_email: 'operator@example.com', departure_time: '15:00', duration_minutes: 120, price: 12000, currency: 'UGX', peak_surcharge_percent: 0, bus_class: 'Standard', seats_total: 49, seat_layout: '2x2', bus_plate: 'UAF 117H' },
  { route_slug: 'kampala-mbarara', origin_city: 'Kampala', destination_city: 'Mbarara', operator_slug: 'savannah-voyages', operator_name: 'Savannah Voyages', owner_email: 'operator@example.com', departure_time: '08:00', duration_minutes: 300, price: 35000, currency: 'UGX', peak_surcharge_percent: 10, bus_class: 'Executive', seats_total: 35, seat_layout: '2x1', bus_plate: 'UAK 903J' },
  { route_slug: 'kampala-mbarara', origin_city: 'Kampala', destination_city: 'Mbarara', operator_slug: 'savannah-voyages', operator_name: 'Savannah Voyages', owner_email: 'operator@example.com', departure_time: '22:30', duration_minutes: 320, price: 38000, currency: 'UGX', peak_surcharge_percent: 0, bus_class: 'Executive', seats_total: 35, seat_layout: '2x1', bus_plate: 'UAK 903J' },
  { route_slug: 'entebbe-kampala', origin_city: 'Entebbe', destination_city: 'Kampala', operator_slug: 'rwenzori-express', operator_name: 'Rwenzori Express', owner_email: 'operator@example.com', departure_time: '09:00', duration_minutes: 70, price: 6000, currency: 'UGX', peak_surcharge_percent: 0, bus_class: 'Standard', seats_total: 49, seat_layout: '2x2', bus_plate: 'UAF 117H' },
  { route_slug: 'entebbe-kampala', origin_city: 'Entebbe', destination_city: 'Kampala', operator_slug: 'rwenzori-express', operator_name: 'Rwenzori Express', owner_email: 'operator@example.com', departure_time: '17:00', duration_minutes: 90, price: 6000, currency: 'UGX', peak_surcharge_percent: 0, bus_class: 'VIP', seats_total: 45, seat_layout: '2x2', bus_plate: 'UAT 401K' },
  { route_slug: 'kigali-musanze', origin_city: 'Kigali', destination_city: 'Musanze', operator_slug: 'kigali-connect', operator_name: 'Kigali Connect', owner_email: 'kigali.ops@example.com', departure_time: '09:00', duration_minutes: 120, price: 4000, currency: 'RWF', peak_surcharge_percent: 10, bus_class: 'VIP', seats_total: 41, seat_layout: '2x2', bus_plate: 'RAB 220Z' },
  { route_slug: 'kigali-musanze', origin_city: 'Kigali', destination_city: 'Musanze', operator_slug: 'kigali-connect', operator_name: 'Kigali Connect', owner_email: 'kigali.ops@example.com', departure_time: '13:00', duration_minutes: 120, price: 4000, currency: 'RWF', peak_surcharge_percent: 0, bus_class: 'VIP', seats_total: 41, seat_layout: '2x2', bus_plate: 'RAB 220Z' },
  { route_slug: 'kigali-musanze', origin_city: 'Kigali', destination_city: 'Musanze', operator_slug: 'kigali-connect', operator_name: 'Kigali Connect', owner_email: 'kigali.ops@example.com', departure_time: '17:30', duration_minutes: 130, price: 4500, currency: 'RWF', peak_surcharge_percent: 0, bus_class: 'VIP', seats_total: 41, seat_layout: '2x2', bus_plate: 'RAB 220Z' },
  { route_slug: 'musanze-kigali', origin_city: 'Musanze', destination_city: 'Kigali', operator_slug: 'kigali-connect', operator_name: 'Kigali Connect', owner_email: 'kigali.ops@example.com', departure_time: '11:00', duration_minutes: 120, price: 4000, currency: 'RWF', peak_surcharge_percent: 0, bus_class: 'VIP', seats_total: 41, seat_layout: '2x2', bus_plate: 'RAB 220Z' },
  { route_slug: 'musanze-kigali', origin_city: 'Musanze', destination_city: 'Kigali', operator_slug: 'kigali-connect', operator_name: 'Kigali Connect', owner_email: 'kigali.ops@example.com', departure_time: '18:00', duration_minutes: 120, price: 4000, currency: 'RWF', peak_surcharge_percent: 0, bus_class: 'VIP', seats_total: 41, seat_layout: '2x2', bus_plate: 'RAB 220Z' },
  { route_slug: 'kigali-gisenyi', origin_city: 'Kigali', destination_city: 'Gisenyi', operator_slug: 'kigali-connect', operator_name: 'Kigali Connect', owner_email: 'kigali.ops@example.com', departure_time: '10:00', duration_minutes: 180, price: 3500, currency: 'RWF', peak_surcharge_percent: 0, bus_class: 'Standard', seats_total: 41, seat_layout: '2x2', bus_plate: 'RAB 220Z' },
  { route_slug: 'kigali-gisenyi', origin_city: 'Kigali', destination_city: 'Gisenyi', operator_slug: 'kigali-connect', operator_name: 'Kigali Connect', owner_email: 'kigali.ops@example.com', departure_time: '16:00', duration_minutes: 180, price: 3500, currency: 'RWF', peak_surcharge_percent: 0, bus_class: 'Standard', seats_total: 41, seat_layout: '2x2', bus_plate: 'RAB 220Z' },
];

const BANNERS = [
  { title: 'Kampala to Kigali overnighter', subtitle: 'Sleeper coaches every night, arrive rested.', image_url: '/images/hero.svg', cta_label: 'See departures', link_url: '/routes/kampala-kigali', placement: 'home_strip', sort_order: 1, active: 1 },
  { title: 'Lake Kivu escapes', subtitle: 'Kigali to Gisenyi from RWF 3,500.',    image_url: '/images/kigali.svg', cta_label: 'Book now', link_url: '/routes/kigali-gisenyi', placement: 'home_strip', sort_order: 2, active: 1 },
];

const REVIEWS = [
  { operator_slug: 'rwenzori-express', operator_name: 'Rwenzori Express', author_name: 'Amina K.', rating: 5, comment: 'Left on time, spotless bus, and the USB ports actually worked.', route_label: 'Kampala to Kigali', travel_date: '2026-09-12', status: 'published' },
  { operator_slug: 'kigali-connect', operator_name: 'Kigali Connect', author_name: 'Patrick N.', rating: 5, comment: 'Best way to get to the volcanoes. Booked in three taps.', route_label: 'Kigali to Musanze', travel_date: '2026-09-20', status: 'published' },
  { operator_slug: 'savannah-voyages', operator_name: 'Savannah Voyages', author_name: 'Grace U.', rating: 4, comment: 'Comfortable overnight ride. Border crossing was smooth.', route_label: 'Kampala to Kigali', travel_date: '2026-08-30', status: 'published' },
];

const PLATFORM_SETTINGS = [
  { default_commission_percent: 10, cross_border_commission_percent: 15, payout_note: 'Payouts every Monday to registered operator accounts.' },
];

const COUPONS = [
  { code: 'WELCOME10', description: '10% off your first booking', discount_type: 'percent', discount_value: 10, min_amount: 10000, active: 1 },
];

const dayISO = (offset) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

// Demo tickets so the operator "Booked tickets" tab has data on a fresh seed.
// Dates shift with every run, keeping the upcoming/past/cancelled views valid.
const BOOKINGS = [
  {
    booking_ref: 'BLDEMO42', status: 'paid',
    trip_key: `kampala-kigali~rwenzori-express~07:00~${dayISO(7)}`,
    route_slug: 'kampala-kigali', travel_date: dayISO(7),
    origin_city: 'Kampala', destination_city: 'Kigali',
    operator_name: 'Rwenzori Express', operator_slug: 'rwenzori-express', operator_owner_email: 'operator@example.com',
    departure_time: '07:00', duration_minutes: 480, bus_class: 'VIP',
    seats: json([12, 13]), passengers: json([{ name: 'Amina K.' }, { name: 'Peter O.' }]), passenger_count: 2,
    contact_name: 'Amina K.', contact_email: 'amina@example.com', contact_phone: '+256 700 111 222',
    amount: 90000, currency: 'UGX', commission_percent: 12, platform_fee: 10800, operator_net: 79200,
    payment_provider: 'flutterwave', payment_ref: 'BL-DEMO-42', paid_at: now, validated: 0,
  },
  {
    booking_ref: 'BLDEMO77', status: 'paid',
    trip_key: `kigali-musanze~kigali-connect~09:00~${dayISO(3)}`,
    route_slug: 'kigali-musanze', travel_date: dayISO(3),
    origin_city: 'Kigali', destination_city: 'Musanze',
    operator_name: 'Kigali Connect', operator_slug: 'kigali-connect', operator_owner_email: 'kigali.ops@example.com',
    departure_time: '09:00', duration_minutes: 120, bus_class: 'VIP',
    seats: json([5]), passengers: json([{ name: 'Patrick N.' }]), passenger_count: 1,
    contact_name: 'Patrick N.', contact_email: 'patrick@example.com', contact_phone: '+250 780 555 666',
    amount: 4000, currency: 'RWF', commission_percent: 14, platform_fee: 560, operator_net: 3440,
    payment_provider: 'flutterwave', payment_ref: 'BL-DEMO-77', paid_at: now, validated: 0,
  },
  {
    booking_ref: 'BLDEMO19', status: 'paid',
    trip_key: `kampala-entebbe~rwenzori-express~08:00~${dayISO(-14)}`,
    route_slug: 'kampala-entebbe', travel_date: dayISO(-14),
    origin_city: 'Kampala', destination_city: 'Entebbe',
    operator_name: 'Rwenzori Express', operator_slug: 'rwenzori-express', operator_owner_email: 'operator@example.com',
    departure_time: '08:00', duration_minutes: 70, bus_class: 'Standard',
    seats: json([7]), passengers: json([{ name: 'Grace U.' }]), passenger_count: 1,
    contact_name: 'Grace U.', contact_email: 'grace@example.com', contact_phone: '+256 700 333 444',
    amount: 6000, currency: 'UGX', commission_percent: 12, platform_fee: 720, operator_net: 5280,
    payment_provider: 'flutterwave', payment_ref: 'BL-DEMO-19', paid_at: now,
    validated: 1, validated_at: now, validated_by: 'Rwenzori Express',
  },
  {
    booking_ref: 'BLDEMO63', status: 'cancelled',
    trip_key: `kampala-kigali~savannah-voyages~21:00~${dayISO(2)}`,
    route_slug: 'kampala-kigali', travel_date: dayISO(2),
    origin_city: 'Kampala', destination_city: 'Kigali',
    operator_name: 'Savannah Voyages', operator_slug: 'savannah-voyages', operator_owner_email: 'operator@example.com',
    departure_time: '21:00', duration_minutes: 510, bus_class: 'Executive',
    seats: json([21]), passengers: json([{ name: 'Joseph M.' }]), passenger_count: 1,
    contact_name: 'Joseph M.', contact_email: 'joseph@example.com', contact_phone: '+256 700 999 888',
    amount: 50000, currency: 'UGX', commission_percent: 15, platform_fee: 7500, operator_net: 42500,
    payment_provider: 'flutterwave', payment_ref: 'BL-DEMO-63', paid_at: now,
    validated: 0, cancelled_at: now,
  },
];

async function seed() {
  console.log('[seed] Seeding database...');

  ensureUser({ email: 'admin@example.com', name: 'Platform Admin', role: 'admin' });
  ensureUser({ email: 'operator@example.com', name: 'Savannah Ops', role: 'operator' });
  ensureUser({ email: 'kigali.ops@example.com', name: 'Kigali Ops', role: 'operator' });

  for (const table of ['departure_seat', 'booking', 'coupon', 'review', 'banner', 'schedule', 'bus', 'route', 'operator', 'city', 'platform_setting']) {
    clearTable(table);
  }

  for (const city of CITIES) insert('city', { ...city, id: newId(), created_date: now });
  for (const operator of OPERATORS) insert('operator', { ...operator, id: newId(), created_date: now });
  for (const bus of BUSES) insert('bus', { ...bus, id: newId(), created_date: now });
  for (const route of ROUTES) insert('route', { ...route, id: newId(), created_date: now });
  for (const schedule of SCHEDULES) {
    insert('schedule', {
      ...schedule,
      operator_status: 'approved',
      amenities: json(['Wi-Fi', 'USB charging']),
      active: 1,
      id: newId(),
      created_date: now,
    });
  }
  for (const banner of BANNERS) insert('banner', { ...banner, id: newId(), created_date: now });
  for (const review of REVIEWS) insert('review', { ...review, id: newId(), created_date: now });
  for (const setting of PLATFORM_SETTINGS) insert('platform_setting', { ...setting, id: newId(), created_date: now });
  for (const coupon of COUPONS) insert('coupon', { ...coupon, id: newId(), created_date: now });
  for (const booking of BOOKINGS) insert('booking', { ...booking, id: newId(), created_date: now });

  console.log(`[seed] Done - ${CITIES.length} cities, ${ROUTES.length} routes, ${SCHEDULES.length} schedules, ${OPERATORS.length} operators.`);
  console.log('[seed] Seeded roles in app_user: admin@example.com (admin), operator@example.com and kigali.ops@example.com (operator).');
}

seed()
  .then(() => {
    console.log('[seed] Closing database.');
    sqlite.close();
  })
  .catch((error) => {
    console.error('[seed] Failed:', error);
    process.exitCode = 1;
  });
