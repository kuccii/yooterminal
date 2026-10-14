import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const dbPath = path.join(DATA_DIR, 'app.db');

export const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// SQLite REGEXP hook backing the generic $regex filter in entities.js.
// The pattern param is JSON-encoded ({ pattern, flags }) when it comes from
// buildWhere; anything else is treated as a plain literal pattern.
sqlite.function('regexp', { deterministic: true }, (pattern, value) => {
  if (value === null || value === undefined) return 0;
  let source = String(pattern ?? '');
  let flags = '';
  try {
    const parsed = JSON.parse(source);
    if (parsed && typeof parsed === 'object') {
      source = String(parsed.pattern ?? '');
      flags = typeof parsed.flags === 'string' ? parsed.flags.replace(/[^imsuy]/g, '') : '';
    }
  } catch {
    // not JSON — use the raw pattern as-is
  }
  try {
    return new RegExp(source, flags).test(String(value)) ? 1 : 0;
  } catch {
    return 0;
  }
});

// ---------------------------------------------------------------------------
// Better Auth core schema (official SQLite dialect)
// ---------------------------------------------------------------------------
sqlite.exec(`
CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY NOT NULL,
  expiresAt INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY NOT NULL,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  accessTokenExpiresAt INTEGER,
  refreshTokenExpiresAt INTEGER,
  scope TEXT,
  idToken TEXT,
  password TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY NOT NULL,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
`);

