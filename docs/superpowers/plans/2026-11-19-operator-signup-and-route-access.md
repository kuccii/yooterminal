# Operator Signup & Route Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `app_user.role` the real role authority and add operator self-signup (apply → admin approves), so route management and operator dashboards are reachable by the right accounts.

**Architecture:** Extract role and operator-application rules into dependency-free modules (`server/roles.js`, `server/operatorApplication.js`) that take a SQLite handle, so they are testable without booting Better Auth. `server/admin.js` and `server/profile.js` become thin HTTP wrappers. The register page gains an account-type toggle; the operator dashboard gains a pending/suspended banner.

**Tech Stack:** Node 24 (`node:test`), Express 5, better-sqlite3, React 18 + Vite, shadcn/ui components.

**Spec:** `docs/superpowers/specs/2026-11-19-operator-signup-and-route-access-design.md`

## Global Constraints

- Permission authority is `app_user.role` only. Never write Better Auth's `user.role` to grant access.
- Operator application countries are exactly `Uganda` and `Rwanda`.
- Company name 2–120 characters; phone required, ≤32 characters.
- No new runtime or dev dependencies.
- `npm run lint` and `npm run build` must pass before any task is committed.
- Do not modify `pos-android/`, `public/pos/`, `/pos/` serving, or payment code.
- Production deployment is file copy to `/var/www/zigzagbus` + `pm2 restart zigzagbus-web`; never `npm run seed` there.
- Any new error thrown by helper modules must carry a numeric `status` property so `server/index.js:104-106` renders it correctly.

## Review Focus

- **Double-submitted operator form** — the same account must never get two `operator` rows or two slugs; expect one row, second call returns the first.
- **Duplicate company names** — there is no UNIQUE index on `operator.slug`; two different operators named the same must get `-2`, `-3`, never a crash or a shared slug.
- **Email case/whitespace** — `Foo@Bar.com` and `foo@bar.com` are the same applicant; matching must be case-insensitive or approval points at a hidden row.
- **Admin changing their own role** — a wrong click must be refused by the API, not only disabled in the UI, or the only admin locks everyone out.
- **Pending operator visibility** — schedules created before approval must stay out of public search until `operator.status` is `approved`.

---

### Task 1: Role service and admin role fix

**Files:**
- Create: `server/roles.js`
- Create: `server/tests/roles.test.js`
- Modify: `server/admin.js:44-101`

**Interfaces:**
- Consumes: a `better-sqlite3` handle with tables `app_user(id INTEGER, email, full_name, role, created_date, updated_date)` and `operator(id, name, slug, owner_email)`.
- Produces:
  - `ROLES: string[]`
  - `listAppUsers(sqlite) -> Array<{ id: string, email: string, name: string, role: string, created_at: string|null, operators: Array<{ id, name, slug }> }>`
  - `setUserRole(sqlite, { userId: string|number, role: string, actorId?: string|number|null }) -> { id: string, email: string, name: string, role: string, before: string }`

- [ ] **Step 1: Write the failing tests**

Create `server/tests/roles.test.js`:

```js
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
  db.prepare("INSERT INTO app_user (email, full_name, role, created_date) VALUES ('admin@example.com','Admin','admin','2026-01-01')").run();
  db.prepare("INSERT INTO app_user (email, full_name, role, created_date) VALUES ('ops@example.com','Ops','user','2026-01-02')").run();
  db.prepare("INSERT INTO operator (id, name, slug, owner_email) VALUES ('o1','Kigali Connect','kigali-connect','OPS@example.com')").run();
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
  assert.throws(() => setUserRole(makeDb(), { userId: '2', role: 'owner' }), (err) => err.status === 400);
});

test('setUserRole rejects an unknown user', () => {
  assert.throws(() => setUserRole(makeDb(), { userId: '999', role: 'operator' }), (err) => err.status === 404);
});

test('setUserRole refuses to demote the acting admin', () => {
  assert.throws(
    () => setUserRole(makeDb(), { userId: '1', role: 'user', actorId: '1' }),
    (err) => err.status === 400,
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test server/tests/roles.test.js`
Expected: FAIL — cannot find module `../roles.js`.

