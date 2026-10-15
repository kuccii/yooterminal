CREATE TABLE IF NOT EXISTS app_user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clerk_id TEXT,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user',
  created_date TEXT NOT NULL,
  updated_date TEXT
);
CREATE INDEX IF NOT EXISTS idx_app_user_clerk_id ON app_user(clerk_id);
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS account;
DROP TABLE IF EXISTS verification;
