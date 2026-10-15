import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { getCaller, googleEnabled } from './auth.js';
import { createEntityRouter, HttpError } from './entities.js';
import { createPaymentsRouter } from './payments.js';
import { createCouponsRouter } from './coupons.js';
import { createAdminRouter } from './admin.js';
import { createSeatsRouter } from './seats.js';
import { sweepExpiredHolds } from './booking.js';
import { runRefundQueue } from './payments.js';
import { sendDepartureReminder } from './notifications.js';
import { sqlite } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;

const app = express();
app.disable('x-powered-by');

app.use(express.json());

app.get('/api/config', (req, res) => {
  res.json({
    google: googleEnabled,
    flutterwavePublicKey: process.env.FLW_PUBLIC_KEY || '',
  });
});

app.get('/api/me', async (req, res) => {
  const caller = await getCaller(req);
  if (!caller) return res.status(401).json({ error: 'Not signed in' });
  res.json({ id: caller.id, email: caller.email, role: caller.role, full_name: caller.name });
});

app.get('/api/health', (req, res) => {
  try {
    sqlite.prepare('SELECT 1').get();
    res.json({ ok: true, time: new Date().toISOString() });
  } catch {
    res.status(500).json({ ok: false });
  }
});

app.use('/api/entities', createEntityRouter());
app.use('/api/payments', createPaymentsRouter());
app.use('/api/coupons', createCouponsRouter());
app.use('/api/admin', createAdminRouter());
app.use('/api/seats', createSeatsRouter());

// Unknown /api routes → 404 JSON (never the SPA).
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Production build, if present.
const dist = path.join(__dirname, '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    return res.sendFile(path.join(dist, 'index.html'));
  });
}

 
app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
   
  console.error('[server]', err);
  return res.status(500).json({ error: 'Internal server error' });
});

function tomorrowISO() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function runDepartureReminders() {
  try {
    const rows = sqlite
      .prepare(
        `SELECT * FROM booking
          WHERE travel_date = ? AND status = 'paid' AND COALESCE(reminder_sent, 0) = 0`,
      )
      .all(tomorrowISO());
    for (const booking of rows) {
      sqlite.prepare('UPDATE booking SET reminder_sent = 1 WHERE id = ?').run(booking.id);
      void sendDepartureReminder(booking);
    }
  } catch (error) {
    console.error('[server] Departure reminder run failed:', error);
  }
}

const REMINDER_INTERVAL_MS = 60 * 60 * 1000;
setInterval(() => {
  runDepartureReminders();
  runRefundQueue().catch((error) => {
    console.error('[server] Refund queue run failed:', error);
  });
}, REMINDER_INTERVAL_MS);
runDepartureReminders();
runRefundQueue().catch((error) => {
  console.error('[server] Refund queue run failed:', error);
});

const HOLD_SWEEP_INTERVAL_MS = 60 * 1000;
setInterval(() => {
  try {
    sweepExpiredHolds();
  } catch (error) {
    console.error('[server] Seat hold sweep failed:', error);
  }
}, HOLD_SWEEP_INTERVAL_MS);

app.listen(PORT, () => {
  console.log(`[server] API listening on http://localhost:${PORT}`);
  if (!googleEnabled) {
    console.log('[server] Google sign-in disabled (set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET to enable).');
  }
  if (!process.env.FLW_SECRET_KEY || !process.env.FLW_PUBLIC_KEY) {
    console.log('[server] Flutterwave keys not set — online payments disabled (FLW_PUBLIC_KEY / FLW_SECRET_KEY).');
  }
});
