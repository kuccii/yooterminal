# AGENTS.md

## Project Context

React + Vite frontend for a Uganda/Rwanda bus-ticketing platform with a self-hosted
backend in `server/` (Express + SQLite + Better Auth). Keep changes focused on the
user's request and preserve existing project conventions.

Start with `README.md` for setup, environment variables, and the production workflow.

## Key Files

- `src/api/client.js`: the `db.entities.*` / `db.auth.*` client every page uses;
  talks to `/api` on the same origin (Vite proxies to the backend in dev).
- `src/lib/AuthContext.jsx`: `AuthProvider` / `useAuth` (session-backed).
- `server/index.js`: Express entry — `/api/auth` (Better Auth), `/api/entities`
  (generic entity API), static `dist/`.
- `server/entities.js`: entity registry (schemas + access rules) and the
  filter/sort/aggregate engine. Add new entities there plus a table in `server/db.js`.
- `server/auth.js`: Better Auth config; OTP codes and reset links print to the
  server console (swap in SMTP hooks here later).
- `server/seed.js`: demo data + seeded users; `npm run seed` recreates it all.
- `vite.config.js`: `@` alias and the `/api` proxy.

## Working Notes

- `npm run dev` runs API (:3001) and Vite (:5173) together — use it as the default
  local development command.
- `npm run lint`, `npm run build` should pass before finishing code changes.
  (`npm run typecheck` predates the backend swap and reports many pre-existing
  errors in the shadcn UI components; do not chase them in unrelated work.)
- Sessions are httpOnly cookies — no tokens in localStorage, and requests use
  `credentials: 'include'`.
- Entity access rules live in `server/entities.js` (`read`/`create`/`update`/`delete`
  per entity). Booking rows are scoped to their creator / operator owner / admin.
- Never commit `server/data/` or `.env`.
