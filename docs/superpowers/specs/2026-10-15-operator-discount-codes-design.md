# Operator Discount Codes — Design (sub-project #4)

Date: 2026-10-15
Status: approved ("do the rest")

## Goal

Operators create and manage their own discount codes; customers apply them at
checkout; codes only work on the issuing operator's bookings.

## Existing infrastructure reused

The platform already has a global coupon system: `coupon` table, admin CRUD
(`AdminCouponsSection`), checkout input + `POST /api/coupons/validate`, server
application at payment confirm (`payments.js` → `assertCouponUsable` /
`discountFor`). This sub-project scopes that system to operators instead of
building a parallel one.

## Server

- **Migration** `006_coupon_operator_scope.sql`: add `operator_slug`,
  `operator_owner_email`, `max_redemptions` to `coupon`; index on `code`.
- **Entity** `Coupon`: new columns; access
  `{ read: 'own', create/update/delete: 'ownerOrAdmin', ownerEmailField:
  'operator_owner_email' }` — operators see/edit only their rows (admin bypass
  keeps the admin UI working); global admin codes stay invisible to operators.
  `WRITE_PROTECTED.Coupon = { code, operator_slug, operator_owner_email }`.
- **Scoped lookup** (coupons.js validate + payments.js confirm): fetch all rows
  matching the code (case-insensitive); single-operator cart prefers the
  operator-specific row, then the global row; multi-operator cart accepts only
  global rows; no match → 400. This also prevents cross-operator code collisions.
- **Redemption cap**: `countCouponRedemptions(code, operatorSlug)` counts paid
  bookings using the code (operator codes counted per operator, global across
  all). `assertCouponUsable` gains `{ used, currency }` options → 400 when
  `max_redemptions` reached; payments also gains the previously missing
  currency check.
- **Checkout**: `/api/coupons/validate` body gains `operator_slugs[]` (unique
  leg slugs of the cart); confirm needs no change (slugs derived from trip keys).

## Operator UI

New dashboard tab **Discount codes** (`OperatorCouponsTab`, nav after
Customers, Tag icon): list own codes (code, discount, min amount, expiry, max
redemptions, used count via `Booking.aggregate` on own bookings, active
toggle), create/edit form (uppercase code, percent/fixed, currency, min
amount, expiry date, max redemptions), delete. Payload stamps
`operator_slug` + `operator_owner_email` (FleetTab pattern). Code immutable
after creation.

## Out of scope

- Per-route codes, one-time customer-bound codes, code apply from My Trips,
  changing global admin coupons (unchanged).

## Verification

Gates green; migration runs on pm2 restart; live: operator creates a code,
foreign operator's confirm rejects it, own confirm accepts and books at a
discount (amount + discount_amount recorded); admin UI still lists all codes.
