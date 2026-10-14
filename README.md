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
npm run seed    # first time only — creates the DB and demo data
npm run dev     # API on :3001 + Vite on :5173 together
```

Open http://localhost:5173. The Vite dev server proxies `/api` to the backend.

Seeded accounts (passwords printed by `npm run seed`):

| Role     | Email                  | Password      |
| -------- | ---------------------- | ------------- |
| Admin    | admin@example.com      | admin1234     |
| Operator | operator@example.com   | operator1234  |

### Email delivery (dev mode)

There is no SMTP yet: OTP codes and password-reset links are **printed to the API
server console**. The hooks to replace live in `server/auth.js`
(`sendVerificationOTP`, `sendResetPassword`).

### Google sign-in (optional)

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env` to enable it — see
`.env.example`.

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

Set these in the environment:

- `BETTER_AUTH_SECRET` — generate one (`openssl rand -base64 32`)
- `CLIENT_ORIGIN` — the public frontend origin (default `http://localhost:5173`)
- `TRUSTED_ORIGINS` — extra comma-separated origins allowed to call the API
- `PORT` — API/static port (default `3001`)

## Backend layout

```
server/
  index.js    Express entry: /api/auth, /api/entities, static dist/
  auth.js     Better Auth config (email/password, OTP, reset, Google)
  entities.js Entity registry + filter/sort/aggregate engine + access rules
  db.js       SQLite connection + schema (auth tables + app tables)
  seed.js     Demo dataset + seeded users
  data/       app.db lives here (gitignored)
```

Access rules mirror the original app: most content is admin-written and publicly
readable; operators (matched by `owner_email`) manage their own buses and schedules;
bookings are visible to their creator, the operator owner, or admins.
