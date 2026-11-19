import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { sqlite } from './db.js';
import { getCaller } from './auth.js';
import { HttpError } from './entities.js';
import { writeAuditLog } from './audit.js';
import { attemptRefund } from './payments.js';
import { listAppUsers, setUserRole } from './roles.js';
import { UPLOADS_DIR, removeStoredImage, uploadImage } from './uploads.js';

const UPLOAD_NAME_PATTERN = /^[0-9a-fA-F-]{16,}\.(jpg|png|webp|svg)$/;

const IMAGE_REFERENCE_CHECKS = [
  'SELECT 1 FROM site_content WHERE value LIKE ? LIMIT 1',
  'SELECT 1 FROM banner WHERE image_url LIKE ? LIMIT 1',
  'SELECT 1 FROM route WHERE image_url LIKE ? LIMIT 1',
  'SELECT 1 FROM city WHERE image_url LIKE ? LIMIT 1',
  'SELECT 1 FROM app_user WHERE logo_path LIKE ? LIMIT 1',
];

function isImageReferenced(filename) {
  const pattern = `%${filename}%`;
  return IMAGE_REFERENCE_CHECKS.some((sql) => Boolean(sqlite.prepare(sql).get(pattern)));
}

async function requireAdmin(req) {
  const caller = await getCaller(req);
  if (!caller) throw new HttpError(401, 'Sign in required');
  if (caller.role !== 'admin') throw new HttpError(403, 'Admin access only');
  return caller;
}

export function createAdminRouter() {
  const router = express.Router();

  router.get('/users', async (req, res) => {
    await requireAdmin(req);
    res.json({ users: listAppUsers(sqlite) });
  });

  router.patch('/users/:id/role', async (req, res) => {
    const caller = await requireAdmin(req);

    const result = setUserRole(sqlite, {
      userId: req.params.id,
      role: String((req.body || {}).role || ''),
      actorId: caller.id,
    });

    if (result.before !== result.role) {
      writeAuditLog({
        actorId: caller.id,
        action: 'user.role_change',
        entity: 'user',
        entityId: result.id,
        before: { role: result.before },
        after: { role: result.role },
      });
    }

    res.json({ id: result.id, email: result.email, name: result.name, role: result.role });
  });

  router.get('/refunds', async (req, res) => {
    await requireAdmin(req);

    const rows = sqlite
      .prepare(
        `SELECT id, booking_ref, status, refund_status, refund_attempts, refund_next_attempt_at,
                amount, currency, travel_date, origin_city, destination_city, operator_name,
                contact_name, contact_email, payment_tx_id, cancelled_at
           FROM booking
          WHERE refund_status IS NOT NULL AND refund_status != ''
          ORDER BY cancelled_at DESC
          LIMIT 200`,
      )
      .all();

    res.json({
      refunds: rows.map((row) => ({
        id: row.id,
        booking_ref: row.booking_ref,
        status: row.status,
        refund_status: row.refund_status,
        refund_attempts: Number(row.refund_attempts) || 0,
        refund_next_attempt_at: row.refund_next_attempt_at === null ? null : Number(row.refund_next_attempt_at),
        amount: Number(row.amount),
        currency: row.currency,
        travel_date: row.travel_date,
        origin_city: row.origin_city,
        destination_city: row.destination_city,
        operator_name: row.operator_name,
        contact_name: row.contact_name,
        contact_email: row.contact_email,
        payment_tx_id: row.payment_tx_id,
        cancelled_at: row.cancelled_at,
      })),
    });
  });

  router.post('/refunds/:id/retry', async (req, res) => {
    const caller = await requireAdmin(req);

    const bookingId = String(req.params.id || '');
    const booking = sqlite.prepare('SELECT * FROM booking WHERE id = ?').get(bookingId);
    if (!booking) throw new HttpError(404, 'Booking not found');
    if (booking.refund_status !== 'refund_pending') {
      throw new HttpError(409, 'This booking has no pending refund');
    }

    const refundStatus = await attemptRefund(booking);
    writeAuditLog({
      actorId: caller.id,
      action: 'refund.admin_retry',
      entity: 'booking',
      entityId: booking.id,
      before: { refund_status: booking.refund_status },
      after: { refund_status: refundStatus },
    });

    res.json({ id: booking.id, booking_ref: booking.booking_ref, refund_status: refundStatus });
  });

  router.get('/uploads', async (req, res) => {
    await requireAdmin(req);

    let names = [];
    if (fs.existsSync(UPLOADS_DIR)) {
      names = fs.readdirSync(UPLOADS_DIR).filter((name) => UPLOAD_NAME_PATTERN.test(name));
    }

    const items = names
      .map((name) => {
        const stat = fs.statSync(path.join(UPLOADS_DIR, name));
        return { filename: name, url: `/uploads/${name}`, size: stat.size, modified_at: stat.mtime.toISOString() };
      })
      .sort((a, b) => (a.modified_at < b.modified_at ? 1 : -1));

    res.json({ items });
  });

  router.post('/uploads', async (req, res) => {
    const caller = await requireAdmin(req);

    const url = uploadImage(req.body);
    writeAuditLog({
      actorId: caller.id,
      action: 'upload.create',
      entity: 'upload',
      entityId: url,
      before: null,
      after: { url },
    });

    res.json({ url });
  });

  router.delete('/uploads/:filename', async (req, res) => {
    const caller = await requireAdmin(req);

    const filename = path.basename(String(req.params.filename || ''));
    if (!UPLOAD_NAME_PATTERN.test(filename)) throw new HttpError(400, 'Invalid image name.');
    const target = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(target)) throw new HttpError(404, 'Image not found');
    if (isImageReferenced(filename)) throw new HttpError(409, 'This image is still used on the site.');

    removeStoredImage(filename);
    writeAuditLog({
      actorId: caller.id,
      action: 'upload.delete',
      entity: 'upload',
      entityId: `/uploads/${filename}`,
      before: { url: `/uploads/${filename}` },
      after: null,
    });

    res.json({ success: true });
  });

  return router;
}
