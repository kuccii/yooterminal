#!/usr/bin/env node
/**
 * Publishes the signed release APK as static files under `public/pos/`.
 *
 * Static, not a server route, on purpose: production is nginx serving `dist/`
 * with `try_files $uri $uri/ /index.html`, so anything present in `dist/pos/`
 * is served directly. That means no nginx change, no reverse-proxy entry, and
 * nginx's own `sendfile` + range support for a 5.6 MB download on a flaky
 * Android 6 device.
 *
 * Usage:
 *   npm run pos:publish                 # uses the default release output
 *   npm run pos:publish -- <path.apk>   # or point at a specific file
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const APK_NAME = 'yooterminal-pos.apk';

const source = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, 'pos-android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');

const targetDir = path.join(root, 'public', 'pos');
const targetApk = path.join(targetDir, APK_NAME);
const targetHtml = path.join(targetDir, 'index.html');
const targetBuild = path.join(targetDir, 'build.json');

if (!fs.existsSync(source)) {
  console.error(`No APK at ${source}`);
  console.error('Build one first:');
  console.error('  cd pos-android && gradlew.bat :app:assembleRelease');
  process.exit(1);
}

const gradlePath = path.join(root, 'pos-android', 'app', 'build.gradle.kts');
let versionName = null;
let versionCode = null;
try {
  const gradle = fs.readFileSync(gradlePath, 'utf8');
  versionName = gradle.match(/versionName\s*=\s*"([^"]+)"/)?.[1] ?? null;
  const code = gradle.match(/versionCode\s*=\s*(\d+)/)?.[1];
  versionCode = code ? Number(code) : null;
} catch {
  console.warn(`Could not read ${gradlePath}; version will be reported as unknown.`);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, targetApk);

const buffer = fs.readFileSync(targetApk);
const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
const sizeLabel = `${(buffer.length / (1024 * 1024)).toFixed(1)} MB`;
const builtAt = fs.statSync(source).mtime.toISOString();

fs.writeFileSync(targetBuild, `${JSON.stringify({ version: versionName, versionCode, size: buffer.length, sha256, builtAt }, null, 2)}\n`);
fs.writeFileSync(targetHtml, renderPage({ versionName, versionCode, sizeLabel, sha256, builtAt }));

console.log(`Published public/pos/ (served at /pos/)`);
console.log(`  version  ${versionName ?? 'unknown'} (${versionCode ?? '?'})`);
console.log(`  size     ${sizeLabel}`);
console.log(`  sha256   ${sha256}`);
console.log('Next: npm run build  (copies public/ into dist/)');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

/**
 * Deliberately plain: no JavaScript, no external stylesheet, no web font.
 * The target device is an Android 6 WebView, and every extra request is
 * another chance to fail the TLS handshake before the APK is reached.
 */
function renderPage({ versionName, versionCode, sizeLabel, sha256, builtAt }) {
  const version = versionName
    ? `${escapeHtml(versionName)}${versionCode != null ? ` (${versionCode})` : ''}`
    : null;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
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

  <a class="btn" href="/pos/${APK_NAME}">Download the app</a>

  <dl>
    ${version ? `<dt>Version</dt><dd>${version}</dd>` : ''}
    <dt>Size</dt><dd>${sizeLabel}</dd>
    <dt>Built</dt><dd>${escapeHtml(builtAt)}</dd>
    <dt>SHA-256</dt><dd>${escapeHtml(sha256)}</dd>
  </dl>

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
</html>
`;
}
