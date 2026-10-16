import express from 'express';
import { auth, getCaller } from './auth.js';
import { HttpError } from './entities.js';
import { sqlite } from './db.js';
import { readImageBody, removeStoredImage, storeImage } from './uploads.js';

const NAME_MAX_LENGTH = 100;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

function storedLogoPath(userId) {
  const row = sqlite.prepare('SELECT logo_path FROM app_user WHERE id = ?').get(userId);
  return (row && row.logo_path) || null;
}

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
    res.json({
      id: caller.id,
      email: caller.email,
      role: caller.role,
      full_name: caller.name,
      logo_path: caller.logoPath,
    });
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

    res.json({
      id: caller.id,
      email: caller.email,
      role: caller.role,
      full_name: fullName,
      logo_path: caller.logoPath,
    });
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

  router.post('/logo', async (req, res) => {
    const caller = await getCaller(req);
    if (!caller) throw new HttpError(401, 'Not signed in');

    const { buffer, ext } = readImageBody(req.body);
    const logoPath = storeImage(buffer, ext);

    const previous = storedLogoPath(caller.id);
    try {
      sqlite
        .prepare('UPDATE app_user SET logo_path = ?, updated_date = ? WHERE id = ?')
        .run(logoPath, new Date().toISOString(), caller.id);
    } catch (error) {
      removeStoredImage(logoPath);
      throw error;
    }
    removeStoredImage(previous);

    res.json({ logo_path: logoPath });
  });

  router.delete('/logo', async (req, res) => {
    const caller = await getCaller(req);
    if (!caller) throw new HttpError(401, 'Not signed in');

    const previous = storedLogoPath(caller.id);
    sqlite
      .prepare('UPDATE app_user SET logo_path = NULL, updated_date = ? WHERE id = ?')
      .run(new Date().toISOString(), caller.id);
    removeStoredImage(previous);

    res.json({ logo_path: null });
  });

  return router;
}
