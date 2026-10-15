import express from 'express';
import { sqlite } from './db.js';
import { HttpError } from './entities.js';
import { assertCouponUsable, discountFor } from './booking.js';

const todayISO = () => new Date().toISOString().slice(0, 10);

export function findCouponForCart(code, operatorSlugs) {
  const rows = sqlite.prepare('SELECT * FROM coupon WHERE UPPER(code) = UPPER(?)').all(code);
  if (!rows.length) return null;
  const slugs = (operatorSlugs || []).filter(Boolean);
  if (slugs.length === 1) {
    return rows.find((row) => row.operator_slug && row.operator_slug === slugs[0])
      || rows.find((row) => !row.operator_slug)
      || null;
  }
  return rows.find((row) => !row.operator_slug) || null;
}

export function countCouponRedemptions(code, operatorSlug) {
  const row = operatorSlug
    ? sqlite
        .prepare("SELECT COUNT(*) AS n FROM booking WHERE UPPER(coupon_code) = UPPER(?) AND status = 'paid' AND operator_slug = ?")
        .get(code, operatorSlug)
    : sqlite
        .prepare("SELECT COUNT(*) AS n FROM booking WHERE UPPER(coupon_code) = UPPER(?) AND status = 'paid'")
        .get(code);
  return Number(row?.n) || 0;
}

export function createCouponsRouter() {
  const router = express.Router();

  router.post('/validate', (req, res) => {
    const { code, amount, currency, operator_slugs } = req.body || {};
    const trimmed = String(code || '').trim();
    if (!trimmed) throw new HttpError(400, 'Enter a coupon code.');

    const slugs = Array.isArray(operator_slugs)
      ? operator_slugs.map((slug) => String(slug || '').trim()).filter(Boolean)
      : [];
    const coupon = findCouponForCart(trimmed, slugs);
    if (!coupon) throw new HttpError(400, 'We cannot apply that code.');

    const gross = Number(amount) || 0;
    if (coupon.min_amount && gross < Number(coupon.min_amount)) {
      const cur = currency || coupon.currency || '';
      throw new HttpError(400, `That code needs a booking of at least ${coupon.min_amount}${cur ? ` ${cur}` : ''}.`);
    }

    const used = countCouponRedemptions(coupon.code, coupon.operator_slug || null);
    assertCouponUsable(coupon, gross, todayISO(), { used, currency: currency || '' });

    res.json({
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      discount: discountFor(coupon, gross),
    });
  });

  return router;
}
