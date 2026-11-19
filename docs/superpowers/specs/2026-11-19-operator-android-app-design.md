# YooTerminal Operator — Android app for the Sunmi V1

Date: 2026-11-19
Status: draft — awaiting approval
Relationship to the earlier spec: `2026-11-09-sunmi-pos-design.md` remains
authoritative for the counter-sale flow, printing and the POS backend. This
document covers the larger operator app and reuses those sections without
changing them.

## Goal

Replace the V1 spike with one native app that runs the **whole operator
business** on the Sunmi V1 (Android 6), because for many operators the phone is
the only screen they own:

1. **Sell** walk-up tickets for cash or Flutterwave mobile money and print one
   58mm ticket per passenger.
2. **Run the dashboard** — the same eleven areas as `/operator`: overview,
   timetable & fares, fleet, seat control, booked tickets, ticket validation,
   earnings, reports, customers, discount codes and account settings.
3. **Validate** a ticket by scanning its QR with the camera, with typed
   reference entry always available.
4. **Reprint** any ticket, online or from the local cache.

The web dashboard keeps working unchanged. The app and the web read and write
the same rows through the same access rules, so a schedule created on the phone
appears on the web immediately and vice versa.

## Non-goals

- Admin surfaces (users, roles, operators, refunds, uploads). Admins stay on the
  web.
- Multi-operator switching on one device. One device belongs to one company; a
  signed-in user who owns several companies picks one at sign-in.
- Offline selling. Writes require connectivity; reads fall back to a cache.
- Card payments, traveller self-service, refunds initiated by an operator.
- A WebView or PWA wrapper, and Android 6 support for the public website.
- A tablet/landscape layout.

## Verified constraints

| Constraint | Evidence |
|---|---|
| Sunmi V1, Android 6.0 (API 23), portrait, 5.5" screen | Device; current `pos-android` pins `minSdk 23`, `targetSdk 33` |
| Built-in 58mm printer, reachable only through the Sunmi AIDL service | Approved POS design; spike binds `woyou.aidlservice.jiuiv5.IWoyouService` |
| Rear camera present | User correction, 2026-11-19 |
| Live TLS chain is Let's Encrypt **ECDSA**: leaf → `YE1` → `Root YE` → `ISRG Root X2` → `ISRG Root X1` | `openssl s_client` against `www.yooterminal.com`, 2026-11-19 |
| Android 6 trusts neither ISRG X1 (added in 7.1.1) nor X2 | Android platform history; blocking, proven again on device in phase 0 |
| Server accepts TLS 1.2 | nginx config |
| `/api/entities` already exposes every row the dashboard uses | `server/entities.js`; operator tabs call only `Booking`, `Schedule`, `Bus`, `Coupon`, `Operator`, `DepartureSeat`, plus `/api/seats` |
| Flutterwave keys are configured in production | `/api/config` returns a live `flutterwavePublicKey` |
| Better Auth 1.4 ships the `bearer` plugin | `node_modules/better-auth/dist/plugins/bearer` |
| Sign-in already returns a session `token` in the JSON body | Local sign-up test, 2026-11-19 |
| Existing release keystore signs the app | `C:\Users\impat\keys\yooterminal-pos.jks`, alias `pos` |

The V1 has no Google Play Services guarantee, so nothing may depend on Play
Services (no Play Integrity, no Fused Location, no Play-hosted barcode model).

## Decisions taken in brainstorming

| Question | Decision |
|---|---|
| What runs on the device | Full operator dashboard **plus** counter selling and printing |
| Replaces or accompanies the web | Replaces it — full functional parity, not a companion |
| Offline | Writes online-only, reads cached with an "offline copy" label |
| Android 6 trust | Change the production certificate to a CA Android 6 trusts; no bundled root, no cleartext bootstrap |
| Ticket validation | Camera QR scan with typed reference always available |
| Hosting | Same origin, `www.yooterminal.com` |

## Architecture

**Native Kotlin, XML Views, one activity with fragments — not Compose, not a
WebView.**

