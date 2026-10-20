import express from 'express';
import { randomUUID } from 'node:crypto';
import { sqlite } from './db.js';
import { getCaller } from './auth.js';
import { HttpError } from './entities.js';

export function createNotification({ userId, type, title, message, link }) {
  if (!userId) return null;
  const id = randomUUID();
  const now = new Date().toISOString();
  sqlite
    .prepare('INSERT INTO notification (id, user_id, type, title, message, link, read, created_date) VALUES (?, ?, ?, ?, ?, ?, 0, ?)')
    .run(id, userId, type, title, message, link || null, now);
  return { id, user_id: userId, type, title, message, link: link || null, read: 0, created_date: now };
}

function userIdForEmail(email) {
  if (!email) return null;
  const row = sqlite.prepare('SELECT id FROM user WHERE lower(email) = lower(?) LIMIT 1').get(String(email).trim());
  return row?.id || null;
}

function adminUserIds() {
  return sqlite.prepare("SELECT id FROM user WHERE role = 'admin'").all().map((row) => row.id);
}

function money(booking) {
  const value = Number(booking.amount) || 0;
  return `${booking.currency || 'UGX'} ${value.toLocaleString('en-US')}`;
}

function seatCount(booking) {
  try {
    const seats = JSON.parse(booking.seats || '[]');
    return Array.isArray(seats) && seats.length ? seats.length : Number(booking.passenger_count) || 1;
  } catch {
    return Number(booking.passenger_count) || 1;
  }
}

const STAFF_EVENTS = {
  confirmed: { type: 'booking_new', title: 'New booking' },
  cancelled: { type: 'booking_cancelled', title: 'Booking cancelled' },
  refunded: { type: 'refund_processed', title: 'Refund completed' },
  refund_pending: { type: 'refund_pending', title: 'Refund pending' },
};

export function notifyBookingStaff(booking, event) {
  if (!booking) return [];
  const meta = STAFF_EVENTS[event];
  if (!meta) return [];
  const summary = `${booking.booking_ref} · ${booking.origin_city || '—'} → ${booking.destination_city || '—'} · ${booking.travel_date || '—'} · ${seatCount(booking)} seat(s) · ${money(booking)}`;

  const targets = new Map();
  const operatorUserId = userIdForEmail(booking.operator_owner_email);
  if (operatorUserId) targets.set(operatorUserId, '/operator');
  for (const adminId of adminUserIds()) {
    if (!targets.has(adminId)) targets.set(adminId, '/admin');
  }

  const created = [];
  for (const [userId, link] of targets) {
    const row = createNotification({
      userId,
      type: meta.type,
      title: meta.title,
      message: summary,
      link,
    });
    if (row) created.push(row);
  }
  return created;
}

function serializeNotification(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type,
    title: row.title,
    message: row.message,
    link: row.link || null,
    read: Boolean(row.read),
    created_date: row.created_date,
  };
}

export function createNotificationsRouter() {
  const router = express.Router();

  router.use(async (req, res, next) => {
    try {
      req.caller = await getCaller(req);
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get('/', async (req, res) => {
    if (!req.caller) throw new HttpError(401, 'Sign in required');
    const unreadOnly = req.query.unread === 'true';
    const limit = Math.min(Number(req.query.limit) || 50, 100);

    let sql = 'SELECT * FROM notification WHERE user_id = ?';
    const params = [req.caller.id];
    if (unreadOnly) sql += ' AND read = 0';
    sql += ' ORDER BY created_date DESC LIMIT ?';
    params.push(limit);

    const rows = sqlite.prepare(sql).all(...params);
    res.json({ items: rows.map(serializeNotification), count: rows.length });
  });

  router.get('/unread-count', async (req, res) => {
    if (!req.caller) throw new HttpError(401, 'Sign in required');
    const row = sqlite
      .prepare('SELECT COUNT(*) AS count FROM notification WHERE user_id = ? AND read = 0')
      .get(req.caller.id);
    res.json({ count: Number(row?.count) || 0 });
  });

  router.post('/:id/read', async (req, res) => {
    if (!req.caller) throw new HttpError(401, 'Sign in required');
    const id = String(req.params.id || '');
    const existing = sqlite.prepare('SELECT * FROM notification WHERE id = ?').get(id);
    if (!existing) throw new HttpError(404, 'Notification not found');
    if (existing.user_id !== req.caller.id) throw new HttpError(403, 'Not your notification');
    sqlite.prepare('UPDATE notification SET read = 1 WHERE id = ?').run(id);
    res.json({ success: true });
  });

  router.post('/read-all', async (req, res) => {
    if (!req.caller) throw new HttpError(401, 'Sign in required');
    sqlite.prepare('UPDATE notification SET read = 1 WHERE user_id = ?').run(req.caller.id);
    res.json({ success: true });
  });

  return router;
}
