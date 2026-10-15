import { createClerkClient } from '@clerk/express';
import { sqlite } from './db.js';

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const EXTRA_ORIGINS = (process.env.TRUSTED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!process.env.CLERK_SECRET_KEY) {
  console.error(
    '[server] CLERK_SECRET_KEY is not set. Set it in the process environment (pm2 env / shell) and restart. Refusing to start.',
  );
  process.exit(1);
}

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
});

const authorizedParties = [CLIENT_ORIGIN, ...EXTRA_ORIGINS].filter(Boolean);

function extractBearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function extractSessionCookie(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)__session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function upsertAppUser({ clerkId, email, fullName }) {
  const now = new Date().toISOString();
  const normalizedEmail = String(email || '').toLowerCase();
  const existing = sqlite
    .prepare('SELECT id, role, full_name FROM app_user WHERE email = ?')
    .get(normalizedEmail);
  if (existing) {
    sqlite
      .prepare('UPDATE app_user SET clerk_id = ?, full_name = ?, updated_date = ? WHERE id = ?')
      .run(clerkId, fullName || existing.full_name || '', now, existing.id);
    return {
      id: String(existing.id),
      email: normalizedEmail,
      role: existing.role,
      name: existing.full_name || fullName || '',
    };
  }
  const result = sqlite
    .prepare('INSERT INTO app_user (clerk_id, email, full_name, role, created_date) VALUES (?, ?, ?, ?, ?)')
    .run(clerkId, normalizedEmail, fullName || '', 'user', now);
  return { id: String(result.lastInsertRowid), email: normalizedEmail, role: 'user', name: fullName || '' };
}

/** Resolve the signed-in user for a request, or null. */
export async function getCaller(req) {
  const token = extractSessionCookie(req) || extractBearer(req);
  if (!token) return null;
  try {
    const request = new Request(`${req.protocol}://${req.headers.host}${req.url}`, {
      method: req.method,
      headers: { cookie: req.headers.cookie || '', authorization: `Bearer ${token}` },
    });
    const { isAuthenticated, toAuth } = await clerkClient.authenticateRequest(request, {
      authorizedParties: authorizedParties.length ? authorizedParties : undefined,
    });
    if (!isAuthenticated) return null;
    const authObject = toAuth();
    const userId = authObject.userId;
    if (!userId) return null;
    const claims = /** @type {Record<string, string>} */ (authObject.sessionClaims || {});
    const email = claims.email || claims.primary_email || '';
    if (!email) return null;
    const fullName = [claims.first_name, claims.last_name].filter(Boolean).join(' ') || claims.name || '';
    return upsertAppUser({ clerkId: userId, email, fullName });
  } catch {
    return null;
  }
}

export const googleEnabled = true;
