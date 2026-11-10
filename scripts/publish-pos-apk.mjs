#!/usr/bin/env node
/**
 * Copies the signed release APK into server/pos/ so /pos can serve it.
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

const source = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, 'pos-android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');

const targetDir = path.join(root, 'server', 'pos');
const target = path.join(targetDir, 'yooterminal-pos.apk');
const manifestPath = path.join(targetDir, 'manifest.json');

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
fs.copyFileSync(source, target);

const buffer = fs.readFileSync(target);
const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

fs.writeFileSync(
  manifestPath,
  `${JSON.stringify(
    {
      version: versionName,
      versionCode,
      size: buffer.length,
      sha256,
      builtAt: fs.statSync(source).mtime.toISOString(),
    },
    null,
    2,
  )}\n`,
);

console.log(`Published ${path.relative(root, target)}`);
console.log(`  version  ${versionName ?? 'unknown'} (${versionCode ?? '?'})`);
console.log(`  size     ${(buffer.length / (1024 * 1024)).toFixed(1)} MB`);
console.log(`  sha256   ${sha256}`);
console.log('  page     /pos');
