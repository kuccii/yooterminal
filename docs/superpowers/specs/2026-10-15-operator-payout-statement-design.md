# Operator Payout Statements — Design (sub-project #3)

Date: 2026-10-15
Status: approved ("do it")

## Goal

Monthly reconciliation statements inside the operator Earnings tab: for a
chosen calendar month, show gross fares − platform commission = net payout,
per currency, printable and exportable as CSV.

## Approach

No new endpoints. `Booking.aggregate` groupBy `currency`, sum
`[amount, platform_fee, operator_net, passenger_count]`, query
`{operator_slug, status: 'paid', paid_at: {$gte 'YYYY-MM-01', $lt first-of-next-month}}`
— server read scope unchanged. Net = stored `operator_net`, fallback
`gross − fee` (same as Earnings KPIs). Commission fallback
`gross × commissionPercentFor` only when `platform_fee` absent.

## UI (inside OperatorEarningsTab, new section below existing content)

- Card "Payout statement": native `<input type="month">`, default = previous
  calendar month, selectable up to the current month (month-to-date allowed);
  Print + Export CSV buttons (`.no-print`).
- Statement body wrapped in `.manifest-print` (reuses existing print
  stylesheet — prints only this block): operator name, period label
  (`MMMM yyyy`), generated timestamp, paid booking + ticket counts; per-currency
  table Gross / Commission / Net with totals row.
- CSV via `@/lib/csv` `downloadCsv`: columns period, operator_slug, currency,
  gross, commission, net, paid_bookings, tickets.
- Empty state: "No paid bookings in this month."

## Out of scope

- PDF, multi-month statements, admin-initiated invoicing, payment tracking
  against statements.

## Verification

Gates green; deploy; live check as `kigali.ops@example.com` — statement
aggregate returns the known RWF booking for the month containing 2026-10-14;
bundle contains "Payout statement"; commit + push.
