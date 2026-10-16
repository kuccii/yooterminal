import { createClerkClient } from '@clerk/express';
import { sqlite } from './db.js';

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
    const { isAuthenticated, toAuth } = await clerkClient.authenticateRequest(request);
    if (!isAuthenticated) return null;
    const authObject = toAuth();
    const userId = authObject.userId;
    if (!userId) return null;
    const user = await clerkClient.users.getUser(userId);
    const email = String(user.primaryEmailAddress?.emailAddress || '').toLowerCase();
    if (!email) return null;
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    return upsertAppUser({ clerkId: userId, email, fullName });
  } catch {
    return null;
  }
}

export const googleEnabled = true;
