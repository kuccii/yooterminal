CREATE TABLE IF NOT EXISTS notification_outbox (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  html TEXT,
  template TEXT,
  template_params TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER,
  last_error TEXT,
  dedupe_key TEXT,
  created_date TEXT,
  sent_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_dedupe ON notification_outbox(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outbox_due ON notification_outbox(status, next_attempt_at);
