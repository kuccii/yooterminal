import express from 'express';
import { sqlite } from './db.js';
import { getCaller } from './auth.js';
import { HttpError } from './entities.js';
import { writeAuditLog } from './audit.js';

const ROLES = ['user', 'operator', 'admin'];

function createdAtISO(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return new Date(numeric).toISOString();
  return typeof value === 'string' && value ? value : null;
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

    const users = sqlite
      .prepare('SELECT id, email, name, role, createdAt FROM user ORDER BY createdAt ASC')
      .all();
    const operators = sqlite.prepare('SELECT id, name, slug, owner_email FROM operator').all();

    const byEmail = new Map();
    for (const operator of operators) {
      const key = String(operator.owner_email || '').toLowerCase();
      if (!key) continue;
      if (!byEmail.has(key)) byEmail.set(key, []);
      byEmail.get(key).push({ id: operator.id, name: operator.name, slug: operator.slug });
    }

    res.json({
      users: users.map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role || 'user',
        created_at: createdAtISO(row.createdAt),
        operators: byEmail.get(String(row.email).toLowerCase()) || [],
      })),
    });
  });

  router.patch('/users/:id/role', async (req, res) => {
    const caller = await requireAdmin(req);

    const userId = String(req.params.id || '');
    const role = String((req.body || {}).role || '');
    if (!ROLES.includes(role)) throw new HttpError(400, 'Role must be user, operator or admin');
    if (caller.id === userId && role !== 'admin') {
      throw new HttpError(400, 'You cannot demote your own account');
    }

    const user = sqlite.prepare('SELECT id, email, name, role FROM user WHERE id = ?').get(userId);
    if (!user) throw new HttpError(404, 'User not found');

    const currentRole = user.role || 'user';
    if (currentRole === role) {
      return res.json({ id: user.id, email: user.email, name: user.name, role });
    }

    sqlite.prepare('UPDATE user SET role = ?, updatedAt = ? WHERE id = ?').run(role, Date.now(), userId);
    writeAuditLog({
      actorId: caller.id,
      action: 'user.role_change',
      entity: 'user',
      entityId: userId,
      before: { role: currentRole },
      after: { role },
    });

    res.json({ id: user.id, email: user.email, name: user.name, role });
  });

  return router;
}
