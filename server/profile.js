import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { auth, getCaller } from './auth.js';
import { HttpError } from './entities.js';
import { sqlite } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const NAME_MAX_LENGTH = 100;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_BASE64_MAX_LENGTH = Math.ceil((LOGO_MAX_BYTES * 4) / 3) + 4;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export const UPLOADS_DIR = path.join(__dirname, 'uploads');

function ascii(buf, start, end) {
  return buf.toString('latin1', start, end);
}

function isSafeSvg(buf) {
  const text = buf.toString('utf8').trim().toLowerCase();
  if (!text.startsWith('<svg') && !text.startsWith('<?xml') && !text.startsWith('<!doctype svg')) return false;
  if (!text.includes('<svg')) return false;
  if (/<script|javascript:|on[a-z]+\s*=|<!entity|<foreignobject/.test(text)) return false;
  return true;
}

const LOGO_TYPES = {
  'image/jpeg': {
    ext: 'jpg',
    magic: (buf) => buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  },
  'image/png': {
    ext: 'png',
    magic: (buf) =>
      buf.length > 7 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a,
  },
  'image/webp': {
    ext: 'webp',
    magic: (buf) => buf.length > 11 && ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP',
  },
  'image/svg+xml': { ext: 'svg', magic: (buf) => isSafeSvg(buf) },
};

function storedLogoPath(userId) {
  const row = sqlite.prepare('SELECT logo_path FROM app_user WHERE id = ?').get(userId);
  return (row && row.logo_path) || null;
}

function removeStoredLogo(storedPath) {
  if (typeof storedPath !== 'string' || !storedPath) return;
  const filename = path.basename(storedPath);
  if (!filename || filename === '.' || filename === '..') return;
  fs.rmSync(path.resolve(UPLOADS_DIR, filename), { force: true });
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
    if (caller.role !== 'operator') throw new HttpError(403, 'Only operator accounts can upload a logo.');

    const contentType = typeof req.body?.content_type === 'string' ? req.body.content_type.trim().toLowerCase() : '';
    const type = LOGO_TYPES[contentType];
    if (!type) throw new HttpError(400, 'Use a JPEG, PNG, WebP, or SVG image.');

    let encoded = typeof req.body?.data_base64 === 'string' ? req.body.data_base64.trim() : '';
    encoded = encoded.replace(/^data:[^;,]+;base64,/i, '');
    if (!encoded) throw new HttpError(400, 'Choose an image to upload.');
    if (encoded.length > LOGO_BASE64_MAX_LENGTH) {
      throw new HttpError(400, 'Image must be 2 MB or smaller.');
    }
    if (encoded.length % 4 !== 0 || !BASE64_PATTERN.test(encoded)) {
      throw new HttpError(400, 'Image data is not valid base64.');
    }

    const buffer = Buffer.from(encoded, 'base64');
    if (buffer.length === 0 || buffer.length > LOGO_MAX_BYTES) {
      throw new HttpError(400, 'Image must be 2 MB or smaller.');
    }
    if (!type.magic(buffer)) throw new HttpError(400, 'That file is not a valid image.');

    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const filename = `${crypto.randomUUID()}.${type.ext}`;
    const target = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(target, buffer, { flag: 'wx', mode: 0o644 });

    const previous = storedLogoPath(caller.id);
    try {
      sqlite
        .prepare('UPDATE app_user SET logo_path = ?, updated_date = ? WHERE id = ?')
        .run(`/uploads/${filename}`, new Date().toISOString(), caller.id);
    } catch (error) {
      fs.rmSync(target, { force: true });
      throw error;
    }
    removeStoredLogo(previous);

    res.json({ logo_path: `/uploads/${filename}` });
  });

  router.delete('/logo', async (req, res) => {
    const caller = await getCaller(req);
    if (!caller) throw new HttpError(401, 'Not signed in');
    if (caller.role !== 'operator') throw new HttpError(403, 'Only operator accounts can remove a logo.');

    const previous = storedLogoPath(caller.id);
    sqlite
      .prepare('UPDATE app_user SET logo_path = NULL, updated_date = ? WHERE id = ?')
      .run(new Date().toISOString(), caller.id);
    removeStoredLogo(previous);

    res.json({ logo_path: null });
  });

  return router;
}
