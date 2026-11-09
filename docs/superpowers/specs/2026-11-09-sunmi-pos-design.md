# Sunmi V1 POS — Design

Date: 2026-11-09
Status: approved (architecture, backend flow, printing, offline, security, rollout confirmed by user)

## Goal

Give an operator a native Android POS for the Sunmi V1 (Android 6) that can:

1. **Sell** a ticket at the terminal: pick a departure, seats and passengers, take
   **cash** or **Flutterwave mobile money**, create the booking, and **print one
   58mm ticket per passenger** on the built-in printer.
2. **Look up and reprint** a ticket bought online by booking reference.

The public website stays a modern React SPA and is not modified for the V1.

## Non-goals

- Offline selling (seat conflicts and payment reconciliation make this unsafe).
- A WebView/PWA wrapper or a browser print path.
- Card payments, operator-initiated refunds, coupons, and multi-leg bookings.
- Multi-operator switching on one device (one operator per device; the design
  does not hard-code it server-side).
- Android 6 support for the public site.

## Verified constraints

| Constraint | Evidence |
|---|---|
| Device is a Sunmi V1, Android 6.0 (API 23) | User confirmed |
| Sunmi printer is only reachable natively (AIDL service) | Sunmi developer docs; browser cannot bind a service |
| Public site is a Vite/React ES-module SPA with no service worker | `vite.config.js`, `public/manifest.json` |
| **The V1 will not trust the current TLS certificate** | Live chain is ECDSA: leaf → `YE1` → `Root YE` → `ISRG Root X2` → `ISRG Root X1`. `ISRG Root X1` was added to Android in 7.1.1, so API 23 rejects it |
| Server supports TLS 1.2 | `ssl_protocols` includes TLSv1.2 in `/etc/nginx/nginx.conf` |
| Existing seat holds are 10 minutes and owned by a user id | `server/booking.js` `HOLD_TTL_MS`, `departure_seat.holder_id` |
| Existing booking insert path requires a contact email and a Flutterwave verify | `server/payments.js` `/confirm` |
| JDK 17 and Android SDK 33–36 are installed; `gradle` and `adb` are not on PATH | Local environment |

### TLS decision (blocking)

The certificate problem is not optional: the V1 cannot reach
`https://www.yooterminal.com` at all, in the browser or in the app. Two things
break — the initial APK download and every API call.

**Primary approach:** serve the POS API and APK download from a hostname with a
certificate issued by a CA present in the Android 6 trust store (DigiCert or
Sectigo/USERTrust, e.g. a ZeroSSL certificate). One certificate change fixes the
browser download, `DownloadManager`, and the app with no custom TLS code.

**Fallback (if changing the certificate is not acceptable):** bundle
`ISRG Root X1` in the app and install a composite `X509TrustManager` on OkHttp
(default trust manager first, bundled root second). This fixes the app but
**not** the first browser download, which would then need USB/adb or a
file-transfer install. `network_security_config.xml` is not an option on API 23
(added in API 24).

The printer spike (phase 1) also proves which path works on the real device.

## Architecture

**Native Kotlin app, XML Views — not Compose, not a WebView.**

- Package `com.yooterminal.pos`, `minSdk 23`, `compileSdk 35`, `targetSdk 33`.
- Single-activity shell with fragments; ViewBinding; Material Components.
- Networking: OkHttp 4.12 + Retrofit 2.11 + Moshi 1.15, TLS 1.2 forced.
- Local storage: Room 2.6 for the ticket cache and print queue.
- Session token encrypted with an Android Keystore AES-GCM key.
- Printer access behind a `TicketPrinter` interface; `SunmiPrinter` binds
  `woyou.aidlservice.jiuiv5.IWoyouService`.

The backend is the existing Node/SQLite service plus a new operator-only
`/api/pos` router. The app never talks to Flutterwave directly.

```
Sunmi V1 app ──HTTPS──> /api/pos ──> SQLite (booking, pos_sale, departure_seat)
      │                    │
      │                    └──> Flutterwave charges API + webhook
      └── AIDL ──> Sunmi print service ──> 58mm printer
```

## Screens

1. **Sign in** — email + password, once per device; session persists.
2. **Home** — Sell ticket, Find booking, Recent tickets, Settings; status strip
   with online/offline, printer state, and app version.
