// Bootstrap or correct an account's platform role from the server.
//
// The admin Users tab can only be reached by an existing admin, so a fresh
// deployment (or a locked-out owner) needs an out-of-band path. This writes
// app_user.role, which is the column every request authorises against.
//
//   npm run set-role -- owner@example.com admin
//
// Accounts are created by signing in once; this script never creates users.

import { ROLES, setUserRole } from '../server/roles.js';

const USAGE = 'Usage: npm run set-role -- <email> <user|operator|admin>';

const [emailArg, roleArg] = process.argv.slice(2);

if (!emailArg || !roleArg) {
  console.error(USAGE);
  process.exit(1);
}

if (!ROLES.includes(roleArg)) {
  console.error(`Unknown role "${roleArg}".`);
  console.error(USAGE);
  process.exit(1);
}

const email = emailArg.trim().toLowerCase();

const { sqlite } = await import('../server/db.js');

const row = sqlite.prepare('SELECT id FROM app_user WHERE lower(email) = ?').get(email);
if (!row) {
  console.error(`No app_user with email ${email}. They must sign in once first.`);
  process.exit(1);
}

const result = setUserRole(sqlite, { userId: row.id, role: roleArg });
console.log(`${email}: ${result.before} -> ${result.role}`);
