CREATE TABLE IF NOT EXISTS blocked_seat (
  id TEXT PRIMARY KEY,
  trip_key TEXT NOT NULL,
  travel_date TEXT NOT NULL,
  route_slug TEXT,
  operator_slug TEXT,
  departure_time TEXT,
  seat_label TEXT NOT NULL,
  note TEXT,
  created_date TEXT,
  created_by_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_blocked_seat_trip ON blocked_seat(trip_key, travel_date);
