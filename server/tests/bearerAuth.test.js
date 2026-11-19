import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dbFile = path.join(os.tmpdir(), `yt-bearer-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = dbFile;
process.env.BETTER_AUTH_SECRET = 'test-secret-0123456789-0123456789';
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:3001';

const { auth } = await import('../auth.js');

test('a session token is accepted as a bearer credential', async () => {
  const email = `bearer-${Date.now()}@example.com`;
  const signup = await auth.api.signUpEmail({
    body: { email, password: 'TestPass123!', name: 'Bearer Test' },
  });
  assert.ok(signup.token, 'sign-up returns a session token');

  const session = await auth.api.getSession({
    headers: new Headers({ authorization: `Bearer ${signup.token}` }),
  });
  assert.equal(session?.user?.email, email);

  const anonymous = await auth.api.getSession({ headers: new Headers() });
  assert.equal(anonymous, null);
});

test.after(() => {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbFile + suffix); } catch { /* already gone */ }
  }
});
