import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import Database from 'better-sqlite3';
import { currencyFor, buildContext, appPolicyFromEnv } from '../posContext.js';
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

function request(app, path) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      http.get(`http://127.0.0.1:${port}${path}`, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          server.close(() => resolve({ status: res.statusCode, body: JSON.parse(body || '{}') }));
        });
      }).on('error', (err) => {
        server.close(() => reject(err));
      });
    });
  });
}

test('context maps Rwanda to RWF and Uganda to UGX', () => {
  assert.equal(currencyFor('Rwanda'), 'RWF');
  assert.equal(currencyFor('Uganda'), 'UGX');
  assert.equal(currencyFor(null), 'UGX');
  assert.equal(currencyFor(undefined), 'UGX');
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
  const ctx = buildContext({
    sqlite: makeDb(),
    caller: { id: '2', email: 'nobody@example.com', role: 'user' },
    now: new Date(),
    policy: {}
  });
  assert.equal(ctx.operator, null);
  assert.equal(ctx.user.role, 'user');
});

test('GET /api/pos/context is 401 without a caller', async () => {
  const app = express();
  app.use('/api/pos', createPosRouter({ sqlite: makeDb(), getCallerFn: async () => null }));
  const res = await request(app, '/api/pos/context');
  assert.equal(res.status, 401);
});

test('GET /api/pos/app-version returns app policy', async () => {
  const app = express();
  app.use('/api/pos', createPosRouter({ sqlite: makeDb() }));
  const res = await request(app, '/api/pos/app-version');
  assert.equal(res.status, 200);
  assert.equal(res.body.min_version, 1);
  assert.equal(res.body.latest_version, 2);
  assert.equal(res.body.apk_url, 'https://www.yooterminal.com/pos/yooterminal-operator-2.0.0.apk');
});

test('appPolicyFromEnv returns defaults from environment', () => {
  const policy = appPolicyFromEnv();
  assert.equal(policy.minVersion, 1);
  assert.equal(policy.latestVersion, 2);
  assert.equal(policy.apkUrl, 'https://www.yooterminal.com/pos/yooterminal-operator-2.0.0.apk');
  assert.equal(policy.sha256, '');
});

test('appPolicyFromEnv respects POS_MIN_VERSION env var', () => {
  process.env.POS_MIN_VERSION = '3';
  const policy = appPolicyFromEnv();
  assert.equal(policy.minVersion, 3);
  delete process.env.POS_MIN_VERSION;
});