- [ ] **Step 3: Implement `server/roles.js`**

Signatures exactly as in Interfaces. `fail(status, message)` returns `Object.assign(new Error(message), { status })`. `listAppUsers` builds a lowercase-email map of operators, then maps `full_name` → `name` and `created_date` → `created_at`, always `String(id)`. `setUserRole` validates the role first (400), coerces `userId` with `Number()` and 404s when not an integer or no row, refuses `actorId` demoting itself when `role !== 'admin'` (400), updates only when the role actually changes, and returns `before`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test server/tests/roles.test.js`
Expected: 6 passing.

- [ ] **Step 5: Rewire `server/admin.js`**

Import `{ ROLES, listAppUsers, setUserRole }` from `./roles.js`, delete the local `ROLES`, replace the `GET /users` body with `const users = listAppUsers(sqlite); res.json({ users });`, and rewrite `PATCH /users/:id/role` to call `setUserRole(sqlite, { userId: req.params.id, role: String(req.body?.role || ''), actorId: caller.id })`, write the audit log only when `before !== role`, and respond `{ id, email, name, role }`. Keep `requireAdmin`, the refunds/uploads routes, and all imports otherwise unchanged.

- [ ] **Step 6: Verify syntax and the admin contract**

Run: `node --check server/admin.js; node --check server/roles.js`
Expected: no output, exit 0. Then run the tests again and `npm run lint`.

- [ ] **Step 7: Commit**

```bash
git add server/roles.js server/tests/roles.test.js server/admin.js
git commit -m "fix(admin): read and write roles from app_user

The admin Users tab listed and updated Better Auth's user table, but
getCaller() authorises from app_user.role, so every promotion was a no-op.
Roles now come from the table the app actually reads."
```

---

### Task 2: `set-role` bootstrap CLI

**Files:**
- Create: `scripts/set-role.mjs`
- Modify: `package.json:6-17` (add script)

**Interfaces:**
- Consumes: `setUserRole` from Task 1, `sqlite` from `server/db.js`.
- Produces: `npm run set-role -- <email> <user|operator|admin>`; exit 0 on success, 1 on usage error or unknown email.

- [ ] **Step 1: Implement the CLI**

`scripts/set-role.mjs`: read `process.argv.slice(2)`; on fewer than 2 args print
`Usage: npm run set-role -- <email> <user|operator|admin>` and exit 1. Reject a role not in `ROLES` with the same message and exit 1. Lowercase and trim the email. Look up the id with
`sqlite.prepare('SELECT id FROM app_user WHERE lower(email) = ?').get(email)`; print
`No app_user with email <email>. They must sign in once first.` and exit 1 when missing. Otherwise call
`setUserRole(sqlite, { userId: row.id, role })` and print `<email>: <before> -> <role>`.

- [ ] **Step 2: Add the npm script**

In `package.json` scripts, add `"set-role": "node scripts/set-role.mjs"` after `"seed"`.

- [ ] **Step 3: Verify usage handling**

Run: `npm run set-role`
Expected: usage line, exit code 1.
Run: `npm run set-role -- nobody@example.com admin`
Expected: `No app_user with email nobody@example.com...`, exit code 1.
Do not run it against a real email here; Task 7 runs it on the server.

- [ ] **Step 4: Commit**

```bash
git add scripts/set-role.mjs package.json
git commit -m "feat(admin): add set-role CLI for bootstrapping admins"
```

---

### Task 3: Operator application rules and DB writer

**Files:**
- Create: `server/operatorApplication.js`
- Create: `server/tests/operatorApplication.test.js`

**Interfaces:**
- Consumes: a `better-sqlite3` handle with `app_user` (as Task 1) and `operator(id, name, slug, country, phone, status, owner_email, brand_color, created_date, created_by_id)`.
- Produces:
  - `COUNTRIES: string[]` (`['Uganda','Rwanda']`)
  - `validateOperatorApplication(input) -> { company_name: string, phone: string, country: string }`
  - `uniqueOperatorSlug(name, isTaken: (slug: string) => boolean, fallback?: string) -> string`
  - `roleAfterApplication(currentRole: string) -> string`
  - `applyOperatorApplication(sqlite, caller: { id: string|number, email: string, role: string }, input) -> { role: string, operator: { id, name, slug, status }, created: boolean }`

- [ ] **Step 1: Write the failing tests**

Create `server/tests/operatorApplication.test.js` covering:

```js
test('validate trims and requires Ugandan or Rwandan country', () => {
  assert.deepEqual(
    validateOperatorApplication({ company_name: '  Kigali Coach  ', phone: ' +250 788 000 000 ', country: 'Rwanda' }),
    { company_name: 'Kigali Coach', phone: '+250 788 000 000', country: 'Rwanda' },
  );
  assert.throws(() => validateOperatorApplication({ company_name: 'X', phone: '1', country: 'Rwanda' }), (e) => e.status === 400);
  assert.throws(() => validateOperatorApplication({ company_name: 'Kigali Coach', phone: '', country: 'Rwanda' }), (e) => e.status === 400);
  assert.throws(() => validateOperatorApplication({ company_name: 'Kigali Coach', phone: '1', country: 'Kenya' }), (e) => e.status === 400);
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
  const result = applyOperatorApplication(
    db,
    { id: 1, email: 'ops@example.com', role: 'user' },
    { company_name: 'Kigali Coach', phone: '+250 788 000 000', country: 'Rwanda' },
  );
  assert.equal(result.created, true);
  assert.equal(result.operator.status, 'pending');
  assert.equal(result.operator.slug, 'kigali-coach');
  assert.equal(result.role, 'operator');
  const rows = db.prepare('SELECT * FROM operator').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].owner_email, 'ops@example.com');
  assert.equal(db.prepare('SELECT role FROM app_user WHERE id = 1').get().role, 'operator');
});