```
┌──────────────────────── Sunmi V1 ────────────────────────┐
│ MainActivity (single, portrait, drawer + bottom nav)     │
│   ├─ SellFragment ──> SaleViewModel ──> PosApi           │
│   ├─ DashboardFragment (11 operator areas)               │
│   ├─ TicketsFragment (list, lookup, reprint)             │
│   ├─ ValidateFragment (camera + typed ref)               │
│   └─ SettingsFragment                                     │
│ SessionStore (Keystore AES-GCM)   CacheDb (Room)          │
│ TicketPrinter ── AIDL ──> woyou.aidlservice.jiuiv5        │
└───────────────────────────┬───────────────────────────────┘
                            │ HTTPS, TLS 1.2, bearer token
┌───────────────────────────▼───────────────────────────────┐
│ Express :3001                                             │
│   /api/auth          Better Auth + bearer plugin          │
│   /api/entities      generic CRUD (unchanged)             │
│   /api/seats         block / unblock / taken (unchanged)  │
│   /api/profile       name, phone, password, logo          │
│   /api/pos           NEW: context, sales, lookup, prints  │
│   SQLite: booking, schedule, bus, coupon, pos_sale        │
└───────────────────────────────────────────────────────────┘
```

Package stays `com.yooterminal.pos` so the existing keystore continues to sign
updates. `versionCode` restarts at 2; `versionName` `2.0.0`.

### Dependencies

Keep the set small — the V1 is low-RAM and Android 6 is the floor.

| Purpose | Library | Note |
|---|---|---|
| HTTP | OkHttp 4.12 | already present |
| JSON | Moshi 1.15 with **KSP codegen** | typed models; `Map<String, Any?>` for dynamic entity rows; no `kotlin-reflect` |
| Cache + print queue | Room 2.6 (KSP) | already in the approved design |
| QR decode | `com.journeyapps:zxing-android-embedded:4.3.0` | Camera1 API, works on API 23, no Play Services |
| QR encode | `com.google.zxing:core:3.5.3` | already present for printing |
| Token encryption | AndroidKeyStore AES-GCM | no extra dependency |
| UI | AppCompat, Material 1.12, ConstraintLayout | already present |

No Retrofit: the entity API is dynamic (`/:name`), so a thin typed client over
OkHttp is smaller and clearer. No WorkManager: a Room-backed print queue drained
on start, on printer-ready broadcast and on user retry is enough for a
single-process app. No reflection-based JSON: KSP generates adapters so the 1 GB
device does not load `kotlin-reflect`.

### Authentication

- Add `bearer()` from `better-auth/plugins/bearer` to `server/auth.js`.
  `getCaller()` then resolves `Authorization: Bearer <token>` with no other
  change, because it already calls `auth.api.getSession({ headers })`.
- The app signs in with `POST /api/auth/sign-in/email`, reads `token` from the
  body, and stores it encrypted:
  - AES-GCM key generated in `AndroidKeyStore`, `setUserAuthenticationRequired(false)`
    (the device has no reliable biometrics), ciphertext + IV in private
    `SharedPreferences`.
  - No password is stored. Email is remembered for prefill only.
- Every request carries the bearer token. `401` clears the session and returns
  to sign-in with a message; the app never retries a 401.
- After sign-in: `GET /api/me` gives role and identity; `Operator.filter({
  owner_email: email })` gives the company. Zero → "no company linked"; one →
  straight to Overview; several → picker, remembered per device. This works
  because `hiddenPublic: ['owner_email']` keeps the field when the caller's own
  email matches the row.
- Signing out, switching company, or receiving a `401` clears the token **and the
  Room cache**, so one operator's bookings never linger for the next user.
- Session lifetime is Better Auth's default. A shift that outlives it must
  re-authenticate; Settings shows the signed-in email so the next operator does
  not guess.

### API use

**Reused as-is** — this is what makes full parity affordable:

| Surface | Used by |
|---|---|
| `GET/POST/PATCH/DELETE /api/entities/Schedule` | Timetable & fares |
| `…/Bus` | Fleet |
| `…/Booking` (+ `POST /aggregate`) | Overview, Booked tickets, Validation, Earnings, Reports, Customers |
| `…/Coupon` | Discount codes |
| `…/Operator` | Company picker, branding |
| `…/DepartureSeat` | Occupancy |
| `GET /api/seats/taken`, `/blocked`, `POST /block`, `DELETE /unblock/:id` | Seat control, Sell seat grid |
| `/api/profile`, `/api/profile/password`, `/api/profile/logo` | Account settings |

