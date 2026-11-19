// Role authority for the platform.
//
// Better Auth owns the `user` table, but the app authorises from `app_user`
// (see getCaller in auth.js). Everything that grants or displays a role must
// therefore read and write `app_user.role`; writing `user.role` changes
// nothing a request ever checks.
//
// These helpers take a SQLite handle instead of importing the app database so
// they can be tested against an in-memory schema.

export const ROLES = ['user', 'operator', 'admin'];

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

/**
 * @param {import('better-sqlite3').Database} sqlite
 * @returns {Array<{ id: string, email: string, name: string, role: string, created_at: string|null, operators: Array<{ id: string, name: string, slug: string }> }>}
 */
export function listAppUsers(sqlite) {
  const users = sqlite
    .prepare('SELECT id, email, full_name, role, created_date FROM app_user ORDER BY created_date ASC, id ASC')
    .all();

  const operators = sqlite.prepare('SELECT id, name, slug, owner_email FROM operator').all();
  const byEmail = new Map();
  for (const operator of operators) {
    const key = String(operator.owner_email || '').trim().toLowerCase();
    if (!key) continue;
    if (!byEmail.has(key)) byEmail.set(key, []);
    byEmail.get(key).push({ id: operator.id, name: operator.name, slug: operator.slug });
  }

  return users.map((row) => ({
    id: String(row.id),
    email: row.email,
    name: row.full_name || '',
    role: row.role || 'user',
    created_at: row.created_date || null,
    operators: byEmail.get(String(row.email || '').toLowerCase()) || [],
  }));
}

/**
 * @param {import('better-sqlite3').Database} sqlite
 * @param {{ userId: string|number, role: string, actorId?: string|number|null }} input
 * @returns {{ id: string, email: string, name: string, role: string, before: string }}
 */
export function setUserRole(sqlite, { userId, role, actorId = null }) {
  if (!ROLES.includes(role)) throw fail(400, 'Role must be user, operator or admin');

  const id = Number(userId);
  if (!Number.isInteger(id)) throw fail(404, 'User not found');

  const user = sqlite.prepare('SELECT id, email, full_name, role FROM app_user WHERE id = ?').get(id);
  if (!user) throw fail(404, 'User not found');

  if (actorId !== null && actorId !== undefined && Number(actorId) === id && role !== 'admin') {
    throw fail(400, 'You cannot demote your own account');
  }

  const before = user.role || 'user';
  if (before !== role) {
    sqlite
      .prepare('UPDATE app_user SET role = ?, updated_date = ? WHERE id = ?')
      .run(role, new Date().toISOString(), id);
  }

  return {
    id: String(user.id),
    email: user.email,
    name: user.full_name || '',
    role,
    before,
  };
}
