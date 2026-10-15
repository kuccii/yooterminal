# Clerk Auth Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Better Auth with Clerk end-to-end so sign-in (email+password and Google) works with no self-managed OAuth/redirect config.

**Architecture:** The load-bearing change is `getCaller(req)` in `server/auth.js`. Today it reads a Better Auth session cookie and returns `{id, email, role, name}`; every server route (`entities`, `payments`, `seats`, `admin`, `coupons`) consumes that exact shape. We keep the shape stable and only change where identity comes from: Clerk verifies the `__session` cookie (or `Authorization: Bearer`), then a new `app_user` table keyed by email supplies `role`. Because the whole ownership model matches on `email` (not id), nothing in the access-control logic changes. On the client, `AuthContext` keeps its public contract (`{user, isAuthenticated, isLoadingAuth, authChecked, authError, checkUserAuth, navigateToLogin, logout}`) but reads Clerk instead of `db.auth.me()`; Clerk's `<SignIn>` replaces the custom Login/Register pages.

**Tech Stack:** `@clerk/express` (server, `createClerkClient().authenticateRequest`), `@clerk/clerk-react` (client, `ClerkProvider`/`SignIn`/`useUser`/`useAuth`/`useClerk`), existing Express 5 + better-sqlite3 + Vite + react-router-dom v6.

**Spec:** `docs/superpowers/specs/2026-10-15-clerk-auth-migration-design.md`

## Global Constraints

- No new npm dependencies beyond `@clerk/express` (server) and `@clerk/clerk-react` (client). Remove `better-auth` and `@better-auth/infra`.
- Gates run in this order after each task that changes code: `npm run lint` → `npm run typecheck` (`tsc -p ./tsconfig.server.json`) → `npm run build`. All must pass.
- No code comments unless the file already uses them for a non-obvious reason. The `unused-imports` eslint rule is active — never leave an unused import.
- `>500 kB` chunk warning from Vite is benign; ignore it.
- Server env (pm2): `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` must be set before boot. Remove `BETTER_AUTH_SECRET`, `BETTER_AUTH_API_KEY`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` after cutover verified.
- Clerk keys (PRODUCTION/live): the publishable key (`pk_live_...`) goes in `.env` as `VITE_CLERK_PUBLISHABLE_KEY` (client, baked at build) and `CLERK_PUBLISHABLE_KEY` (server). The secret key (`sk_live_...`) goes in `.env` as `CLERK_SECRET_KEY` (server only, never client) and on pm2. Real values live in the untracked `.env` / pm2 env — never commit them. Live keys are domain-locked — `www.yooterminal.com` (and ideally `yooterminal.com`) MUST be registered as a production domain in the Clerk dashboard (Settings → Domains) before live sign-in will succeed.
- Deploy host `72.60.188.94`, app `/var/www/zigzagbus`, pm2 process `zigzagbus-web`, health `http://127.0.0.1:3001/api/health`.
- Migration files are additive `*.sql` in `server/migrations/`, applied name-sorted and tracked in `schema_migrations` (see `runMigrations` in `server/db.js`).

---

### Task 1: Server — Clerk identity plumbing (migration + getCaller + /api/me)

This is the load-bearing task. After it, the server authenticates via Clerk and every existing route keeps working unchanged.

**Files:**
- Create: `server/migrations/007_clerk_app_user.sql`
- Modify: `server/auth.js` (full rewrite of body; keep filename so 5 imports stay valid)
- Modify: `server/index.js:1-6,23-25,29-34` (drop Better Auth handler + imports; add `/api/me`)
- Modify: `package.json` (deps)

**Interfaces:**
- Consumes: Clerk `authenticateRequest` returning `{ isAuthenticated, toAuth() }`; `toAuth().userId`, `toAuth().sessionClaims` (`{ email, first_name, last_name }`); `sqlite` from `./db.js`.
- Produces: `getCaller(req) -> Promise<{id, email, role, name} | null>` (unchanged shape). `googleEnabled` export → replace with a constant `false` OR keep export but always `false` (client reads `/api/config`). `GET /api/me -> {id, email, role, full_name}` (401 when signed out).

- [ ] **Step 1: Install/remove deps**

```bash
npm install @clerk/express
npm uninstall better-auth @better-auth/infra
```

- [ ] **Step 2: Write the app_user migration**

