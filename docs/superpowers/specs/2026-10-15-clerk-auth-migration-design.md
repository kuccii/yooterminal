# Clerk Auth Migration — Design

**Date:** 2026-10-15
**Status:** Approved (proceeding)
**Scope:** Replace Better Auth with Clerk across server and client.

## Problem

Google sign-in fails with `redirect_uri_mismatch` because our app owns the
Google OAuth client and the redirect URI registered in Google Cloud Console
does not match what the server sends. The app is also carrying its own
password/OTP/reset/session machinery, which is a maintenance surface we do
not need. Clerk solves both: it owns the OAuth clients (no more
`redirect_uri` to keep in sync) and runs sign-in, sessions, and password
reset for us.

## Decision (confirmed defaults)

- **Full cutover** — Better Auth is removed entirely. No dual-session
  transition. Existing test accounts are reset (they are build-phase
  logins, not real users).
- **Email + password stays available** alongside Google, both via Clerk.
- **Roles and ownership resolve from a local `app_user` table keyed by
  email**, not from Clerk metadata. This keeps the existing ownership
  model intact.

## Architecture

The load-bearing change is `getCaller(req)` in `server/auth.js`. Everything
downstream consumes the shape `{ id, email, role, name }`. As long as that
shape is stable, `entities.js`, `payments.js`, `seats.js`, and `admin.js`
need no logic changes.

### Identity resolution (server)

1. Clerk issues a session. The browser holds Clerk's session token.
2. `getCaller(req)` reads the token from the request and verifies it with
   the Clerk secret key, getting `{ id: clerkId, email, firstName,
   lastName }`.
3. **Token transport:** Clerk's SPA SDK stores its session in a
   `__session` cookie (httpOnly=false) plus a `__client_uat` cookie. Our
   Vite dev server proxies `/api` to Express on the same effective origin,
   so those cookies are sent on every `/api` fetch automatically. In
   production the app is served by the same Express process, so again
   same-origin. `getCaller` therefore reads `req.headers.cookie` and
   extracts `__session` (a `Bearer` header is also accepted as a fallback
   for non-browser callers). No CORS, no manual header plumbing in
   `src/api/client.js` — the existing `credentials: 'include'` fetch keeps
   working as-is.
3. It upserts the email into `app_user` (first sign-in creates the row)
   and reads back `role`.
4. Returns `{ id: clerkId, email, role, name }` — same shape as today.

`id` is the Clerk user id. Seat holds (`seats.js`) and `created_by_id`
stamping (`entities.js`) store this id. That is fine — these are opaque
foreign keys, and there is no live production data whose `created_by_id`
we must preserve (build phase; test accounts reset).

### Roles and ownership

- `app_user.role` defaults to `'user'`. Admin and operator roles are set
  by seed / admin panel, matched by **email**.
- Operator dashboard access keys on `operator.owner_email === caller.email`
  (unchanged). Coupon and bus ownership likewise match on email.
- Nothing about the access-control rules in `entities.js` changes.

### Client

- `AuthContext` keeps its public contract
  (`{ user, isAuthenticated, isLoadingAuth, authChecked, logout,
  navigateToLogin }`) but its internals read Clerk instead of
  `db.auth.me()`. `Header`, `UserMenu`, `ProtectedRoute`,
  `OperatorDashboard`, `MyTrips`, `AdminPanel` keep working unchanged.
- Clerk's `<SignIn>` / `<SignUp>` components replace the custom
  `Login` / `Register` / `ForgotPassword` / `ResetPassword` pages.
  Google button is a Clerk-provided social option — no custom redirect
  logic.
- A small adapter maps the Clerk user → the `user` object shape the rest
  of the app expects (`{ id, email, role, full_name }`), pulling `role`
  from a lightweight `/api/me` the server now serves from `app_user`.

## Data model

New migration `007_clerk_app_user.sql`:

```sql
CREATE TABLE IF NOT EXISTS app_user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clerk_id TEXT,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user',
  created_date TEXT NOT NULL,
  updated_date TEXT
);
CREATE INDEX IF NOT EXISTS idx_app_user_clerk_id ON app_user(clerk_id);
```

- `email` is the unique join key (ownership model is email-based).
- `clerk_id` is stored for admin lookups and future Clerk webhooks.
- `role` default `'user'`.

Drop Better Auth's `user`, `session`, `account`, `verification` tables in
the same migration (they hold no data we keep).

## Endpoints

- `GET /api/me` — returns the signed-in caller's `{ id, email, role,
  full_name }` from `app_user` (creates the row on first sign-in). Used by
  the client adapter.
- `app.all('/api/auth/*')` Better Auth handler — removed.
- All `/api/entities`, `/api/payments`, `/api/seats`, `/api/admin`,
  `/api/coupons` routes — unchanged signatures; they already call
  `getCaller`.

## Environment

Added to pm2 env:

- `CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

Removed once verified:

- `BETTER_AUTH_SECRET`, `BETTER_AUTH_API_KEY`, `BETTER_AUTH_URL`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `CLIENT_ORIGIN` / `TRUSTED_ORIGINS` no longer drive auth (Clerk does)
  but stay harmless for `/api/config`.

## Dependencies

- Server: `@clerk/backend`
- Client: `@clerk/clerk-react`

Removed: `better-auth`, `@better-auth/infra`.

## Error handling

- Missing/invalid Clerk token → `getCaller` returns `null`; public routes
  stay public, protected routes 401 as they do today.
- `CLERK_SECRET_KEY` unset at boot → refuse to start (same guard pattern
  as today's `BETTER_AUTH_SECRET` check).
- `app_user` upsert failure → 500; sign-in still succeeds at Clerk but the
  request errors, surfacing the problem loudly rather than silently
  defaulting to a roleless user.

## Testing / verification

- Gates: `npm run lint` → `npm run typecheck` → `npm run build`.
- Live verify on the VPS after deploy:
  - `GET /api/health` → 200.
  - `GET /api/me` with a Clerk session → returns `{ id, email, role: 'user' }`.
  - Sign-in page loads; email+password and Google options both render.
  - Google sign-in completes end-to-end (the original bug — must no longer
    produce `redirect_uri_mismatch`).
  - Operator dashboard still scopes to the signed-in operator's
    `owner_email` data.

## Non-goals

- No Clerk webhooks / user-sync pipeline yet (only a lazy `app_user`
  upsert on first request). Webhooks can come later if we need
  deprovisioning or role changes to sync proactively.
- No change to the ownership model, entity-access rules, or any feature
  that merely reads `caller.email` / `caller.role`.
- No data migration of existing Better Auth password hashes (test
  accounts are reset).
