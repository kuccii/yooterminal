ALTER TABLE coupon ADD COLUMN operator_slug TEXT;
ALTER TABLE coupon ADD COLUMN operator_owner_email TEXT;
ALTER TABLE coupon ADD COLUMN max_redemptions REAL;
CREATE INDEX IF NOT EXISTS idx_coupon_code ON coupon(code);