`server/migrations/007_clerk_app_user.sql`:

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
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS account;
DROP TABLE IF EXISTS verification;
```

Note: do NOT drop `user` here — `seed.js` and any leftover code may still reference it during the transition; Task 5 removes the last references. Dropping Better Auth's `session`/`account`/`verification` is safe now because nothing else reads them.

- [ ] **Step 3: Rewrite `server/auth.js`**

Replace the entire file with:

```js
import { createClerkClient } from '@clerk/express';
import { sqlite } from './db.js';

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const EXTRA_ORIGINS = (process.env.TRUSTED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!process.env.CLERK_SECRET_KEY) {
  console.error(
    '[server] CLERK_SECRET_KEY is not set. Set it in the process environment (pm2 env / shell) and restart. Refusing to start.',
  );
  process.exit(1);
}

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
});

const authorizedParties = [CLIENT_ORIGIN, ...EXTRA_ORIGINS].filter(Boolean);

function extractBearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function extractSessionCookie(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)__session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function upsertAppUser({ clerkId, email, fullName }) {
  const now = new Date().toISOString();
  const normalizedEmail = String(email || '').toLowerCase();
  const existing = sqlite
    .prepare('SELECT id, role, full_name FROM app_user WHERE email = ?')
    .get(normalizedEmail);
  if (existing) {
    sqlite
      .prepare('UPDATE app_user SET clerk_id = ?, full_name = ?, updated_date = ? WHERE id = ?')
      .run(clerkId, fullName || existing.full_name || '', now, existing.id);
    return { id: String(existing.id), email: normalizedEmail, role: existing.role, name: existing.full_name || fullName || '' };
  }
  const result = sqlite
    .prepare('INSERT INTO app_user (clerk_id, email, full_name, role, created_date) VALUES (?, ?, ?, ?, ?)')
    .run(clerkId, normalizedEmail, fullName || '', 'user', now);
  return { id: String(result.lastInsertRowid), email: normalizedEmail, role: 'user', name: fullName || '' };
}

/** Resolve the signed-in user for a request, or null. */
export async function getCaller(req) {
  const token = extractSessionCookie(req) || extractBearer(req);
  if (!token) return null;
  try {
    const request = new Request(`${req.protocol}://${req.headers.host}${req.url}`, {
      method: req.method,
      headers: { cookie: req.headers.cookie || '', authorization: `Bearer ${token}` },
    });
    const { isAuthenticated, toAuth } = await clerkClient.authenticateRequest(request, {
      authorizedParties: authorizedParties.length ? authorizedParties : undefined,
    });
    if (!isAuthenticated) return null;
    const authObject = toAuth();
    const userId = authObject.userId;
    if (!userId) return null;
    const claims = authObject.sessionClaims || {};
    const email = claims.email || claims.primary_email || '';
    if (!email) return null;
    const fullName = [claims.first_name, claims.last_name].filter(Boolean).join(' ') || claims.name || '';
    return upsertAppUser({ clerkId: userId, email, fullName });
  } catch {
    return null;
  }
}

export async function getMe(req) {
  return getCaller(req);
}

export const googleEnabled = true;
```

Key decisions: the cookie token is preferred, Bearer is the fallback; `authorizedParties` is derived from the existing origin env vars so CSRF protection is preserved; the `Request` handed to `authenticateRequest` is reconstructed from the Express `req` because Clerk's Express helper expects a Fetch-style `Request`. `googleEnabled` is now always `true` — Google is configured in Clerk's dashboard, not ours; the client `/api/config` still gates the Google button.

- [ ] **Step 4: Update `server/index.js`**

Remove lines 1-6 Better Auth imports (`toNodeHandler`, `auth`) and the `app.all('/api/auth/*splat', ...)` block at lines 23-25. Keep `googleEnabled` import. Add the `/api/me` route right after `/api/config`:

```js
import { getCaller, googleEnabled } from './auth.js';