3. **Sell** — date (today + 7 days) → departure → seats (grid from
   `seat_layout`/`seats_total`) → passengers (name per seat; contact name +
   phone required, email optional) → payment (cash or mobile money) → confirm.
4. **Payment pending** — mobile-money wait screen with countdown, "check now",
   and cancel; auto-polls every 3 s.
5. **Print result** — per-passenger success/failure with Retry; booking stays
   paid if printing fails.
6. **Find booking** — reference entry, operator-scoped result, per-passenger
   reprint, "already validated" warning.
7. **Recent tickets** — last 100 cached tickets, reprint from cache.
8. **Settings** — operator, device label, printer test print, paper status,
   sync/outbox state, update check.

## Backend

### Authentication

- Enable Better Auth's bearer plugin in `server/auth.js` so
  `Authorization: Bearer <session token>` resolves to a caller.
- `POST /api/auth/sign-in/email` returns the token to the app.
- Token stored encrypted with a Keystore AES-GCM key in private preferences.
- No password stored on the device.
- Every `/api/pos` handler resolves the caller and asserts operator ownership
  (admin override allowed), reusing the `assertOperatorAccess` pattern in
  `server/seats.js`.

### Endpoints

All under `/api/pos`, mounted in `server/index.js`, all authenticated.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/context` | Operator identity, currency, server time, app version policy |
| `GET` | `/departures?date=YYYY-MM-DD` | Operator's active schedules for that date, peak-adjusted price, seats taken/available |
| `GET` | `/seats?trip_key=…&travel_date=…` | Taken and blocked seats, seat layout, capacity |
| `POST` | `/sales` | Create a cash sale or start a mobile-money sale (idempotent) |
| `GET` | `/sales/:id` | Sale status; bookings and tickets when paid |
| `POST` | `/sales/:id/cancel` | Release a pending sale and its hold |
| `GET` | `/bookings/:ref` | Operator-scoped booking lookup for reprint |
| `POST` | `/bookings/:ref/prints` | Record a print/reprint audit event |
| `GET` | `/app-version` | Latest version, APK URL, SHA-256, minimum supported version |

`GET /context` response shape:

```json
{
  "operator": { "slug": "rwenzori-express", "name": "Rwenzori Express", "currency": "UGX" },
  "user": { "id": "u_7f3c1a9e", "email": "gate.a@rwenzoriexpress.com", "role": "operator" },
  "server_time": "2026-11-09T09:00:00.000Z",
  "app": { "min_version": 1, "latest_version": 1,
           "apk_url": "https://pos.yooterminal.com/downloads/yooterminal-pos-1.apk",
           "sha256": "9f2c41d7b8a0e6531c9d4f7a2b6e8c015d3a7f9b2c4e6d8a0b1c3e5f7a9d2b4c" }
}
```

`operator.currency` falls back to the platform default then `UGX` when the
operator record has none.

`POST /sales` request:

```json
{
  "client_sale_id": "0f6c2b1e-7a4d-4c9e-9b2f-3d5a8e1c7b40",
  "trip_key": "kampala-kigali~rwenzori-express~07:00~2026-11-14",
  "travel_date": "2026-11-14",
  "seats": ["12A", "12B"],
  "passengers": [{ "name": "John Doe", "seat": "12A" },
                 { "name": "Jane Doe", "seat": "12B" }],
  "contact_name": "John Doe",
  "contact_phone": "+256700000000",
  "contact_email": null,
  "payment_method": "cash",
  "mobile_money": null,
  "device_label": "Gate A — Sunmi V1"
}
```

Validation: caller owns the operator; schedule exists, is active and approved;
seats are 1–10, unique, match passengers one-to-one; passengers non-empty with
trimmed names; contact name and phone required; email, when present, must match
`^\S+@\S+\.\S+$`; mobile-money network in `MTN|AIRTEL` and phone present.

Price is always recomputed server-side with `quoteBooking()` — the client never
sends an amount.

### Cash sale

Single transaction. Generate the `pos_sale` id and booking reference up front so
they can be referenced inside the transaction:

1. `assertOwnActiveHold(trip_key, travel_date, seats, caller.id)`.
2. Delete the caller's hold, then `assertSeatsAvailable`.
3. Insert `pos_sale` with `status='paid'`, `payment_provider='cash'`, amount,
   currency and `booking_ref`.
4. Insert the booking with `status='paid'`, `payment_provider='cash'`,
   `payment_ref = 'cash:' + saleId`, `paid_at = now`.
5. Insert a permanent `departure_seat` row (`expires_at NULL`) exactly like the
   online flow, so the seats stay taken.
6. After commit: `notifyBookingStaff`, audit log, and an email receipt **only if
   `contact_email` is set**. POS never queues WhatsApp.

Response `201` returns the sale plus one ticket payload per passenger. If the
hold expired while the operator was typing, the request fails `409` and the app
re-holds and asks the operator to confirm the seats again.

### Mobile-money sale

1. `assertOwnActiveHold(...)`, then create a `pos_sale` with
   `status='pending_payment'`, a reserved `booking_ref`, and
   `provider_tx_ref = "POS-" + sale.id`.
2. Extend the caller's hold to `POS_HOLD_TTL_MS = 15 minutes`.
3. Charge Flutterwave (`/v3/charges?type=mobile_money_uganda` for UGX,
   `mobile_money_rwanda` for RWF) with `tx_ref`, amount, currency, phone,
   network, email (the contact email when present, otherwise the operator owner
   email, since Flutterwave requires one) and fullname. Store `provider_ref`
   and `provider_status`.
4. Return `202` with `status='pending_payment'` and the sale id.

Confirmation comes from **either** the webhook **or** polling — both call the
same idempotent `finalizePosSale(sale)`. `GET /sales/:id` also self-verifies: if
the local status is still `pending_payment` more than 5 seconds after creation,
it calls `verifyTransaction(provider_ref)` and finalizes on a successful result.
This covers a missed webhook.

`finalizePosSale(sale)` then:

- Re-read the sale; if already `paid`, return the stored result.
- In one transaction: `assertSeatsAvailable`; if a seat was lost, mark
  `seat_conflict`, set `refund_status='refund_pending'`, alert admins, create
  **no** booking.
- Otherwise insert the paid booking (`payment_provider='flutterwave'`,
  `payment_tx_id`), the permanent seat row, delete the hold, and set the sale
  `paid`.
- Queue the email receipt only when `contact_email` exists.

Failure handling:

- Provider reports failed → `status='failed'`, delete the hold, release seats.
- Hold expires with no payment → `status='expired'`; a late success webhook
  still calls `finalizePosSale`, which either books (if seats are free) or
  refunds.
- Operator cancels a `pending_payment` sale → `status='cancelled'`, hold
  released. If the charge was already captured, set
  `refund_status='refund_pending'` for `runPosRefundQueue()`. Cancelling a
  `paid` sale is rejected with `409` (operator-initiated refunds are out of
  scope).

The existing `/api/payments/webhook` gains one branch: a `tx_ref` starting with
`POS-` is routed to `finalizePosSale` instead of the booking lookup. Existing
booking webhooks are untouched.

### Flutterwave module and POS refunds

Extract the Flutterwave HTTP calls from `server/payments.js` into
`server/flutterwave.js`: `verifyTransaction(id)`, `requestRefund(transactionId)`
and `chargeMobileMoney({ txRef, amount, currency, phone, network, email, name })`.
`payments.js` switches to it with no behavior change, and `server/pos.js` uses it
for charges.

The existing `runRefundQueue()` only scans `booking` rows, so POS sales that need
a refund (seat lost during approval, or a captured charge on a cancelled sale)
get their own queue. Add `runPosRefundQueue()` next to it, called from the same
interval in `server/index.js`: select `pos_sale` rows with
`refund_status='refund_pending'` and `refund_next_attempt_at` due, call
`requestRefund(provider_ref)`, and record the result with the same backoff
schedule used for bookings. Refund outcomes are audit-logged and alert admins.

### Idempotency

`pos_sale` has `UNIQUE (operator_slug, client_sale_id)`. `POST /sales` first
looks up that pair; if the stored sale is `pending_payment` or `paid` it returns
that sale (and bookings when paid) instead of creating anything. This makes a
retry after a timeout safe for both cash and mobile money. A `failed`,
`cancelled`, or `expired` sale is not replayed — the app must start a new
attempt with a fresh `client_sale_id`.

### Booking references

Extract `nextBookingRef()` from `server/payments.js` into
`server/bookingRef.js` and reuse it in both routers. It already retries on
collision; extend the check to also scan `pos_sale.booking_ref` so a reference
reserved by a pending sale cannot be handed out twice.

### Data model — `server/migrations/015_pos_sale.sql`

```sql
CREATE TABLE IF NOT EXISTS pos_sale (
  id TEXT PRIMARY KEY NOT NULL,
  operator_slug TEXT NOT NULL,
  operator_name TEXT,
  device_label TEXT,
  client_sale_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  payment_method TEXT NOT NULL,
  payment_provider TEXT,
  trip_key TEXT NOT NULL,
  travel_date TEXT NOT NULL,
  route_slug TEXT,
  origin_city TEXT,
  destination_city TEXT,
  departure_time TEXT,
  seats TEXT,
  passengers TEXT,
  passenger_count REAL,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  amount REAL,
  currency TEXT,
  booking_ref TEXT,
  provider_ref TEXT,
  provider_tx_ref TEXT,
  provider_status TEXT,
  refund_status TEXT,
  refund_attempts INTEGER NOT NULL DEFAULT 0,
  refund_next_attempt_at INTEGER,
  error TEXT,
  created_date TEXT,
  updated_date TEXT,
  paid_at TEXT,
  created_by_id TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_sale_client ON pos_sale(operator_slug, client_sale_id);
CREATE INDEX IF NOT EXISTS idx_pos_sale_ref ON pos_sale(booking_ref);
CREATE INDEX IF NOT EXISTS idx_pos_sale_tx ON pos_sale(provider_tx_ref);
CREATE INDEX IF NOT EXISTS idx_pos_sale_status ON pos_sale(status, created_date);
```

Also add the `pos_sale` DDL to `APP_TABLES` in `server/db.js` so fresh
databases create it. It is **not** added to `server/entities.js`, so the generic
entity router never exposes it.

## Printing

### Abstraction

```kotlin
interface TicketPrinter {
    fun status(): PrinterStatus          // Ready, NoPaper, Overheated, LowVoltage, Error
    fun print(ticket: Ticket): PrintResult
    fun testPrint(): PrintResult
}
```

`SunmiPrinter` binds `woyou.aidlservice.jiuiv5.IWoyouService`
(`setPackage("woyou.aidlservice.jiuiv5")`), retries the bind with backoff, and
maps `updatePrinterState()` codes: `0` ready, `1` out of paper, `2` overheated,
`3` low voltage, `4` abnormal.

### Ticket layout (58mm / 384 dots)

Native printer commands only — alignment, bold, font size, text, bitmap, feed.
Text stays within 32 characters at the default font.

```
            YOOTERMINAL
         RWENZORI EXPRESS
--------------------------------
Kampala  ->  Kigali
Sat 14 Nov 2026      07:00
Seat 12A     1 of 2 passengers
--------------------------------
PASSENGER
John Doe
--------------------------------
REF  BL7K2M9QX
        [ QR CODE ]
--------------------------------
Paid  UGX 45,000    CASH
Contact  +256700000000
Issued   09 Nov 2026 14:32
--------------------------------
    Thank you for travelling
```

- QR content is the bare booking reference (`BL…`), matching what ticket
  validation accepts today. Generated with ZXing core as a bitmap and sent to
  the printer; no printer-side QR command dependency.
- One ticket per passenger, same reference, different name and seat.
- Reprints add `REPRINT n` and the print timestamp.
- Paper-out or a failed print leaves the booking paid and surfaces a retry on
  the home screen. A `pending_print_job` Room row survives app restarts.

### Print audit

`POST /api/pos/bookings/:ref/prints` records `{ seat, device_label, reprint }`
via `writeAuditLog`, action `pos.ticket_printed`. Reprints are always allowed
and always logged.

## Offline and caching

- Selling requires connectivity. There is no offline sale path.
- Brief drops: the app retries `POST /sales` with the same `client_sale_id`
  (immediate retry, then 3 attempts with backoff).
- Recent tickets: the last 100 paid bookings are cached in Room with full
  passenger and operator data. `Find booking` and `Recent tickets` fall back to
  the cache when the network fails, and the UI labels the result "offline copy".
- Pending mobile-money sales are re-polled when the app returns to foreground;
  the webhook remains the source of truth.
- Print jobs persist until printed; the home screen shows "N tickets not
  printed".

## Security

- HTTPS only, TLS 1.2+, no cleartext traffic (`android:usesCleartextTraffic="false"`).
- Session token encrypted at rest with a Keystore AES-GCM key.
- Server-side operator ownership on every endpoint; the app cannot read another
  operator's bookings.
- Amounts, fares, and commissions are computed server-side.
- Audit log entries for sales, cancellations, prints, reprints, and payment
  state changes.
- Release APK signed with a dedicated keystore held offline; the update flow
  verifies the downloaded APK's SHA-256 against `/app-version` and its signing
  certificate against the installed app before offering install.
- Optional Sunmi kiosk/lock-task mode to keep operators inside the POS.

## Distribution and updates

- APK hosted at a versioned URL
  (`/downloads/yooterminal-pos-<version>.apk`) on the Android-6-compatible
  hostname from the TLS decision (`pos.yooterminal.com`).
- First install: open the link on the device and allow install from unknown
  sources once.
- In-app update: on launch, compare `versionCode` with `/app-version`, download
  with the app's own OkHttp client, verify SHA-256, then install via
  `FileProvider` + `ACTION_VIEW`.
- The app blocks sales only below `min_version`, with a clear update message.

## Delivery phases

1. **Printer + TLS spike (gate).** A small signed APK that binds the Sunmi
   service, prints a sample ticket with a QR, and calls `/api/health` and
   `/api/pos/context` over HTTPS. Do not build the full app until both pass.
2. **Backend POS API.** Migration, bearer auth, context, departures, seats,
   cash sale, lookup, print audit, idempotency, refund queue, smoke script.
3. **Android MVP.** Sign-in, sell for cash, print, find/reprint, local cache,
   print-failure recovery.
4. **Flutterwave mobile money.** Charge initiation, polling, webhook
   finalization, failure/expiry/refund paths.
5. **Pilot and hardening.** One operator, one device; cash, mobile money,
   network drops, paper-out, reprint, update, and a 3-day soak.

## Risks

| Risk | Mitigation |
|---|---|
| V1 firmware exposes no usable print service | Phase-1 gate; fall back to Sunmi's vendor SDK, or recommend a newer device |
| TLS trust (confirmed) | Android-6-compatible certificate; bundled-root fallback; proven in the spike |
| Flutterwave mobile money may not cover RWF | Verify in phase 4; if unsupported, launch mobile money for UGX only and cash for RWF |
| V1 is low-RAM and slow | XML Views, no Compose, no WebView, small dependency set, paginated lists |
| Duplicate bookings after a network drop | `client_sale_id` idempotency and retry tests |
| Paid but unprinted ticket | Booking is the source of truth; persistent print queue and reprint |
| Seat lost while mobile money is approving | 15-minute POS hold, availability re-check at finalization, automatic refund on conflict |

## Verification

- `npm run lint`, `npm run typecheck`, `npm run build` green.
- Backend: a standalone Node script (`scripts/pos-smoke.mjs`, run against a local
  server with seeded data) covering cash sale, duplicate `client_sale_id`,
  seat conflict, mobile-money pending → webhook paid, pending → failed, expired
  sale, cross-operator access denied, reprint audit, and a seat-conflict sale
  entering `runPosRefundQueue()`. The repo has no test runner, so this is a
  plain script with a non-zero exit on failure.
- Device: print test, cash sale end-to-end, mobile-money sale end-to-end,
  airplane-mode reprint from cache, paper-out recovery, app restart with an
  unprinted ticket, and an update install.
- Confirm the V1 completes TLS against the chosen hostname before phase 2.
- Commit and push `origin main:master`.

## Out of scope (future)

- Offline selling with sync.
- POS refunds and cancellations after payment (beyond automatic conflict refunds).
- Multiple devices per operator with shared shift reporting.
- Card payments and customer-facing display.