Access rules stay server-side; the app cannot widen them.

**New — `/api/pos`** (from the approved POS design, unchanged in behaviour):

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/context` | Operator, currency, server time, minimum app version |
| `GET` | `/departures?date=` | Sellable departures with live seats and server price |
| `GET` | `/seats?trip_key=&travel_date=` | Taken, blocked, layout, capacity |
| `POST` | `/sales` | Cash sale or start mobile money, idempotent on `client_sale_id` |
| `GET` | `/sales/:id` | Status; tickets when paid; self-verifies stale pending sales |
| `POST` | `/sales/:id/cancel` | Release a pending sale and its hold |
| `GET` | `/bookings/:ref` | Operator-scoped reprint payload |
| `POST` | `/bookings/:ref/prints` | Print/reprint audit |
| `GET` | `/app-version` | Latest version, APK URL, SHA-256, minimum version |

The sale, payment, refund and idempotency rules are **exactly** those in
`2026-11-09-sunmi-pos-design.md` §Cash sale, §Mobile-money sale, §Idempotency,
including `quoteBooking()` server-side pricing and the `pos_sale` table
(migration `015_pos_sale.sql`). This design adds no parallel sale path.

**Reprint without a new endpoint** is possible because `booking.passengers` and
`booking.seats` already hold what a ticket needs; `/api/pos/bookings/:ref` exists
to scope, shape and audit it in one call.

### Certificate change (blocking, phase 0)

Change `www.yooterminal.com` from the Let's Encrypt ECDSA chain to a certificate
whose root ships in Android 6's system store.

- **Supplier: ZeroSSL**, chosen 2026-11-19. Issue through ACME
  (`https://acme.zerossl.com/v2/DV90`) with certbot, using EAB credentials
  fetched from ZeroSSL's API. The account access key is a server secret supplied
  out of band; it is held only in the server environment and is never committed,
  logged, or written into this repository.
- **RSA only**: `--key-type rsa --rsa-key-size 2048`. The chain must be
  leaf → ZeroSSL RSA domain-validation CA → **USERTrust RSA Certification
  Authority**, which Android 6 trusts. An ECDSA certificate would land on
  USERTrust ECC and reintroduce the original problem.
- Keep the current Let's Encrypt certificate material and nginx snippet backed up;
  rollback is a restore plus `nginx -s reload`.
- Keep TLS 1.2 enabled and allow RSA cipher suites; Android 6 rejects TLS 1.3-only
  and does not know the newer roots.
- **Gate:** on the device, the stock browser must load
  `https://www.yooterminal.com/api/health` and show JSON. If it does not, stop
  and revisit; the agreed plan does not bundle a root or fall back to cleartext.
- The same trusted origin serves the APK, so first install is a normal browser
  download with no "unknown certificate" prompt.

## Screens

Navigation: bottom bar with **Sell · Dashboard · Tickets · Validate · More**.
"More" is a grid of the remaining areas plus Settings. On a 5.5" screen a
persistent 11-item drawer is unusable one-handed; the grid is faster than a
drawer and keeps the four daily actions one tap away.

### 1. Sign in
Email + password, "remember email", server URL fixed to the production origin.
Shows app version and printer status. On success resolves the company.

### 2. Sell
Four steps in one scrolling screen, optimised for a queue:

1. **Date** — today or the next 7 days (segmented control).
2. **Departure** — cards: route, time, bus class, seats left, server price.
3. **Seats** — grid from `seat_layout`/`seats_total`; taken seats disabled,
   blocked seats struck through; up to 10 seats; one passenger name per seat.
4. **Contact + payment** — contact name and phone required, email optional;
   cash or mobile money (MTN/Airtel + payer phone).

Confirm → `POST /api/pos/sales`. Cash returns paid immediately; mobile money
opens the pending screen. On success the app prints one ticket per passenger and
shows a per-passenger result with **Retry**.

Holds are taken before confirmation exactly as the approved design specifies;
a `409` re-holds and asks the operator to confirm the seats again.

A **pending** operator can configure the company but never sells: `/departures`
only returns schedules whose `operator_status` is `approved`, so the Sell screen
shows "your company is awaiting approval" instead of a list.

### 3. Payment pending (mobile money)
Countdown, "check now", cancel, auto-poll every 3 s, resumes polling on
foreground. The webhook remains the source of truth.

