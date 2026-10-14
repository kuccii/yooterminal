ALTER TABLE booking ADD COLUMN refund_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE booking ADD COLUMN refund_next_attempt_at INTEGER;
