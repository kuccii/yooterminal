import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter !== null) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

export function emailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/** Send mail when SMTP is configured; otherwise warn (never throw). */
export async function sendMailSafe({ to, subject, text }) {
  const tx = getTransporter();
  if (!tx) {
    console.warn(`[mailer] Email not delivered to ${to} — SMTP is not configured (set SMTP_HOST / SMTP_USER / SMTP_PASS). Subject: ${subject}`);
    return false;
  }
  try {
    await tx.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
    });
    return true;
  } catch (error) {
    console.error(`[mailer] Failed to send "${subject}" to ${to}:`, error.message);
    return false;
  }
}
