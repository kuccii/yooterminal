# ZigzagBus Web

React + Vite frontend for a Uganda/Rwanda bus-ticketing platform, with a self-hosted
backend in `server/` (Express + SQLite + [Better Auth](https://better-auth.com)).

## Stack

- **Frontend:** React 18, Vite, TanStack Query, Tailwind/shadcn UI. Data access goes
  through `src/api/client.js`, which exposes the `db.entities.*` / `db.auth.*` interface
  the pages use and talks to `/api` on the same origin.
- **Backend:** Express 5 in `server/`. Better Auth handles sessions (httpOnly cookies),
  email+password sign-in, email OTP verification, password reset, and optional Google
  sign-in. A generic entity API serves the 12 app tables with the app's access rules.
- **Database:** SQLite at `server/data/app.db` (gitignored, recreated by `npm run seed`).

## Prerequisites

1. Node.js 20+ (Node 24 recommended).
2. `npm install`

## Run locally

```bash
# The API refuses to start without BETTER_AUTH_SECRET (any non-empty value is fine in dev).
# PowerShell: $env:BETTER_AUTH_SECRET='dev-secret'; npm run dev
# bash:      BETTER_AUTH_SECRET=dev-secret npm run dev
npm run seed    # first time only — creates the DB and demo data
npm run dev     # API on :3001 + Vite on :5173 together
```

Open http://localhost:5173. The Vite dev server proxies `/api` to the backend.

Seeded accounts (passwords printed by `npm run seed`):

| Role     | Email                  | Password      |
| -------- | ---------------------- | ------------- |
| Admin    | admin@example.com      | admin1234     |
| Operator | operator@example.com   | operator1234  |

### Email delivery

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` and `SMTP_PASS` (and optionally
`SMTP_FROM`) in the **process environment** to deliver real email: OTP sign-in
codes, password resets, booking confirmations, cancellation notices and
departure reminders (sent the day before travel). Without SMTP, every message
is printed to the API server console instead — nothing is ever lost silently.

### Google sign-in (optional)

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the **process environment**
(the server does not load `.env` files) to enable it.

## Scripts

| Command         | What it does                                        |
| --------------- | --------------------------------------------------- |
| `npm run dev`   | API + frontend dev servers together                 |
| `npm run seed`  | (Re)create demo data in `server/data/app.db`        |
| `npm run build` | Production frontend build into `dist/`              |
| `npm start`     | Serve the API **and** `dist/` (production)          |
| `npm run lint`  | ESLint                                              |
| `npm run typecheck` | `tsc` over the checked JSX subset                |

## Production

```bash
npm run build
npm start           # serves dist/ and /api on :3001
```

Set these in the **process environment** (e.g. pm2 env — the server does not
load `.env` files, and a missing `BETTER_AUTH_SECRET` is a startup error):

- `BETTER_AUTH_SECRET` — required; generate one (`openssl rand -base64 32`)
- `CLIENT_ORIGIN` — the public frontend origin (default `http://localhost:5173`)
- `BETTER_AUTH_URL` — the public API origin (default `http://localhost:3001`)
- `TRUSTED_ORIGINS` — extra comma-separated origins allowed to call the API
- `PORT` — API/static port (default `3001`)
- `FLW_PUBLIC_KEY` — Flutterwave public key (enables the checkout popup)
- `FLW_SECRET_KEY` — Flutterwave secret key (server-side payment verification)
- `FLW_WEBHOOK_SECRET` — Flutterwave webhook verif-hash (enables the payment webhook at `/api/payments/webhook`)
- `SMTP_HOST` — SMTP server hostname (email disabled when unset)
- `SMTP_PORT` — SMTP port (default `587`; `465` enables implicit TLS)
- `SMTP_USER` — SMTP username
- `SMTP_PASS` — SMTP password
- `SMTP_FROM` — From address (defaults to `SMTP_USER`)

## Backend layout

```
server/
  index.js         Express entry: /api/auth, /api/entities, static dist/, reminder runner
  auth.js          Better Auth config (email/password, OTP, reset, Google)
  admin.js         Admin-only user list + role management (writes audit_log)
  audit.js         audit_log writer shared by admin + payments
  booking.js       Trip quoting, seat availability, coupon rules
  notifications.js Transactional emails (confirmation, cancellation, reminder)
  entities.js      Entity registry + filter/sort/aggregate engine + access rules
  db.js            SQLite connection + schema (auth tables + app tables)
  seed.js          Demo dataset + seeded users
  data/            app.db lives here (gitignored)
```

Access rules mirror the original app: most content is admin-written and publicly
readable; operators (matched by `owner_email`) manage their own buses and schedules;
bookings are visible to their creator, the operator owner, or admins.
