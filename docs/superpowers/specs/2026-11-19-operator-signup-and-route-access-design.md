# Operator Signup & Route Access — Design

Date: 2026-11-19
Status: approved

## Goal

Two defects, one cause:

1. Route management is unreachable in practice — the admin Routes tab exists,
   is deployed, and the API permits admin writes, but no real account is an
   admin.
2. There is no way to become an operator: signup always produces `role='user'`
   in `app_user`, and only an admin can change a role.

Ship operator self-signup (apply → admin approves) and make the role system
actually authoritative, so route management and operator dashboards are
reachable by the right people.

## Root cause

Two user tables disagree:

| Table | Written by | Read by |
|---|---|---|
| `user` (Better Auth) | auth signup; `server/admin.js` role PATCH | nothing in app logic |
| `app_user` (app profile) | `upsertAppUser`, `profile.js`, `seed.js` | `getCaller()` → all access rules |

`getCaller()` (`server/auth.js:58-103`) returns `app_user.role`, and every
entity access rule keys off it. `GET/PATCH /api/admin/users` in
`server/admin.js:44-101` operate on `user`. Production proves the divergence:
`operator@example.com` and `kigali.ops@example.com` are `operator` in
`app_user` but `user` in `user`. A promotion in the admin panel therefore has
no effect on permissions. The same file's self-demotion guard compares
`caller.id` (integer `app_user.id`) to `userId` (string Better Auth id), so it
never matches.

## Server

### 1. `app_user` is the single role authority

`server/admin.js`:

- `GET /users` selects `id, email, full_name, role, created_date` from
  `app_user`; keeps the existing per-user operator list join on `owner_email`,
  and returns `created_at` from `created_date`. Accounts that exist only in
  Better Auth stop appearing until they sign in once, which is what creates
  their `app_user` row — intended, since those are probe/test registrations.
- `PATCH /users/:id/role` validates against `ROLES`, loads the row from
  `app_user`, refuses to demote yourself (`caller.id === Number(userId)`),
  updates `app_user.role` + `updated_date`, audit-logs as before.
- The `user.role` column is left in place and unused. Better Auth does not read
  it, and no core-auth behaviour is touched.

No migration: `app_user.role` already exists and is already correct in
production.

### 2. Operator application endpoint

`POST /api/profile/apply-operator` in `server/profile.js`.

Body: `{ company_name, phone, country }`.

Rules:

- 401 when not signed in.
- 409 for `role === 'admin'` ("Admins already have full access").
- `company_name` trimmed, 2–120 chars, required.
- `phone` trimmed, required, ≤ 32 chars.
- `country` must be `Uganda` or `Rwanda` (matches the signup form and
  `AdminOperatorsTab`'s `COUNTRIES`).
- If an `operator` row already has this `owner_email`, return it unchanged
  (idempotent) and still ensure the role is `operator`.
- Slug = name lowercased, non-alphanumerics collapsed to `-`, trimmed of
  dashes; if taken, append `-2`, `-3`, … until free. Empty slug falls back to
  the email local part.
- Insert `operator`: `status='pending'`, `owner_email=caller.email`,
  `phone`, `country`, `brand_color='#0f766e'`, `created_by_id=String(caller.id)`.
- `UPDATE app_user SET role='operator' WHERE id=? AND role='user'` — never
  downgrades an admin.
- Audit log: `action: 'operator.application'`, `entity: 'operator'`,
  `entityId` = new operator id.
- Respond `{ role: 'operator', operator: { id, name, slug, status } }`.

Slug uniqueness and the role transition are extracted as pure functions
(`uniqueOperatorSlug(name, exists)`, `nextRoleForApplication(currentRole)`) so
they are testable without HTTP.

### 3. Public visibility is already gated — no change

Search, route page, operator page, trip detail, seat map and payment confirm
all filter `COALESCE(operator_status,'approved') = 'approved'`
(`payments.js:297`, `seats.js:59`, `SearchResults.jsx:75`,
`RoutePage.jsx:43`, `OperatorPage.jsx:33`, `TripDetail.jsx:73`). New schedules
are stamped from `operator.status` (`OperatorTimetableTab.jsx:113`), so a
pending operator's departures are invisible to customers by construction.

## Client

### 1. `/register` account type

Add a radio group: **Traveller** (default) / **Bus operator**. Operator
selection reveals company name, phone, country (Uganda/Rwanda select).

Submit order: `db.auth.register()` (Better Auth sets the session cookie) →
`db.profile.applyOperator(...)` → `window.location.href = '/operator'`.
Traveller path is unchanged (`safeReturnTo()`). If the apply call fails, show
the error and keep the account (it exists and can retry from Account settings
in a later iteration); the message names the endpoint's reason.

`src/api/client.js`: add `profile.applyOperator({ company_name, phone, country })`.

### 2. Pending banner on `/operator`

`OperatorDashboard.jsx`: when `operator.status !== 'approved'`, render a
`Card` above the content — "Application under review" for `pending`
(status chip, copy explaining that fares stay hidden from customers until
approval) and "Account suspended" copy for `suspended`. Tabs remain available
(approved decision), matching how `AdminOperatorsTab` already propagates
status to schedules.

Existing "No operator dashboard yet" screen stays for accounts with no
matching `owner_email` row, with copy pointing at the operator signup option.

### 3. Role vs company link

Changing a user to `operator` in Admin → Users grants the role only. The
dashboard still needs an `operator` row whose `owner_email` matches, which
Admin → Operators already manages. Self-signup creates both in one step; the
manual path is documented in the Users tab copy.

## Admin bootstrap

`scripts/set-role.mjs` + `npm run set-role -- <email> <role>`:

- validates role in `user|operator|admin`
- lowercases the email
- updates `app_user.role` (`updated_date`), prints before/after
- creates no accounts; exits non-zero when the email is unknown

Run on the server for the human who should own the platform, since the only
admin today is the seeded demo account.

## Routes

No code change. `AdminRoutesTab` is deployed, in `NAV_ITEMS` as
"Routes & stops", and `assertWriteAllowed` defaults unspecified rules to
`'admin'`. Verification is: sign in as an `app_user.role='admin'` account →
Admin → Routes & stops → create a route.

## Out of scope

- Operator-created routes (catalogue stays admin-owned).
- Email verification, document/KYC upload, rejection reason emails.
- Renaming `user.role` out of the schema.
- Any change to `/admin` shell or route-tab functionality.
- Awarding an operator role from the operator dashboard.

## Verification

1. `npm run lint`, `npm run build` clean.
2. `node --test server/tests/*.test.js` — slug dedupe, role transition rules,
   country/name validation, idempotent re-apply.
3. Unit-level: `set-role` rejects unknown roles and unknown emails.
4. Integration (local `npm run dev`, temp DB): register as operator → row is
   `status='pending'` and `app_user.role='operator'` → dashboard shows banner →
   create a schedule → appears in operator list, absent from public search →
   admin sets status `approved` → schedule appears in search.
5. Production: `npm run set-role` for the real admin, sign in, Admin → Users
   shows `app_user` roles, promote a test account, confirm the change survives
   a re-login; Admin → Routes & stops lists the 7 seeded routes and can add one.