test('apply is idempotent and matches email case-insensitively', () => {
  const db = makeDb();
  const first = applyOperatorApplication(
    db,
    { id: 1, email: 'ops@example.com', role: 'user' },
    { company_name: 'Kigali Coach', phone: '1', country: 'Rwanda' },
  );
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
  const result = applyOperatorApplication(
    db,
    { id: 1, email: 'ops@example.com', role: 'user' },
    { company_name: 'Done Co', phone: '1', country: 'Uganda' },
  );
  assert.equal(result.created, false);
  assert.equal(result.operator.status, 'approved');
});
```

Use an in-memory DB helper mirroring Task 1's tables plus the operator columns, seeded with `app_user(id=1,'ops@example.com','Ops','user')`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test server/tests/operatorApplication.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `server/operatorApplication.js`**

`validateOperatorApplication` trims every field, requires a 2–120 char company name, a non-empty phone ≤32 chars, and a country in `COUNTRIES`, else throws a 400-status error. `uniqueOperatorSlug` lowercases, replaces `[^a-z0-9]+` with `-`, trims dashes, falls back when empty, then appends `-2`, `-3`, … while `isTaken(candidate)`. `roleAfterApplication` returns `'operator'` for `'user'`, otherwise the current role. `applyOperatorApplication` looks for an existing row with `lower(owner_email) = lower(caller.email)` ordered by `created_date`; if found returns it with `created: false`; otherwise builds the slug via `uniqueOperatorSlug` (fallback = email local part), inserts with `status='pending'`, `brand_color='#0f766e'`, `created_by_id=String(caller.id)`, and sets `created: true`. In both cases, when the caller's role is `user`, run `UPDATE app_user SET role='operator', updated_date=? WHERE id=? AND role='user'`. Return `{ role, operator: { id, name, slug, status }, created }`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test server/tests/operatorApplication.test.js`
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add server/operatorApplication.js server/tests/operatorApplication.test.js
git commit -m "feat(operators): add application validation and idempotent creation"
```

---

### Task 4: `POST /api/profile/apply-operator` and client method

**Files:**
- Modify: `server/profile.js` (import block; insert route before `return router;` at line 157)
- Modify: `src/api/client.js:78-99` (`profile` object)

**Interfaces:**
- Consumes: `applyOperatorApplication` (Task 3), `writeAuditLog` from `./audit.js`.
- Produces: HTTP `POST /api/profile/apply-operator`, body `{ company_name, phone, country }` → `201` on create / `200` on repeat, response `{ role, operator }`; 401 signed out, 409 admin. Client method `db.profile.applyOperator({ companyName, phone, country }) -> Promise<{ role, operator }>` (maps to snake_case, matching `profile.update`).

- [ ] **Step 1: Add the route**

In `server/profile.js` import `applyOperatorApplication` and `writeAuditLog`. Before `return router;`:

```js
router.post('/apply-operator', async (req, res) => {
  const caller = await getCaller(req);
  if (!caller) throw new HttpError(401, 'Sign in to apply as an operator');
  if (caller.role === 'admin') throw new HttpError(409, 'Admins already have full platform access');
  const result = applyOperatorApplication(sqlite, caller, req.body || {});
  if (result.created) {
    writeAuditLog({
      actorId: caller.id,
      action: 'operator.application',
      entity: 'operator',
      entityId: result.operator.id,
      before: null,
      after: { name: result.operator.name, slug: result.operator.slug, status: result.operator.status },
    });
  }
  res.status(result.created ? 201 : 200).json({ role: result.role, operator: result.operator });
});
```

- [ ] **Step 2: Add the client method**

Inside `db.profile`, after `get()`:

```js
async applyOperator(payload) {
  return request('/profile/apply-operator', { method: 'POST', body: JSON.stringify(payload) });
},
```

- [ ] **Step 3: Verify**

Run: `node --check server/profile.js; npm run lint; npm run build`
Expected: syntax clean, lint clean, build succeeds.
Run: `node --test "server/tests/*.test.js"` - all tests still pass.

- [ ] **Step 4: Commit**

```bash
git add server/profile.js src/api/client.js
git commit -m "feat(operators): add apply-operator endpoint and client method"
```

---

### Task 5: Register page account-type toggle

**Files:**
- Modify: `src/pages/Register.jsx`

**Interfaces:**
- Consumes: `db.auth.register`, `db.profile.applyOperator` (Task 4).
- Produces: `POST` flow used by operators; no exports.

- [ ] **Step 1: Add the account type UI**

State: `accountType` (`'traveller'` default), `companyName`, `phone`, `country` (`'Uganda'`). Render a two-option segmented control above the email field: **Traveller** ("Book bus tickets") and **Bus operator** ("Sell tickets on YooTerminal"). When `accountType === 'operator'`, render required inputs for company name, phone, and a country `Select` with Uganda/Rwanda.

- [ ] **Step 2: Branch the submit**

```js
await db.auth.register({ email, password });
if (accountType === 'operator') {
  await db.profile.applyOperator({
    companyName: companyName.trim(),
    phone: phone.trim(),
    country,
  });
  window.location.href = '/operator';
  return;
}
window.location.href = safeReturnTo();
```

If the apply call fails, the thrown message is shown by the existing `setError`; append a hint: `Your account was created — sign in and retry from this page.` The traveller path must be byte-for-byte behaviourally identical to today.

- [ ] **Step 3: Verify**

Run: `npm run lint; npm run build`
Expected: clean and successful.
Manual: `npm run dev`, register an operator account, confirm the redirect reaches `/operator` with the pending banner (Task 6). Then inspect the DB:

```bash
node -e "const D=require('better-sqlite3');const db=new D('server/data/app.db',{readonly:true});console.log(db.prepare('SELECT email,role FROM app_user ORDER BY id DESC LIMIT 1').get());console.log(db.prepare('SELECT name,slug,status,owner_email FROM operator ORDER BY created_date DESC LIMIT 1').get());"
```

Expected: `role: 'operator'`, operator `status: 'pending'`, `owner_email` matching the new account. If the apply step shows a 401, the session cookie was not ready — sign in as the new account and repeat the application; record that in the handoff.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Register.jsx
git commit -m "feat(auth): let operators apply for an account at signup"
```

