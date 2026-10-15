# Operator Reports Tab — Design

Date: 2026-10-15
Status: approved (user: "do what is better for now" — delegated to recommended approach)
Scope: sub-project #1 of the 5-part operator-features program

## Goal

Give bus-company operators (not just platform admins) a Reports tab with
period-filtered revenue/ticket performance, customer analytics, and CSV export.

Today AdminReportsTab gives the platform team charts, settlements, and best
routes. Operators' own tabs (Overview, Earnings) are unfiltered by date —
Earnings is all-time, Overview hard-codes the current calendar month. Operators
have no way to answer "how did last month go?" or "who are my repeat customers?".

## Approach

Client-side computation on top of the existing generic entity API
(`Booking.aggregate`, `Booking.filter`). No new backend endpoints.

- Server already scopes Booking reads by `operator_slug`/`owner_email`
  (read-scope ACL) — operator isolation is enforced server-side for free.
- `buildWhere` supports `$gte/$lt` range operators on both `filter` and
  `aggregate` (verified in `server/entities.js:228,532-566`).
- Soft cap: customer analytics + CSV use `Booking.filter` with `limit: 1000`.
  KPIs/charts/routes use server-side `aggregate` (uncapped).
- Alternative rejected: dedicated `GET /api/operator/reports` endpoint —
  duplicates read-scope logic and adds backend surface without need at current
  data volumes. Revisit if an operator exceeds ~1000 bookings in a period.

## UI

New 7th tab in OperatorDashboard nav (`BarChart3` icon, id `reports`, placed
after Earnings).

Component: `src/components/operator/OperatorReportsTab.jsx`
Props: `operator`, `routes` (same as Overview/Timetable for pretty labels).

### Filter bar

- Period preset `Select`: This month (default), Last month, Last 90 days,
  This year, All time, Custom range.
- Custom range: two `Input type="date"` (from / to), inclusive; end is
  converted to exclusive `$lt: to+1day` before querying.
- Export CSV `Button` (Download icon) — downloads the filtered booking rows.

### Period → filter mapping (on `paid_at`, status `paid`, `operator_slug`)

| Preset | paid_at |
|---|---|
| This month (default) | `$gte yyyy-MM-01`, `$lt` first of next month |
| Last month | `$gte` first of last month, `$lt` first of this month |
| Last 90 days | `$gte` today−90d, `$lt` tomorrow |
| This year | `$gte` Jan 1, `$lt` first of next year |
| All time | no date clause |
| Custom | `$gte from`, `$lt to+1day` |

Filtering on `paid_at` = sales period (matches Overview tab's month window).
Chart buckets by `travel_date` (departures being sold), like AdminReportsTab.

### Data fetches (all parallel, refetch on period/operator change)

1. `Booking.aggregate` groupBy `currency`, sum
   `[amount, platform_fee, operator_net, passenger_count]` — KPIs.
2. Per currency: `aggregate` groupBy `travel_date`, sum `[amount]`,
   sort `travel_date`, limit 31 — revenue-by-date chart (merged per currency,
   last 31 dates).
3. Per currency: `aggregate` groupBy `route_slug`, sum
   `[amount, passenger_count]`, sort `-sum_amount`, limit 10 — top routes.
4. `Booking.filter` fields
   `[booking_ref, travel_date, departure_time, origin_city, destination_city,
   seats, passengers, passenger_count, amount, currency, contact_name,
   contact_email, contact_phone, paid_at]`, sort `-paid_at`, limit 1000 —
   customer analytics + CSV source rows.

### Sections

1. **KPI row** (4× StatCard): Tickets sold; Gross revenue (per-currency stacked
   value like AdminReportsTab `moneyValue`); Platform commission
   (`sum_platform_fee`, fallback `gross × commissionPercentFor`); Net payout
   (`sum_operator_net ?? gross − fee`, same as EarningsTab).
2. **Revenue by travel date** — recharts `BarChart`, one `Bar` per currency,
   same styling as AdminReportsTab (`SERIES_FILLS`, CartesianGrid, Legend when
   multi-currency). Empty state: "No paid bookings in this period."
3. **Top routes** table (route label resolved via `routes` prop slug lookup,
   fallback slug; tickets; per-currency revenue lines) — top 10 by tickets.
4. **Customer analytics** card:
   - Repeat-customer rate (% of customers with ≥2 bookings) + unique-customer
     count.
   - Top 10 customers by booking count, then spend: contact name/email,
     trips (booking count), spend per currency.
   - Customer identity = lowercased `contact_email` (fallback bucket
     "unknown" for rows without email).
   - Footnote when 1000-row cap is hit: "Based on the latest 1,000 bookings in
     this period."

### CSV export

Client-side (no backend). Columns: booking_ref, travel_date, departure_time,
origin_city, destination_city, seats, passengers, passenger_count, amount,
currency, contact_name, contact_email, contact_phone, paid_at. Source: the
already-loaded filter rows (no refetch). RFC-style escaping (wrap in quotes,
double inner quotes). Filename: `reports-{operator.slug}-{period}.csv` via
Blob + `URL.createObjectURL` + anchor click.

## Out of scope

- Payout settlement statements (sub-project #3)
- Discount codes (sub-project #4)
- Manifest / passenger lists (sub-project #2)
- New server endpoints or migrations
- PDF export (user chose "Both" formats only for customer report as CSV+UI;
  PDF deferred unless requested)

## Verification

- `npm run lint`, `npm run typecheck`, `npm run build` green.
- Deploy to VPS (paramiko pattern), verify as `kigali.ops@example.com`:
  Reports tab renders, period switch refetches, chart/tables populate or show
  empty states, CSV downloads with correct rows, no rows from other operators.
- Commit + push `origin main:master`.
