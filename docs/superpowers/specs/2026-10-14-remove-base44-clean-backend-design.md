# Design: Remove Base44, clean self-hosted backend

**Date:** 2026-10-14
**Status:** Approved
**Scope:** Replace the Base44 BaaS with an in-repo Express + SQLite backend using Better Auth.

## Context

The app is a React/Vite bus-ticketing platform (Uganda/Rwanda) exported from Base44.
Today it has **no working backend**: `src/api/base44Client.js` is a stub whose entity
calls resolve to empty data, and every source file carries a `globalThis.__B44_DB__`
header injected by the Base44 export. `src/lib/AuthContext` is a virtual module the
Base44 Vite plugin used to generate — the file does not exist on disk.

## Goals

- Remove every Base44 dependency: SDK, Vite plugin, `base44/` folder, injected stubs, docs.
- Ship a real, self-contained backend in `server/`: Express + better-sqlite3 + Better Auth.
- Keep frontend churn minimal by reimplementing the existing `db.entities.*` / `db.auth.*`
  client interface against the new REST API.

## Non-Goals

- Real email delivery (SMTP) — OTP codes and reset links are logged to the server console
  behind a pluggable `sendEmail` hook.
- Google OAuth is configured but only activates when `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
  are present in `.env`.
- File uploads (`integrations.Core.UploadFile`) — unused by app code, dropped.
- Replacing the Base44-hosted marketing images in `src/lib/images.js` (URLs kept for now).

## Architecture

```
Browser ── same-origin /api/* ──> Express (server/)
                                  ├── /api/auth/*        Better Auth (cookie sessions)
                                  ├── /api/entities/*    generic entity CRUD + aggregate
                                  ├── static dist/       production build
                                  └── SQLite             server/data/app.db
Vite dev server proxies /api → http://localhost:3001
```

- Dev: `npm run dev` runs API + Vite together (`concurrently`).
- Prod: `npm run build && npm start` — Express serves `dist/` and the API.

## Backend (`server/`)

- **Framework:** Express 5, better-sqlite3, ESM.
- **Auth:** Better Auth mounted at `/api/auth` with the SQLite adapter.
  - Email + password sign-in; sessions are httpOnly cookies.
  - Registration requires OTP verification (Better Auth `emailOTP` plugin,
    `createSessionOnVerification: true`) — matches the existing
    `register → verifyOtp → session` frontend flow. `sendVerificationOTP` logs the code.
  - Forgot/reset password via Better Auth `forget-password`/`reset-password`;
    `sendResetPassword` logs the reset link (frontend extracts `resetToken` from it).
  - Google social provider, env-gated.
  - Extra profile field `role` (default `user`; seeded admin exists) exposed on `/api/auth/me`
    as `{ id, email, role, full_name }`.
- **Entity API** (`/api/entities/:name`) mirroring the SDK semantics the 40 call sites use:
  - `GET  /` list/filter: `?filter=<json>&sort=field|-field&limit=n&fields=a,b` → `{ items }`
  - `GET  /:id` → item or 404
  - `POST /` create (auto-stamps `id`, `created_by_id`, `created_date`) → item
  - `PATCH /:id` update → item
  - `DELETE /:id`
  - `POST /update-many` `{ filter, update: { $set } }`
  - `POST /aggregate` `{ query?, groupBy?, sum, avg?, sort?, limit? }` → `{ rows }`
    (group rows expose `sum_<field>` / `avg_<field>`, matching current chart code)
  - Filter operators: equality, `$in`, `$ne`, `$gt/$gte/$lt/$lte`, `$or` (array of subqueries).
    Values in filters are typed by column (numeric columns compare numerically, JSON columns
    — arrays/objects — compare as JSON).
- **Schema:** 12 tables generated from the `base44/entities/*.jsonc` schemas
  (Banner, Booking, Bus, City, Coupon, DepartureSeat, Operator, PlatformSetting,
  Review, Route, Schedule) plus a `user_profile` extension table keyed to Better Auth's
  `user.id` holding `role` and `full_name`. All app tables get `id`, `created_date`,
  `created_by_id`.
- **Authorization:** enforced server-side from the entities' `rls` blocks:
  - admin-only writes: Banner, City, Coupon, Operator, PlatformSetting, Review, Route
  - admin-or-owner (`owner_email = caller.email`) writes: Bus, Schedule
  - Booking: create by any signed-in user (stamped `created_by_id`); read/update limited to
    creator, admin, or `operator_owner_email = caller.email`; delete admin-only.
  - Reads are public except Booking (visibility rule above).

## Frontend changes

- New `src/api/client.js` implementing the `db` interface (entities + auth + sessions via
  `fetch(..., { credentials: 'include' })`). Replaces `src/api/base44Client.js`.
- New `src/lib/AuthContext.jsx` (replacing the Base44 virtual module) exposing
  `AuthProvider` / `useAuth` with: `user`, `isAuthenticated`, `isLoadingAuth`,
  `isLoadingPublicSettings` (false — no hosted settings), `authChecked`, `authError`
  (`{ type: 'auth_required' | 'user_not_registered' }`), `checkUserAuth`, `logout`,
  `navigateToLogin`.
- Replace the `globalThis.__B44_DB__` header line in every source file with an import of
  `@/api/client`; delete the line where `db` is unused.
- Delete Base44 leftovers: `base44/`, `src/lib/app-params.js`, `src/pages/OAuthConsent.jsx`
  (unrouted Base44 OAuth page), the plugin entry in `vite.config.js`, and the
  `data-base44-image` / `base44:image-replace` hooks in the responsive-image components
  (components themselves stay).
- `vite.config.js`: add `/api` proxy → `http://localhost:3001`.
- `package.json`: drop `@base44/sdk`, `@base44/vite-plugin`, `nitro`; add `express`,
  `better-auth`, `better-sqlite3`, `concurrently`; scripts `server`, `dev` (both), `start`.
- Update `README.md`, `AGENTS.md`, `CLAUDE.md` for the new workflow; remove `export-report.json`.

## Seed data

`npm run seed` populates a demo dataset: ~8 cities, ~10 routes, 3 operators (one admin-owned),
fleet buses, schedules for the coming days, platform settings, a couple of banners/reviews,
one demo coupon, plus an admin user (`admin@example.com`) and an operator owner
(`operator@example.com`) — passwords printed to the console.

## Error handling

- Entity API returns JSON errors `{ error: message }` with proper status codes
  (400 bad filter, 401 unauthenticated, 403 forbidden, 404 missing).
- The client layer throws `Error` with the server message, so existing UI try/catch
  and toast paths keep working. Auth errors map to `authError` types the app renders.

## Testing / verification

1. `npm run typecheck`, `npm run lint`, `npm run build` pass.
2. API verified end-to-end with curl: signup → OTP (console) → session cookie → entity
   CRUD → aggregate → role-gated write denial.
3. App verified in the browser via `npm run dev`: register/login, search seeded trips,
   complete a booking, admin panel CRUD, operator dashboard.