### 4. Print result / print queue
Per-passenger success or failure. A failure never implies an unpaid ticket; the
job persists in Room and is retried from a "N tickets not printed" banner on
Overview and Tickets.

### 5. Overview
This month's revenue, tickets, passengers, load factor; today's departures with
sold/capacity; shortcuts to Sell, Validate and the manifest; pending-operator
banner when `operator.status !== 'approved'`.

### 6. Timetable & fares
List schedules grouped by route; create/edit/delete. Form uses pickers for
route, bus, departure time and days, numeric steppers for fare and seat count.
Fields and validation mirror `OperatorTimetableTab.jsx`.

### 7. Fleet
Bus cards with plate, model, class, seats, status; create/edit/delete. Seat
layout is a numeric/stepper editor with a live preview grid, not a free-text JSON
field.

### 8. Seat control
Pick date and departure, tap seats to block with an optional note; list blocked
seats with unblock. Uses `/api/seats` only.

### 9. Booked tickets
Upcoming / past / cancelled tabs, reference search, check-in, reprint, share
ticket details via the Android share sheet (WhatsApp and email by intent when
installed). Cancelled rows are read-only.

### 10. Ticket validation
Camera viewfinder decodes the QR (bare booking reference, as printed today), with
**Type reference** always one tap away. Camera permission is requested at first
use (Android 6 runtime permission); if denied, the screen falls back to typing
without blocking anything. Result shows passenger, seat, route, status and
validated state; "Check in" stamps `validated`, `validated_at`, `validated_by`
exactly like the web validator. Duplicate check-in is refused with "already
checked in"; cancelled tickets are refused visibly.

### 11. Earnings
Month picker; gross, commission, net, passengers, revenue by route, occupancy.
Read-only aggregates, same formulas as the web tab.

### 12. Reports
Date range, revenue, tickets, average fare, top routes, customer analytics, and
**Export CSV** written to the app's private cache directory and offered through
the share sheet or `ACTION_VIEW`. No storage permission is needed on Android 6
because the file never leaves app-private storage until the operator shares it.
Column set identical to `OperatorReportsTab.jsx`.

### 13. Customers
Customer list from booking aggregates with trips, total spend, phone, latest trip
and most-travelled route; tap for recent bookings.

### 14. Discount codes
Coupon list with usage and status; create/edit/deactivate/delete with percentage
or fixed discount, minimum, currency, expiry and max redemptions.

