ALTER TABLE booking ADD COLUMN group_ref TEXT;

CREATE INDEX IF NOT EXISTS idx_booking_group_ref ON booking (group_ref);
