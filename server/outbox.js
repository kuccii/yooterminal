import { randomUUID } from 'node:crypto';
import { sqlite } from './db.js';
import { sendMailSafe } from './mailer.js';
import { whatsappConfigured, sendTemplateMessage } from './whatsapp.js';
import {
  buildBookingConfirmation,
  buildCancellation,
  buildDepartureReminder,
  buildTicketTemplateParams,
} from './notifications.js';

const BACKOFF_MINUTES = [2, 10, 30, 120];
const MAX_ATTEMPTS = 5;

function insertRow({ channel, recipient, subject = null, body = null, html = null, template = null, templateParams = null, dedupeKey = null }) {
  const id = randomUUID();
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO notification_outbox
         (id, channel, recipient, subject, body, html, template, template_params, status, attempts, next_attempt_at, last_error, dedupe_key, created_date, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, NULL, NULL, ?, ?, NULL)`,
    )
    .run(
      id,
      channel,
      recipient,
      subject || null,
      body || null,
      html || null,
      template || null,
      templateParams ? JSON.stringify(templateParams) : null,
      dedupeKey || null,
      now,
    );
  return id;
}

export function queueEmail({ to, subject, text, html, dedupeKey }) {
  if (!to) return null;
  return insertRow({
    channel: 'email',
    recipient: String(to),
    subject,
    body: text,
    html,
    dedupeKey,
  });
}

export function queueWhatsApp({ to, template = null, params = [], dedupeKey = null }) {
  if (!to) return null;
  if (!whatsappConfigured()) {
    console.warn(`[outbox] WhatsApp to ${to} not queued - credentials are not set.`);
    return null;
  }
  return insertRow({
    channel: 'whatsapp',
    recipient: String(to),
    template: template || process.env.WHATSAPP_TEMPLATE_NAME || 'ticket_receipt',
    templateParams: params,
    dedupeKey,
  });
}

export function queueBookingReceipt(booking) {
  if (!booking) return [];
  const message = buildBookingConfirmation(booking);
  const queued = [
    queueEmail({
      to: booking.contact_email,
      subject: message.subject,
      text: message.text,
      html: message.html,
      dedupeKey: `receipt:${booking.booking_ref}:email`,
    }),
  ];
  const whatsapp = queueWhatsApp({
    to: booking.contact_phone,
    params: buildTicketTemplateParams(booking),
    dedupeKey: `receipt:${booking.booking_ref}:whatsapp`,
  });
  if (whatsapp) queued.push(whatsapp);
  return queued.filter(Boolean);
}

export function queueCancellationNotice(booking) {
  if (!booking) return null;
  const message = buildCancellation(booking);
  return queueEmail({
    to: booking.contact_email,
    subject: message.subject,
    text: message.text,
    html: message.html,
    dedupeKey: `cancel:${booking.booking_ref}:email`,
  });
}

export function queueDepartureReminder(booking) {
  if (!booking) return null;
  const message = buildDepartureReminder(booking);
  return queueEmail({
    to: booking.contact_email,
    subject: message.subject,
    text: message.text,
    html: message.html,
    dedupeKey: `reminder:${booking.booking_ref}:email`,
  });
}

async function dispatch(row) {
  if (row.channel === 'email') {
    const ok = await sendMailSafe({
      to: row.recipient,
      subject: row.subject || '',
      text: row.body || '',
      html: row.html || undefined,
    });
    return ok ? { ok: true } : { ok: false, error: 'SMTP delivery failed or is not configured' };
  }
  if (row.channel === 'whatsapp') {
    let params = [];
    try {
      params = JSON.parse(row.template_params || '[]');
    } catch {
      params = [];
    }
    return sendTemplateMessage({ to: row.recipient, template: row.template, params });
  }
  return { ok: false, error: `Unknown channel ${row.channel}` };
}

export async function runOutbox(limit = 20) {
  const now = Date.now();
  const due = sqlite
    .prepare(
      `SELECT * FROM notification_outbox
        WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
        ORDER BY created_date ASC LIMIT ?`,
    )
    .all(now, limit);

  let sent = 0;
  let failed = 0;

  for (const row of due) {
    const attempts = (Number(row.attempts) || 0) + 1;
    let result;
    try {
      result = await dispatch(row);
    } catch (error) {
      result = { ok: false, error: error.message };
    }

    if (result.ok) {
      sqlite
        .prepare("UPDATE notification_outbox SET status = 'sent', attempts = ?, sent_at = ?, last_error = NULL WHERE id = ?")
        .run(attempts, new Date().toISOString(), row.id);
      sent += 1;
      continue;
    }

    const exhausted = attempts >= MAX_ATTEMPTS;
    const backoff = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)] * 60 * 1000;
    sqlite
      .prepare('UPDATE notification_outbox SET status = ?, attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ?')
      .run(exhausted ? 'failed' : 'pending', attempts, exhausted ? null : Date.now() + backoff, String(result.error || '').slice(0, 500), row.id);
    failed += 1;
  }

  return { sent, failed, processed: due.length };
}