### 15. Account settings
Name and phone, change password, logo (camera capture or file pick, downscaled to
the server's 4 MB upload limit before sending), company switch when the user owns
several, device label, printer test and paper status, TLS/diagnostics panel (the
spike's buttons move here), app version and update check, sign out.

## Offline and caching

- **Reads:** every list and dashboard request is cached in Room keyed by
  `(endpoint, query)`. On a network failure the screen renders the cached body
  with a timestamped "Offline copy — last updated …" banner. On success the
  banner disappears.
- **Writes:** require connectivity. Failures surface a clear message and a retry;
  nothing is queued except sales, which retry with the same `client_sale_id`.
- **Sales:** never offline. `POST /sales` retries immediately, then three times
  with backoff. A repeated `client_sale_id` returns the stored sale, so a timeout
  cannot create a second booking.
- **Tickets:** the last 100 paid bookings are cached with passengers so lookup
  and reprint work with no signal.
- **Print jobs:** persisted until printed or explicitly dismissed.
- **Staleness:** seat grids always re-fetch before confirmation; a cached grid is
  never used to sell.

## Security

- HTTPS only, `usesCleartextTraffic="false"`, TLS 1.2+.
- Bearer token encrypted with an Android Keystore AES-GCM key; never in logs.
- Server enforces operator ownership on every read and write; the app cannot
  reach another company's rows.
- Amounts, discounts, commission and currency are computed server-side.
- Audit log entries for sales, cancellations, prints, reprints, validation and
  payment state changes.
- The Room cache holds customer names and phone numbers. It lives in app-private
  storage, is never world-readable, and is cleared on sign-out, company switch
  and `401`.
- Release APK signed with the existing offline keystore. In-app updates verify
  SHA-256 **and** the signing certificate before `ACTION_VIEW`.
- Diagnostics never print the token or full request bodies.

## Distribution and updates

- `https://www.yooterminal.com/pos/yooterminal-operator-<version>.apk` plus a
  `manifest.json` with version, SHA-256 and notes, generated by
  `scripts/publish-pos-apk.mjs` (reconciles the pending uncommitted change).
- First install: open the link on the device; Android 6 allows install from
  unknown sources once.
- On launch the app compares `versionCode` with the manifest, downloads with its
  own client, verifies hash and signature, and installs through `FileProvider`.
- Below the minimum supported version the app blocks selling and dashboard writes
  with an update prompt, but still prints queued tickets and opens cached data.

## Delivery phases

Each phase ends on the device, not on an emulator.

0. **Trust + auth gate.** Certificate swap and Android 6 verification; bearer
   plugin; `/api/pos/context` and `/api/pos/app-version` returning real data.
   Stop if the V1 cannot complete TLS.
1. **Shell.** Sign-in, Keystore session, company resolution, navigation,
   Overview, Booked tickets, Validation (camera + typed), offline cache. Ships
   value before selling exists.
2. **Sell + print.** Backend `pos_sale` migration, cash sale, seat holds,
   printing, print queue, recent tickets, reprint. Full device acceptance.
3. **Mobile money.** Flutterwave module extraction, charge initiation, polling,
   webhook finalisation, failure/expiry, POS refund queue.
4. **Configuration writes.** Timetable & fares, fleet, seat control, discount
   codes, account settings.
5. **Analysis + export.** Earnings, reports with CSV share, customers.
6. **Updates + pilot.** In-app update, version policy, 3-day soak on one device,
   then rollout.

Phases 1–2 make the device useful; 3–5 reach parity; 6 makes it maintainable.

## Verification

- **Backend:** `npm run test:server` extended with POS sale tests (cash,
  duplicate `client_sale_id`, seat conflict, bearer auth, cross-operator denial,
  refund queue). `npm run lint`, `npm run build`.
- **Android JVM:** existing 24 tests keep passing; new tests for entity query
  building, JSON decoding of `Booking`/`Schedule`, money formatting, QR
  generation, ticket formatting and cache keys.
- **Device checklist:** browser reaches `/api/health` over HTTPS; sign-in
  persists across reboot; printer status, sample print, paper-out recovery;
  cash sale end to end with correct change-free total; mobile-money sale end to
  end; QR scan of a printed ticket; reprint; airplane-mode cached lookup;
  app restart with an unprinted ticket; in-app update install.
- **Data check:** a schedule created on the phone appears on the web dashboard
  and vice versa; a phone sale is visible in the web Bookings tab.

## Risks

| Risk | Mitigation |
|---|---|
| Certificate change breaks the live site | Back up cert + nginx snippet; rollback is a restore and reload; verify the web and device immediately after |
| Android 6 still rejects the new chain | Phase-0 gate on the real device; do not proceed to app work until the browser loads `/api/health` |
| Sunmi printer SDK is third-party AIDL | Replace with Sunmi's official SDK before production; the spike's provenance note stands |
| Low RAM / slow CPU | XML views, no Compose, small dependencies, paginated lists, no background services |
| 11 areas on a 5.5" screen | Bottom bar for daily actions, grid for the rest, pickers and steppers over free text |
| Mobile money unsupported for RWF | Gate in phase 3; ship cash for RWF and mobile money for UGX if Flutterwave cannot charge RWF |
| Session expires mid-shift | Visible identity in Settings, clear re-auth prompt, no data loss — draft sale state survives sign-in |
| Duplicate bookings on retry | `client_sale_id` idempotency, tested |
| Paid but unprinted | Booking is the source of truth; persistent queue and reprint |
| Keystore loss | Existing key backed up offline; losing it permanently blocks updates |

## Open questions before implementation

1. ~~**Certificate supplier.**~~ Resolved: ZeroSSL, RSA, via ACME with EAB. The
   access key is a server-side secret and must be rotated after this issuance
   because it was shared in chat.
2. **RWF mobile money.** Default unless you say otherwise: ship **UGX mobile money
   + RWF cash** in phase 3, and add RWF mobile money only after a live Flutterwave
   test proves it is supported on this account.
3. **Logo on the device.** Default unless you say otherwise: allow it. Camera
   capture is available and the upload path already enforces a 4 MB limit.
