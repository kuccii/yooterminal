CREATE TABLE IF NOT EXISTS site_content (
  id TEXT PRIMARY KEY NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  created_date TEXT,
  created_by_id TEXT
);

CREATE TABLE IF NOT EXISTS site_faq (
  id TEXT PRIMARY KEY NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  sort_order REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_date TEXT,
  created_by_id TEXT
);

CREATE TABLE IF NOT EXISTS site_feature (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  sort_order REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_date TEXT,
  created_by_id TEXT
);
