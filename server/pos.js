import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Published POS builds live here. `npm run pos:publish` copies the signed
 * release APK in and writes `manifest.json` beside it.
 */
export const POS_DIR = path.join(__dirname, 'pos');
export const POS_APK_NAME = 'yooterminal-pos.apk';

const APK_PATH = path.join(POS_DIR, POS_APK_NAME);
const MANIFEST_PATH = path.join(POS_DIR, 'manifest.json');
const APK_MIME = 'application/vnd.android.package-archive';

let hashCache = null;

function readManifest() {
  try {
    const parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function apkDetails() {
  let stat;
  try {
    stat = fs.statSync(APK_PATH);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;

  // Hashing 5 MB on every request would be wasteful; the file only changes
  // when someone republishes it.
  const key = `${stat.size}:${stat.mtimeMs}`;
  if (!hashCache || hashCache.key !== key) {
    hashCache = {
      key,
      sha256: crypto.createHash('sha256').update(fs.readFileSync(APK_PATH)).digest('hex'),
    };
  }

  const manifest = readManifest();
  return {
    size: stat.size,
    modified: stat.mtime.toISOString(),
    sha256: hashCache.sha256,
    version: typeof manifest.version === 'string' ? manifest.version : null,
    versionCode: Number.isInteger(manifest.versionCode) ? manifest.versionCode : null,
    builtAt: typeof manifest.builtAt === 'string' ? manifest.builtAt : null,
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function formatSize(bytes) {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

/**
 * Deliberately plain: no JavaScript, no external stylesheet, no web font.
 * The target device is an Android 6 WebView, and every extra request is
 * another chance to fail the TLS handshake before the APK is reached.
 */
function renderPage(apk) {
  const body = apk
    ? `
      <a class="btn" href="/pos/${POS_APK_NAME}">Download the app</a>
      <dl>
        ${apk.version ? `<dt>Version</dt><dd>${escapeHtml(apk.version)}${apk.versionCode != null ? ` (${apk.versionCode})` : ''}</dd>` : ''}
        <dt>Size</dt><dd>${formatSize(apk.size)}</dd>
        ${apk.builtAt ? `<dt>Built</dt><dd>${escapeHtml(apk.builtAt)}</dd>` : ''}
        <dt>SHA-256</dt><dd>${escapeHtml(apk.sha256)}</dd>
      </dl>`
    : `
      <div class="warn">
        <strong>No build published yet.</strong><br>
        Build the APK, then run <code>npm run pos:publish</code> on the server.
      </div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>YooTerminal POS</title>
<style>
  body { margin:0; padding:20px; background:#f2f5f3; color:#12211a;
         font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; line-height:1.5; }
  main { max-width:520px; margin:0 auto; background:#ffffff; border-radius:12px; padding:20px; }
  h1 { font-size:22px; margin:0 0 4px; }
  h2 { font-size:16px; margin:24px 0 8px; }
  .sub { color:#4a5b53; font-size:14px; margin:0 0 20px; }
  .btn { display:block; text-align:center; background:#0B5D3B; color:#ffffff;
         text-decoration:none; font-size:18px; font-weight:bold; padding:16px; border-radius:10px; }
  dl { margin:20px 0 0; font-size:13px; }
  dt { color:#4a5b53; }
  dd { margin:0 0 10px; word-wrap:break-word; font-family:monospace; }
  ol { padding-left:22px; font-size:14px; }
  li { margin-bottom:8px; }
  .warn { background:#fff4e5; border:1px solid #f0c48a; border-radius:8px;
          padding:12px; font-size:13px; margin-top:20px; }
  code { font-family:monospace; background:#eef1ef; padding:2px 4px; border-radius:4px; }
</style>
</head>
<body>
<main>
  <h1>YooTerminal POS</h1>
  <p class="sub">Operator app for the Sunmi V1 (Android 6).</p>
  ${body}

  <h2>Install on the Sunmi</h2>
  <ol>
    <li>Open <strong>Settings &rarr; Security</strong> and turn on <strong>Unknown sources</strong>.</li>
    <li>Tap <strong>Download the app</strong> above.</li>
    <li>When it finishes, tap the download notification, or open <strong>Downloads</strong>.</li>
    <li>Tap <strong>Install</strong>. If Android blocks it, go back to step 1.</li>
  </ol>

  <div class="warn">
    This is the printer and network test build, not the finished till. It has
    three checks: TLS trust, printer status, and a sample ticket.
  </div>
</main>
</body>
</html>`;
}

export function createPosRouter() {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    );
    res.type('html').send(renderPage(apkDetails()));
  });

  router.get(`/${POS_APK_NAME}`, (req, res, next) => {
    if (!apkDetails()) return next();

    res.setHeader('Content-Type', APK_MIME);
    res.setHeader('Content-Disposition', `attachment; filename="${POS_APK_NAME}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Revalidate every time so a republished build is not masked by a cached
    // one, but still allow 304s via the ETag sendFile generates.
    res.setHeader('Cache-Control', 'no-cache');

    res.sendFile(APK_PATH, (error) => {
      if (error && !res.headersSent) next(error);
    });
  });

  router.get('/version', (req, res) => {
    const apk = apkDetails();
    if (!apk) return res.status(404).json({ error: 'No POS build published' });
    res.setHeader('Cache-Control', 'no-cache');
    res.json({ ...apk, download: `/pos/${POS_APK_NAME}` });
  });

  router.use((req, res) => {
    res.status(404).type('text').send('Not found');
  });

  return router;
}