---

### Task 6: Pending and suspended banner on the operator dashboard

**Files:**
- Modify: `src/pages/OperatorDashboard.jsx:182-190`

**Interfaces:**
- Consumes: `operator.status` (`'approved' | 'pending' | 'suspended'`).
- Produces: no exports.

- [ ] **Step 1: Render the banner**

Immediately after the header `</Card>` (line 188) and before `<div className="mt-6">`:

```jsx
{operator.status !== 'approved' && (
  <div className="mt-4 rounded-2xl border border-border bg-secondary p-4 text-sm">
    <p className="font-semibold text-primary">
      {operator.status === 'suspended' ? 'Account suspended' : 'Application under review'}
    </p>
    <p className="mt-1 text-muted-foreground">
      {operator.status === 'suspended'
        ? 'Your departures are hidden from customers. Contact the platform team to restore your account.'
        : 'You can set up your fleet and fares now. Your departures stay hidden from customers until the platform team approves your company.'}
    </p>
  </div>
)}
```

- [ ] **Step 2: Verify**

Run: `npm run lint; npm run build`
Expected: clean.
Manual: with the pending operator from Task 5, `/operator` shows "Application under review"; open `/search` for that route/date and confirm the operator's schedule does not appear. Then set the operator to `approved` in Admin → Operators and confirm the same schedule appears.