app.get('/api/me', async (req, res) => {
  const caller = await getCaller(req);
  if (!caller) return res.status(401).json({ error: 'Not signed in' });
  res.json({ id: caller.id, email: caller.email, role: caller.role, full_name: caller.name });
});
```

- [ ] **Step 5: Verify the server boots and gates pass**

```bash
npm run lint
npm run typecheck
npm run build
CLERK_SECRET_KEY=sk_test_x CLERK_PUBLISHABLE_KEY=pk_test_x PORT=3099 node server/index.js &
curl -s localhost:3099/api/health
curl -s localhost:3099/api/me   # expect 401
kill %1
```

Expected: lint/typecheck/build pass; health returns `{"ok":true}`; `/api/me` returns `{"error":"Not signed in"}`.

- [ ] **Step 6: Commit**

```bash
git add server/auth.js server/index.js server/migrations/007_clerk_app_user.sql package.json package-lock.json
git commit -m "feat(auth): authenticate server requests with Clerk, add app_user table"
```

---

### Task 2: Client — ClerkProvider, AuthContext adapter, sign-in route

After this, the app boots under Clerk, `useAuth()` still works for every existing consumer, and `/login` renders Clerk's `<SignIn>`.

**Files:**
- Modify: `src/main.jsx` (wrap `App` in `ClerkProvider`)
- Modify: `src/lib/AuthContext.jsx` (rewrite internals)
- Modify: `src/api/client.js:55-147` (replace `auth` block)
- Modify: `src/pages/Login.jsx` (Clerk `<SignIn>`)
- Modify: `src/App.jsx:55-58` (route stays `/login`; Register/Forgot/Reset redirect to `/login`)
- Create: none (reuse `AuthLayout` for visual wrapper around `<SignIn>`)

**Interfaces:**
- Consumes: `useUser`, `useAuth`, `useClerk` from `@clerk/clerk-react`; `db.auth.me()` now hits `/api/me`.
- Produces: `useAuth() -> { user: {id,email,role,full_name} | null, isAuthenticated, isLoadingAuth, isLoadingPublicSettings: false, authChecked, authError, setAuthError, checkUserAuth, navigateToLogin, logout }` — same keys as today so `Header`, `UserMenu`, `ProtectedRoute`, `DashboardLayout`, `OperatorDashboard`, `AdminPanel`, `MyTrips` need no changes.

- [ ] **Step 1: Install client dep**

```bash
npm install @clerk/clerk-react
```

- [ ] **Step 2: Wrap app in `ClerkProvider`**

`src/main.jsx`:

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import App from '@/App.jsx'
import '@/index.css'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
if (!publishableKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY')
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ClerkProvider
    publishableKey={publishableKey}
    signInUrl="/login"
    signInFallbackRedirectUrl="/"
    signUpFallbackRedirectUrl="/"
  >
    <App />
  </ClerkProvider>
)
```

- [ ] **Step 3: Rewrite `src/api/client.js` auth block**

Replace `currentUser` and the `auth: { ... }` object (lines 55-147) with:

```js
async function currentUser() {
  try {
    const data = await request('/me');
    if (!data || !data.email) return null;
    return {
      id: data.id,
      email: data.email,
      role: data.role || 'user',
      full_name: data.full_name || '',
    };
  } catch {
    return null;
  }
}

export const db = {
  entities: /** @type {any} */ (new Proxy({}, {
    get: (target, name) => entityClient(String(name)),
  })),
  auth: {
    async isAuthenticated() {
      return (await currentUser()) !== null;
    },
    me: currentUser,
  },
};
```

The old `loginViaEmailPassword`, `register`, `verifyOtp`, `resendOtp`, `logout`, `resetPassword*`, `loginWithProvider` are gone — Clerk owns those flows. Any residual caller will fail lint/typecheck and must be updated to use Clerk hooks (see Step 4/5).

- [ ] **Step 4: Rewrite `src/lib/AuthContext.jsx`**

```jsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth as useClerkAuth, useClerk } from '@clerk/clerk-react';
import db from '@/api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoaded: clerkLoaded, isSignedIn } = useClerkAuth();
  const { signOut } = useClerk();
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState(null);

  const checkUserAuth = useCallback(async () => {
    if (!clerkLoaded) return;
    setIsLoadingAuth(true);
    try {
      if (!isSignedIn) {
        setUser(null);
        setAuthError(null);
        return;
      }
      const me = await db.auth.me();
      setUser(me);
      if (me && !me.role) {
        setAuthError({ type: 'user_not_registered' });
      } else {
        setAuthError(null);
      }
    } catch {
      setUser(null);
      setAuthError(null);
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, [clerkLoaded, isSignedIn]);

  useEffect(() => {
    checkUserAuth();
  }, [checkUserAuth]);

  const navigateToLogin = useCallback(() => {
    const returnTo = `${location.pathname}${location.search}`;
    navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
  }, [navigate, location]);

  const logout = useCallback(async () => {
    try {
      await signOut();
    } finally {
      setUser(null);
      setAuthError(null);
      navigate('/');
    }
  }, [signOut, navigate]);

  const value = useMemo(
    () => ({
      user,
      setUser,
      isAuthenticated: Boolean(user),
      isLoadingAuth: !clerkLoaded || isLoadingAuth,
      isLoadingPublicSettings: false,
      authChecked,
      authError,
      setAuthError,
      checkUserAuth,
      navigateToLogin,
      logout,
    }),
    [user, clerkLoaded, isLoadingAuth, authChecked, authError, checkUserAuth, navigateToLogin, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

- [ ] **Step 5: Rewrite `src/pages/Login.jsx` to render Clerk `<SignIn>`**

```jsx
import { SignIn } from '@clerk/clerk-react';
import { LogIn } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';

