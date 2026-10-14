import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const KEEP = 14;
const src = path.join(process.cwd(), 'server', 'data', 'app.db');
const outDir = process.env.BACKUP_DIR || path.join(process.cwd(), 'server', 'data', 'backups');

fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dest = path.join(outDir, `app-${stamp}.db`);

const db = new Database(src, { readonly: true });
await db.backup(dest);
db.close();

const files = fs
  .readdirSync(outDir)
  .filter((f) => f.startsWith('app-') && f.endsWith('.db'))
  .sort();
for (const old of files.slice(0, Math.max(0, files.length - KEEP))) {
  fs.unlinkSync(path.join(outDir, old));
}

console.log(`[backup] ${dest}`);