- [ ] **Step 3: Commit**

```bash
git add src/pages/OperatorDashboard.jsx
git commit -m "feat(operators): explain pending and suspended states on the dashboard"
```

---

### Task 7: Deploy and verify on production

**Files:** none (operations only).

**Interfaces:**
- Consumes: all prior tasks.
- Produces: live build with working admin roles, route access, and operator signup.

- [ ] **Step 1: Run the full gate locally**

Run: `node --test "server/tests/*.test.js"; npm run lint; npm run build`
Expected: all tests pass, lint clean, `dist/` rebuilt.

- [ ] **Step 2: Copy the changed files**

Stage `dist/`, `server/admin.js`, `server/profile.js`, `server/roles.js`, `server/operatorApplication.js`, `scripts/set-role.mjs`, `package.json` into a tarball. Copy to the server with the existing key, extract over `/var/www/zigzagbus` (preserve `server/data/`, `.env`, `node_modules/`), then `pm2 restart zigzagbus-web --update-env`.

- [ ] **Step 3: Verify the app booted**

Run on the server: `curl -s http://127.0.0.1:3001/api/health`
Expected: `{"ok":true,...}`.
Run: `pm2 logs zigzagbus-web --lines 20 --nostream`
Expected: no startup error, no `BETTER_AUTH_SECRET` exit.

- [ ] **Step 4: Bootstrap the real admin**

Run on the server: `cd /var/www/zigzagbus && npm run set-role -- <your-email> admin`
Expected: `<email>: user -> admin`.
Sign in on the live site, open Admin: the nav is populated, Users lists `app_user` accounts with their real roles, and Routes & stops loads the 7 seeded routes.

- [ ] **Step 5: End-to-end operator check on production**

Register a fresh account as Bus operator on the live site. Expected: lands on `/operator` with "Application under review", one `operator` row with `status='pending'`, and `app_user.role='operator'`. Approve it in Admin → Operators, reload the dashboard, banner disappears. Confirm the role change persists after signing out and back in.

- [ ] **Step 6: Commit the plan checkbox state (if tracked)**

If the plan file is committed, mark tasks complete and commit with `docs: mark operator signup plan complete`. No application code changes in this step.
