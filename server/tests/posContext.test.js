import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Database from 'better-sqlite3';
import { currencyFor, buildContext } from '../posContext.js';
import { createPosRouter } from '../pos.js';

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE operator (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      country TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      owner_email TEXT,
      created_date TEXT
    );
    INSERT INTO operator (id, name, slug, country, status, owner_email, created_date)
    VALUES ('1', 'Kigali Coach', 'kigali-coach', 'Rwanda', 'approved', 'Ops@Example.com', '2026-01-01T00:00:00.000Z');
  `);
  return db;
}

test('context maps Rwanda to RWF and Uganda to UGX', () => {
  assert.equal(currencyFor('Rwanda'), 'RWF');
  assert.equal(currencyFor('Uganda'), 'UGX');
  assert.equal(currencyFor(null), 'UGX');
});

test('context resolves the operator by owner email, case-insensitively', () => {
  const ctx = buildContext({
    sqlite: makeDb(),
    caller: { id: '1', email: 'ops@example.com', role: 'operator' },
    now: new Date('2026-11-19T10:00:00.000Z'),
    policy: { minVersion: 1, latestVersion: 2, apkUrl: 'https://x/a.apk', sha256: 'abc' },
  });
  assert.equal(ctx.operator.slug, 'kigali-coach');
  assert.equal(ctx.operator.currency, 'RWF');
  assert.equal(ctx.server_time, '2026-11-19T10:00:00.000Z');
  assert.equal(ctx.app.latest_version, 2);
});

test('context returns a null operator when nobody owns the caller email', () => {
  const ctx = buildContext({ sqlite: makeDb(), caller: { id: '2', email: 'nobody@example.com', role: 'user' }, now: new Date(), policy: {} });
  assert.equal(ctx.operator, null);
  assert.equal(ctx.user.role, 'user');
});

test('GET /api/pos/context is 401 without a caller', async () => {
  const app = express();
  app.use('/api/pos', createPosRouter({ sqlite: makeDb(), getCallerFn: async () => null }));
  const server = app.listen(0);
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/pos/context`);
  assert.equal(res.status, 401);
  server.close();
});