// ---------------------------------------------------------------------------
// Application tables — one per Base44 entity schema, plus Base44-style
// bookkeeping columns (id, created_date, created_by_id) the frontend relies on.
// Column kinds: text | number | boolean | json
// ---------------------------------------------------------------------------
const APP_TABLES = {
  banner: `
    CREATE TABLE IF NOT EXISTS banner (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT,
      image_url TEXT,
      cta_label TEXT,
      link_url TEXT,
      placement TEXT NOT NULL DEFAULT 'home_strip',
      sort_order REAL NOT NULL DEFAULT 0,
      starts_at TEXT,
      ends_at TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_date TEXT,
      created_by_id TEXT
    )`,
  booking: `
    CREATE TABLE IF NOT EXISTS booking (
      id TEXT PRIMARY KEY NOT NULL,
      booking_ref TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'paid',
      trip_key TEXT NOT NULL,
      route_slug TEXT,
      travel_date TEXT NOT NULL,
      origin_city TEXT,
      destination_city TEXT,
      operator_name TEXT,
      operator_slug TEXT,
      operator_owner_email TEXT,
      departure_time TEXT,
      duration_minutes REAL,
      bus_class TEXT,
      seats TEXT,
      passengers TEXT,
      passenger_count REAL,
      contact_name TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      amount REAL,
      currency TEXT,
      coupon_code TEXT,
      discount_amount REAL,
      commission_percent REAL,
      platform_fee REAL,
      operator_net REAL,
      payment_provider TEXT DEFAULT 'flutterwave',
      payment_ref TEXT,
      payment_tx_id TEXT,
      paid_at TEXT,
      validated INTEGER NOT NULL DEFAULT 0,
      validated_at TEXT,
      validated_by TEXT,
      cancelled_at TEXT,
      created_date TEXT,
      created_by_id TEXT
    )`,
  bus: `
    CREATE TABLE IF NOT EXISTS bus (
      id TEXT PRIMARY KEY NOT NULL,
      operator_slug TEXT NOT NULL,
      operator_name TEXT,
      owner_email TEXT,
      plate TEXT NOT NULL,
      model TEXT,
      bus_class TEXT,
      seats_total REAL,
      seat_layout TEXT NOT NULL DEFAULT '2x2',
      amenities TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      created_date TEXT,
      created_by_id TEXT
    )`,
  city: `
    CREATE TABLE IF NOT EXISTS city (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      country TEXT NOT NULL,
      station_name TEXT,
      station_address TEXT,
      description TEXT,
      image_url TEXT,
      featured INTEGER NOT NULL DEFAULT 0,
      created_date TEXT,
      created_by_id TEXT
    )`,
  coupon: `
    CREATE TABLE IF NOT EXISTS coupon (
      id TEXT PRIMARY KEY NOT NULL,
      code TEXT NOT NULL,
      description TEXT,
      discount_type TEXT NOT NULL DEFAULT 'percent',
      discount_value REAL NOT NULL,
      min_amount REAL,
      currency TEXT,
      expires_at TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_date TEXT,
      created_by_id TEXT
    )`,
  departure_seat: `
    CREATE TABLE IF NOT EXISTS departure_seat (
      id TEXT PRIMARY KEY NOT NULL,
      trip_key TEXT NOT NULL,
      travel_date TEXT NOT NULL,
      route_slug TEXT,
      operator_slug TEXT,
      operator_name TEXT,
      departure_time TEXT,
      seats TEXT NOT NULL,
      seat_count REAL,
      created_date TEXT,
      created_by_id TEXT
    )`,
  operator: `
    CREATE TABLE IF NOT EXISTS operator (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      country TEXT,
      description TEXT,
      brand_color TEXT,
      fleet TEXT,
      founded_year REAL,
      phone TEXT,
      amenities TEXT,
      rating REAL,
      review_count REAL,
      featured INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      commission_percent REAL,
      owner_email TEXT,
      created_date TEXT,
      created_by_id TEXT
    )`,
  platform_setting: `
    CREATE TABLE IF NOT EXISTS platform_setting (
      id TEXT PRIMARY KEY NOT NULL,
      default_commission_percent REAL,
      cross_border_commission_percent REAL,
      payout_note TEXT,
      created_date TEXT,
      created_by_id TEXT
    )`,
  review: `
    CREATE TABLE IF NOT EXISTS review (
      id TEXT PRIMARY KEY NOT NULL,
      operator_slug TEXT NOT NULL,
      operator_name TEXT,
      author_name TEXT,
      rating REAL NOT NULL,
      comment TEXT NOT NULL,
      route_label TEXT,
      travel_date TEXT,
      status TEXT NOT NULL DEFAULT 'published',
      created_date TEXT,
      created_by_id TEXT
    )`,
  route: `
    CREATE TABLE IF NOT EXISTS route (
      id TEXT PRIMARY KEY NOT NULL,
      slug TEXT NOT NULL,
      origin_city TEXT NOT NULL,
      destination_city TEXT NOT NULL,
      origin_slug TEXT,
      destination_slug TEXT,
      distance_km REAL,
      duration_minutes REAL,
      crossing_border INTEGER NOT NULL DEFAULT 0,
      border_post TEXT,
      stops TEXT,
      description TEXT,
      image_url TEXT,
      from_price REAL,
      currency TEXT,
      popular INTEGER NOT NULL DEFAULT 0,
      created_date TEXT,
      created_by_id TEXT
    )`,
  schedule: `
    CREATE TABLE IF NOT EXISTS schedule (
      id TEXT PRIMARY KEY NOT NULL,
      route_slug TEXT NOT NULL,
      origin_city TEXT,
      destination_city TEXT,
      operator_name TEXT,
      operator_slug TEXT NOT NULL,
      owner_email TEXT,
      operator_status TEXT NOT NULL DEFAULT 'approved',
      departure_time TEXT NOT NULL,
      duration_minutes REAL,
      price REAL NOT NULL,
      currency TEXT,
      peak_surcharge_percent REAL NOT NULL DEFAULT 0,
      bus_class TEXT,
      seats_total REAL,
      seat_layout TEXT NOT NULL DEFAULT '2x2',
      bus_plate TEXT,
      amenities TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_date TEXT,
      created_by_id TEXT
    )`,
};

for (const ddl of Object.values(APP_TABLES)) {
  sqlite.exec(ddl);
}

sqlite.exec(`
CREATE INDEX IF NOT EXISTS idx_departure_seat_trip ON departure_seat(trip_key, travel_date);
CREATE INDEX IF NOT EXISTS idx_booking_trip ON booking(trip_key, travel_date, status);
CREATE INDEX IF NOT EXISTS idx_booking_ref ON booking(booking_ref);
CREATE INDEX IF NOT EXISTS idx_schedule_lookup ON schedule(route_slug, operator_slug, departure_time);
CREATE INDEX IF NOT EXISTS idx_bus_operator ON bus(operator_slug);
CREATE INDEX IF NOT EXISTS idx_operator_slug ON operator(slug);
`);
