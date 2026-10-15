# Operator Trip Manifest — Design (sub-project #2)

Date: 2026-10-15
Status: approved (user confirmed, including contact phone/email visibility)

## Goal

Give operators a printable, per-departure passenger manifest: one row per booked
seat for a chosen upcoming departure, with contacts, payment, and boarding
status — usable by drivers/conductors on trip day.

## Approach

No new endpoints. Extends the existing **Booked tickets** tab with a
List / Manifest mode toggle. Manifest data = `Booking.filter`
`{operator_slug, status: 'paid', travel_date: {$gte: today}}` (upcoming only —
day-of-trip tool), limit 200, grouped client-side by `trip_key` (fallback
`travel_date|departure_time|origin→destination`). Server read scope
(`operator_owner_email`) unchanged.

Validation status is the existing per-booking `validated` flag (set by
check-in / QR validation) — no extra lookup needed. Contact phone/email are
already shown in the list view today; the manifest formalizes them per seat.

## UI

- **Mode toggle** in OperatorBookingsTab header: List (default) / Manifest —
  same pill style as the existing filter chips. Search + filter chips hidden
  in manifest mode.
- **New component** `src/components/operator/OperatorManifest.jsx` rendered
  when mode === 'manifest':
  - Departure `Select`: upcoming departures, label
    `YYYY-MM-DD HH:MM · Origin → Destination (N seats)`, nearest date first.
  - Roster header (also the print header): operator name, departure label,
    generated-at timestamp, totals (bookings / seats / boarded count).
  - Table columns: **Seat | Passenger | Contact (name · phone · email) |
    Booking ref | Payment | Boarded** (✓ badge from `validated`).
    One row per seat; passengers[i] paired with seats[i]; rows sorted by seat
    (numeric-aware). Multi-booking contact repeated per seat row — correct for
    a boarding roster.
  - Actions (hidden on print): **Print** (`window.print()`), **Export CSV**.
  - Empty state: "No upcoming departures with paid bookings."

## Shared CSV util

New `src/lib/csv.js`: `csvEscape(value)`, `joinList(list)` (handles
`[{name}]` passenger objects and scalar seat arrays), and
`downloadCsv(filename, columns, rows)` (Blob + anchor click). OperatorReportsTab
switches to these helpers (removes its local copies) — payout statements
(sub-project #3) will reuse the same util.

## Print stylesheet

Append to `src/index.css` a scoped `@media print` block:

- everything hidden except `.manifest-print` subtree (visibility technique)
- `.no-print` elements (action buttons, toggle, selects) suppressed
- manifest container forced full-width, no shadows

## Out of scope

- Past-departure manifests (upcoming only for v1)
- Per-seat boarding (validated is per-booking; check-in stays in List mode)
- PDF generation (browser print dialog covers it)
- New endpoints / migrations

## Verification

- `npm run lint` / `typecheck` / `build` green.
- Deploy; verify live as `kigali.ops@example.com`: manifest mode renders,
  departure select populated from scoped bookings, CSV downloads, bundle
  contains manifest strings. No foreign-operator rows.
- Commit + push `origin main:master`.
