import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ROLES, listAppUsers, setUserRole } from '../roles.js';

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
      owner_email TEXT
    );
  `);
  db.prepare(
    "INSERT INTO app_user (email, full_name, role, created_date) VALUES ('admin@example.com','Admin','admin','2026-01-01')",
  ).run();
  db.prepare(
    "INSERT INTO app_user (email, full_name, role, created_date) VALUES ('ops@example.com','Ops','user','2026-01-02')",
  ).run();
  db.prepare(
    "INSERT INTO operator (id, name, slug, owner_email) VALUES ('o1','Kigali Connect','kigali-connect','OPS@example.com')",
  ).run();
  return db;
}

test('ROLES is the three accepted values', () => {
  assert.deepEqual(ROLES, ['user', 'operator', 'admin']);
});

test('listAppUsers returns string ids and matches operators case-insensitively', () => {
  const users = listAppUsers(makeDb());
  assert.equal(users[0].id, '1');
  assert.equal(users[0].name, 'Admin');
  assert.equal(users[0].created_at, '2026-01-01');
  assert.deepEqual(users[1].operators, [{ id: 'o1', name: 'Kigali Connect', slug: 'kigali-connect' }]);
});

test('setUserRole promotes and reports the previous role', () => {
  const db = makeDb();
  const result = setUserRole(db, { userId: '2', role: 'operator', actorId: '1' });
  assert.equal(result.role, 'operator');
  assert.equal(result.before, 'user');
  assert.equal(db.prepare('SELECT role FROM app_user WHERE id = 2').get().role, 'operator');
});

test('setUserRole rejects an unknown role', () => {
  assert.throws(
    () => setUserRole(makeDb(), { userId: '2', role: 'owner' }),
    (err) => err.status === 400,
  );
});

test('setUserRole rejects an unknown user', () => {
  assert.throws(
    () => setUserRole(makeDb(), { userId: '999', role: 'operator' }),
    (err) => err.status === 404,
  );
});

test('setUserRole refuses to demote the acting admin', () => {
  assert.throws(
    () => setUserRole(makeDb(), { userId: '1', role: 'user', actorId: '1' }),
    (err) => err.status === 400,
  );
});