export default function Login() {
  return (
    <AuthLayout icon={LogIn} title="Welcome back" subtitle="Log in to your account">
      <SignIn />
    </AuthLayout>
  );
}
```

- [ ] **Step 6: Collapse Register / ForgotPassword / ResetPassword to redirects**

`src/pages/Register.jsx`, `src/pages/ForgotPassword.jsx`, `src/pages/ResetPassword.jsx` each become:

```jsx
import { Navigate } from 'react-router-dom';

export default function Register() {
  return <Navigate to="/login" replace />;
}
```

(same for the other two, adjusting only the component name). This keeps any bookmarked `/register` URL working while Clerk's `<SignIn>` handles both sign-in and sign-up.

- [ ] **Step 7: Verify client builds**

```bash
npm run lint
npm run typecheck
npm run build
```

Expected: all pass. If `db.auth.*` methods are referenced anywhere (search `db.auth.`), they must now only be `me`/`isAuthenticated` — fix any leftover call sites (e.g. old `Header`/`UserMenu` logout that called `db.auth.logout()`) to use `useAuth().logout`.

- [ ] **Step 8: Commit**

```bash
git add src/main.jsx src/lib/AuthContext.jsx src/api/client.js src/pages/Login.jsx src/pages/Register.jsx src/pages/ForgotPassword.jsx src/pages/ResetPassword.jsx package.json package-lock.json
git commit -m "feat(auth): switch client to Clerk provider, AuthContext adapter, and SignIn"
```

---

### Task 3: Sweep leftover Better Auth call sites

Any file still calling removed `db.auth.*` methods or importing Better Auth must be fixed. This task is a search-and-repair pass; it produces no new interfaces.

**Files:**
- Modify: whatever `rg -n "db\.auth\.(logout|login|register|verify|reset|resend|setToken|loginWith)" src` returns.
- Modify: `src/components/Header.jsx`, `src/components/UserMenu.jsx` if they call `db.auth.logout` directly (they should use `useAuth().logout`).

**Interfaces:**
- Consumes: `useAuth().logout`, `useAuth().navigateToLogin`, Clerk `<UserButton>` (optional, not required).
- Produces: none new.

- [ ] **Step 1: Find stragglers**

```bash
rg -n "db\.auth\.|better-auth|Better Auth|sign-in/social|sign-in/email|sign-up/email" src server
```

- [ ] **Step 2: Fix each hit** to use `useAuth()` hooks or Clerk components. Example — if `UserMenu` has an onClick calling `db.auth.logout()`, change to `const { logout } = useAuth()` (already imported) and call `logout()`.

- [ ] **Step 3: Gates**

```bash
npm run lint
npm run typecheck
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(auth): remove remaining Better Auth client call sites"
```

---

### Task 4: Seed app_user roles from known operator/admin emails

Operators must keep dashboard access after cutover. Their `operator.owner_email` rows already exist; we just need matching `app_user` rows with the right `role`.

**Files:**
- Modify: `server/seed.js` (replace `ensureUser` + `user` table writes with `app_user`)

**Interfaces:**
- Consumes: `app_user` table (email, role, full_name); existing `operator.owner_email` values (`operator@example.com`, `kigali.ops@example.com`).
- Produces: `app_user` rows with `role='operator'` for those emails and `role='admin'` for `admin@example.com`.

- [ ] **Step 1: Rewrite `ensureUser` in `server/seed.js`**

Replace the `import { auth } from './auth.js'` and the `ensureUser` function with a password-less version (Clerk owns credentials; we only seed roles):

```js
function ensureUser({ email, name, role }) {
  const normalizedEmail = String(email).toLowerCase();
  const existing = sqlite.prepare('SELECT id, role FROM app_user WHERE email = ?').get(normalizedEmail);
  if (existing) {
    const ROLE_RANK = { user: 0, operator: 1, admin: 2 };
    if ((ROLE_RANK[role] ?? 0) > (ROLE_RANK[existing.role] ?? 0)) {
      sqlite.prepare('UPDATE app_user SET role = ?, updated_date = ? WHERE id = ?')
        .run(role, new Date().toISOString(), existing.id);
      console.log(`[seed] Promoted ${email} to ${role}.`);
    }
    return existing.id;
  }
  const result = sqlite
    .prepare('INSERT INTO app_user (email, full_name, role, created_date) VALUES (?, ?, ?, ?)')
    .run(normalizedEmail, name || email, role, new Date().toISOString());
  console.log(`[seed] Seeded ${role}: ${email} (sign in via Clerk to activate)`);
  return String(result.lastInsertRowid);
}
```

Update every call site of `ensureUser` to drop the `password:` field (it's unused now). Add `ensureUser({ email: 'admin@example.com', name: 'Admin', role: 'admin' })` if not already present.

- [ ] **Step 2: Gates**

```bash
npm run lint
npm run typecheck
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add server/seed.js
git commit -m "feat(auth): seed app_user roles from operator/admin emails"
```

---

### Task 5: Deploy to VPS with Clerk keys and live-verify

This is the production cutover. The test keys work for the live site during build phase; production keys/domain are a later, user-owned step.

**Files:**
- Create: `$env:TEMP\opencode\deploy_clerk.py` (paramiko script, same pattern as prior deploys)

**Interfaces:**
- Consumes: VPS SSH (password from `deploy_prozigzag.py`), pm2 process `zigzagbus-web`.
- Produces: live site serving Clerk auth; `/api/health` 200; `/api/me` 401 when signed out; sign-in page renders Clerk UI.

- [ ] **Step 1: Build locally and package**

```bash
npm run build
# zip server/, dist/, package.json, package-lock.json (exclude node_modules)
```

- [ ] **Step 2: Deploy script**

Paramiko: SFTP upload the archive to `/var/www/zigzagbus`, extract, then on the server run:

```bash
cd /var/www/zigzagbus
npm install --omit=dev
pm2 restart zigzagbus-web --update-env
```

And set pm2 env (once, persisted with `pm2 save --force`):

```bash
# Read the real values from the untracked .env — never inline secrets here.
pm2 set zigzagbus-web:CLERK_PUBLISHABLE_KEY "$VITE_CLERK_PUBLISHABLE_KEY"
pm2 set zigzagbus-web:CLERK_SECRET_KEY "$CLERK_SECRET_KEY"
pm2 unset zigzagbus-web:BETTER_AUTH_SECRET
pm2 unset zigzagbus-web:BETTER_AUTH_API_KEY
pm2 unset zigzagbus-web:BETTER_AUTH_URL
pm2 unset zigzagbus-web:GOOGLE_CLIENT_ID
pm2 unset zigzagbus-web:GOOGLE_CLIENT_SECRET
pm2 save --force
```

(Use the existing env-set pattern from `set_google_secret.py` — reading `/proc/PID/environ` and writing a full env file is more reliable than `pm2 set` for this process; reuse that approach.)

- [ ] **Step 3: Live-verify (Python script, not curl -d — PowerShell mangles JSON)**

Write `$env:TEMP\opencode\verify_clerk.py` that:
1. `GET https://www.yooterminal.com/api/health` → expect 200 `{"ok":true}`.
2. `GET https://www.yooterminal.com/api/me` (no cookie) → expect 401.
3. `GET https://www.yooterminal.com/login` → expect 200 HTML containing `clerk` (Clerk JS loaded) or at least not the old password form.
4. Sign up a throwaway account via Clerk's front-end API is out of scope for the script; instead, confirm the sign-in page loads and `/api/me` is reachable (the real sign-in test is interactive).

- [ ] **Step 4: Report**

Summarize: health OK, `/api/me` 401 (correct — signed out), sign-in page serving Clerk. Flag that **production keys + `yooterminal.com` domain in the Clerk dashboard** are required before real end-users can sign in, and that Google must be enabled in Clerk's SSO settings (one click, no redirect URI to copy).

- [ ] **Step 5: Commit deploy script artifact if kept**

```bash
git add docs/superpowers/plans/2026-10-15-clerk-auth-migration.md
git commit -m "docs: Clerk migration implementation plan"
```

(Only the plan doc goes in git; deploy scripts stay in temp.)
