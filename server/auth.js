import { betterAuth } from 'better-auth';
import { sqlite } from './db.js';
import { sendMailSafe } from './mailer.js';

if (!process.env.BETTER_AUTH_SECRET) {
  console.error(
    '[server] BETTER_AUTH_SECRET is not set. Set it in the process environment (pm2 env / shell) and restart. Refusing to start.',
  );
  process.exit(1);
}

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const EXTRA_ORIGINS = (process.env.TRUSTED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

const logTokens = process.env.AUTH_LOG_TOKENS === '1';

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3001',
  basePath: '/api/auth',
  trustedOrigins: [CLIENT_ORIGIN, ...EXTRA_ORIGINS],
  database: sqlite,
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, token }) => {
      const link = `${CLIENT_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
      if (logTokens) {
        console.log(`[auth] Password reset requested for ${user.email}`);
        console.log(`[auth]   Open this link: ${link}`);
      }
      const sent = await sendMailSafe({
        to: user.email,
        subject: 'Reset your YooTerminal password',
        text: `Someone asked to reset the password for your YooTerminal account.\n\nOpen this link within 1 hour to choose a new password:\n${link}\n\nIf you did not request this, you can ignore this email.`,
      });
      if (!sent && !logTokens) {
        console.warn(`[auth] Password reset requested for ${user.email} - email could not be delivered.`);
      }
    },
  },
  ...(googleEnabled
    ? {
      socialProviders: {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
      },
    }
    : {}),
});

function upsertAppUser({ authId, email, fullName }) {
  const now = new Date().toISOString();
  const normalizedEmail = String(email || '').toLowerCase();
  const existing = sqlite
    .prepare('SELECT id, role, full_name, logo_path FROM app_user WHERE email = ?')
    .get(normalizedEmail);
  if (existing) {
    const nextName = fullName || existing.full_name || '';
    if (nextName !== existing.full_name) {
      sqlite
        .prepare('UPDATE app_user SET full_name = ?, updated_date = ? WHERE id = ?')
        .run(nextName, now, existing.id);
    }
    return {
      id: String(existing.id),
      email: normalizedEmail,
      role: existing.role,
      name: nextName,
      logoPath: existing.logo_path || null,
    };
  }
  const result = sqlite
    .prepare('INSERT INTO app_user (clerk_id, email, full_name, role, created_date) VALUES (?, ?, ?, ?, ?)')
    .run(authId, normalizedEmail, fullName || '', 'user', now);
  return {
    id: String(result.lastInsertRowid),
    email: normalizedEmail,
    role: 'user',
    name: fullName || '',
    logoPath: null,
  };
}

export async function getCaller(req) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session || !session.user) return null;
    const email = String(session.user.email || '').toLowerCase();
    if (!email) return null;
    return upsertAppUser({ authId: session.user.id, email, fullName: session.user.name || '' });
  } catch {
    return null;
  }
}
