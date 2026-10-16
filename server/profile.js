import express from 'express';
import { auth, getCaller } from './auth.js';
import { HttpError } from './entities.js';
import { sqlite } from './db.js';

const NAME_MAX_LENGTH = 100;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

function authErrorCode(error) {
  return error && typeof error === 'object' && error.body && typeof error.body === 'object'
    ? error.body.code
    : undefined;
}

export function createProfileRouter() {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const caller = await getCaller(req);
    if (!caller) throw new HttpError(401, 'Not signed in');
    res.json({ id: caller.id, email: caller.email, role: caller.role, full_name: caller.name });
  });

  router.patch('/', async (req, res) => {
    const caller = await getCaller(req);
    if (!caller) throw new HttpError(401, 'Not signed in');

    const fullName = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() : '';
    if (!fullName) throw new HttpError(400, 'Enter a display name.');
    if (fullName.length > NAME_MAX_LENGTH) {
      throw new HttpError(400, `Display name must be at most ${NAME_MAX_LENGTH} characters.`);
    }

    try {
      await auth.api.updateUser({ body: { name: fullName }, headers: req.headers });
    } catch {
      throw new HttpError(500, 'We could not update your profile. Please try again.');
    }

    sqlite
      .prepare('UPDATE app_user SET full_name = ?, updated_date = ? WHERE id = ?')
      .run(fullName, new Date().toISOString(), caller.id);

    res.json({ id: caller.id, email: caller.email, role: caller.role, full_name: fullName });
  });

  router.post('/password', async (req, res) => {
    const caller = await getCaller(req);
    if (!caller) throw new HttpError(401, 'Not signed in');

    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    if (!currentPassword || !newPassword) throw new HttpError(400, 'Enter your current and new password.');
    if (newPassword === currentPassword) throw new HttpError(400, 'New password must be different from your current password.');
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      throw new HttpError(400, `New password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
    }
    if (newPassword.length > PASSWORD_MAX_LENGTH) {
      throw new HttpError(400, `New password must be at most ${PASSWORD_MAX_LENGTH} characters.`);
    }

    try {
      await auth.api.verifyPassword({ body: { password: currentPassword }, headers: req.headers });
    } catch (error) {
      if (authErrorCode(error) === 'INVALID_PASSWORD') throw new HttpError(400, 'Current password is incorrect.');
      throw new HttpError(401, 'Your session has expired. Please sign in again.');
    }

    try {
      await auth.api.changePassword({ body: { newPassword, currentPassword }, headers: req.headers });
    } catch (error) {
      const code = authErrorCode(error);
      if (code === 'INVALID_PASSWORD') throw new HttpError(400, 'Current password is incorrect.');
      if (code === 'PASSWORD_TOO_SHORT') {
        throw new HttpError(400, `New password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      }
      if (code === 'PASSWORD_TOO_LONG') {
        throw new HttpError(400, `New password must be at most ${PASSWORD_MAX_LENGTH} characters.`);
      }
      if (code === 'CREDENTIAL_ACCOUNT_NOT_FOUND') {
        throw new HttpError(400, 'This account has no password. Use "Forgot password" on the login page to set one.');
      }
      console.error('[server] change password failed:', code || 'unknown error');
      throw new HttpError(500, 'We could not change your password. Please try again.');
    }

    res.json({ ok: true });
  });

  return router;
}
