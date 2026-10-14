import express from 'express';
import { sqlite } from './db.js';
import { HttpError } from './entities.js';
import { discountFor } from './booking.js';

const todayISO = () => new Date().toISOString().slice(0, 10);

export function createCouponsRouter() {
  const router = express.Router();

  router.post('/validate', (req, res) => {
    const { code, amount, currency } = req.body || {};
    const trimmed = String(code || '').trim();
    if (!trimmed) throw new HttpError(400, 'Enter a coupon code.');

    const coupon = sqlite.prepare('SELECT * FROM coupon WHERE UPPER(code) = UPPER(?)').get(trimmed);
    if (!coupon || !coupon.active) throw new HttpError(400, 'We cannot apply that code.');
    if (coupon.expires_at && coupon.expires_at < todayISO()) throw new HttpError(400, 'That code has expired.');

    const gross = Number(amount) || 0;
    if (coupon.min_amount && gross < Number(coupon.min_amount)) {
      const cur = currency || coupon.currency || '';
      throw new HttpError(400, `That code needs a booking of at least ${coupon.min_amount}${cur ? ` ${cur}` : ''}.`);
    }
    if (coupon.currency && currency && coupon.currency !== currency) {
      throw new HttpError(400, 'That code cannot be used for this currency.');
    }

    res.json({
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      discount: discountFor(coupon, gross),
    });
  });

  return router;
}
