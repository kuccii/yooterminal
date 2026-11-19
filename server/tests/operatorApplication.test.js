import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  COUNTRIES,
  applyOperatorApplication,
  roleAfterApplication,
  uniqueOperatorSlug,
  validateOperatorApplication,
} from '../operatorApplication.js';

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE app_user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT DEFAULT '',
      role TEXT NOT NULL DEFAULT 'user',
      created_date TEXT NOT NULL,
      updated_date TEXT
    );
    CREATE TABLE operator (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      country TEXT,
      phone TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      owner_email TEXT,
      brand_color TEXT,
      created_date TEXT,
      created_by_id TEXT
    );
  `);
  db.prepare(
    "INSERT INTO app_user (email, full_name, role, created_date) VALUES ('ops@example.com','Ops','user','2026-01-01')",
  ).run();
  db.prepare(
    "INSERT INTO app_user (email, full_name, role, created_date) VALUES ('boss@example.com','Boss','admin','2026-01-02')",
  ).run();
  db.prepare(
    "INSERT INTO app_user (email, full_name, role, created_date) VALUES ('second@example.com','Second','user','2026-01-03')",
  ).run();
  return db;
}

const OPS = { id: 1, email: 'ops@example.com', role: 'user' };
const APPLICATION = { company_name: 'Kigali Coach', phone: '+250 788 000 000', country: 'Rwanda' };

test('COUNTRIES is Uganda and Rwanda', () => {
  assert.deepEqual(COUNTRIES, ['Uganda', 'Rwanda']);
});

test('validate trims and requires a Ugandan or Rwandan country', () => {
  assert.deepEqual(
    validateOperatorApplication({ company_name: '  Kigali Coach  ', phone: ' +250 788 000 000 ', country: 'Rwanda' }),
    { company_name: 'Kigali Coach', phone: '+250 788 000 000', country: 'Rwanda' },
  );
  assert.throws(
    () => validateOperatorApplication({ company_name: 'X', phone: '1', country: 'Rwanda' }),
    (e) => e.status === 400,
  );
  assert.throws(
    () => validateOperatorApplication({ company_name: 'Kigali Coach', phone: '', country: 'Rwanda' }),
    (e) => e.status === 400,
  );
  assert.throws(
    () => validateOperatorApplication({ company_name: 'Kigali Coach', phone: '1', country: 'Kenya' }),
    (e) => e.status === 400,
  );
});

test('uniqueOperatorSlug appends a counter on collision', () => {
  const taken = new Set(['kigali-coach']);
  const next = uniqueOperatorSlug('Kigali Coach', (slug) => taken.has(slug));
  assert.equal(next, 'kigali-coach-2');
  taken.add(next);
  assert.equal(uniqueOperatorSlug('Kigali Coach', (slug) => taken.has(slug)), 'kigali-coach-3');
  assert.equal(uniqueOperatorSlug('   ', () => false, 'fallback-slug'), 'fallback-slug');
});

test('roleAfterApplication never downgrades an admin', () => {
  assert.equal(roleAfterApplication('user'), 'operator');
  assert.equal(roleAfterApplication('admin'), 'admin');
  assert.equal(roleAfterApplication('operator'), 'operator');
});

test('apply creates one pending operator and upgrades the role', () => {
  const db = makeDb();
  const result = applyOperatorApplication(db, OPS, APPLICATION);
  assert.equal(result.created, true);
  assert.equal(result.operator.status, 'pending');
  assert.equal(result.operator.slug, 'kigali-coach');
  assert.equal(result.role, 'operator');
  const rows = db.prepare('SELECT * FROM operator').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].owner_email, 'ops@example.com');
  assert.equal(rows[0].country, 'Rwanda');
  assert.equal(db.prepare('SELECT role FROM app_user WHERE id = 1').get().role, 'operator');
});

test('apply is idempotent and matches email case-insensitively', () => {
  const db = makeDb();
  const first = applyOperatorApplication(db, OPS, APPLICATION);
  const second = applyOperatorApplication(
    db,
    { id: 1, email: 'OPS@Example.com', role: 'operator' },
    { company_name: 'Other Name', phone: '2', country: 'Uganda' },
  );
  assert.equal(second.created, false);
  assert.equal(second.operator.id, first.operator.id);
  assert.equal(second.operator.name, 'Kigali Coach');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM operator').get().n, 1);
});

test('apply does not reset an existing approved operator', () => {
  const db = makeDb();
  db.prepare(
    `INSERT INTO operator (id,name,slug,country,phone,status,owner_email,brand_color,created_date)
     VALUES ('o9','Done Co','done-co','Uganda','1','approved','ops@example.com','#000','2026-01-01')`,
  ).run();
  const result = applyOperatorApplication(db, OPS, { company_name: 'Done Co', phone: '1', country: 'Uganda' });
  assert.equal(result.created, false);
  assert.equal(result.operator.status, 'approved');
});

test('two companies with the same name get distinct slugs', () => {
  const db = makeDb();
  applyOperatorApplication(db, OPS, APPLICATION);
  const second = applyOperatorApplication(
    db,
    { id: 3, email: 'second@example.com', role: 'user' },
    APPLICATION,
  );
  assert.equal(second.created, true);
  assert.equal(second.operator.slug, 'kigali-coach-2');
});

test('an admin applicant keeps the admin role', () => {
  const db = makeDb();
  const result = applyOperatorApplication(
    db,
    { id: 2, email: 'boss@example.com', role: 'admin' },
    APPLICATION,
  );
  assert.equal(result.role, 'admin');
  assert.equal(db.prepare('SELECT role FROM app_user WHERE id = 2').get().role, 'admin');
});
