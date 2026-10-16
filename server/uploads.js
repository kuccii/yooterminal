import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from './entities.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const UPLOADS_DIR = path.join(__dirname, 'uploads');

export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const IMAGE_BASE64_MAX_LENGTH = Math.ceil((IMAGE_MAX_BYTES * 4) / 3) + 4;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

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

const IMAGE_TYPES = {
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

export function readImageBody(body) {
  const contentType = typeof body?.content_type === 'string' ? body.content_type.trim().toLowerCase() : '';
  const type = IMAGE_TYPES[contentType];
  if (!type) throw new HttpError(400, 'Use a JPEG, PNG, WebP, or SVG image.');

  let encoded = typeof body?.data_base64 === 'string' ? body.data_base64.trim() : '';
  encoded = encoded.replace(/^data:[^;,]+;base64,/i, '');
  if (!encoded) throw new HttpError(400, 'Choose an image to upload.');
  if (encoded.length > IMAGE_BASE64_MAX_LENGTH) {
    throw new HttpError(400, 'Image must be 2 MB or smaller.');
  }
  if (encoded.length % 4 !== 0 || !BASE64_PATTERN.test(encoded)) {
    throw new HttpError(400, 'Image data is not valid base64.');
  }

  const buffer = Buffer.from(encoded, 'base64');
  if (buffer.length === 0 || buffer.length > IMAGE_MAX_BYTES) {
    throw new HttpError(400, 'Image must be 2 MB or smaller.');
  }
  if (!type.magic(buffer)) throw new HttpError(400, 'That file is not a valid image.');

  return { buffer, ext: type.ext };
}

export function storeImage(buffer, ext) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const filename = `${crypto.randomUUID()}.${ext}`;
  const target = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(target, buffer, { flag: 'wx', mode: 0o644 });
  return `/uploads/${filename}`;
}

export function removeStoredImage(storedPath) {
  if (typeof storedPath !== 'string' || !storedPath) return;
  const filename = path.basename(storedPath);
  if (!filename || filename === '.' || filename === '..') return;
  fs.rmSync(path.resolve(UPLOADS_DIR, filename), { force: true });
}

export function uploadImage(body) {
  const { buffer, ext } = readImageBody(body);
  return storeImage(buffer, ext);
}
