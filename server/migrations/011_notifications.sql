CREATE TABLE IF NOT EXISTS notification (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_date TEXT
);

CREATE INDEX IF NOT EXISTS idx_notification_user ON notification(user_id, read, created_date);
