# SDD ledger — plan: docs/superpowers/plans/2026-11-19-operator-app-foundation.md

Plan: phase 0 + 1 of the native Android operator app (Tasks 0–16).
Spec authority: docs/superpowers/specs/2026-11-19-operator-android-app-design.md
Execution method: subagent-driven (fresh implementer per task + task review).
Workspace: .superpowers/sdd/2026-11-19-operator-app-foundation/
Branch: main (work on main per user approval of this plan; no worktree created)

## Pre-flight conflict scan

Pairs sharing files/interfaces:

| Pair | Produces vs consumes | Finding |
|---|---|---|
| T3 → T9 | build deps (KSP/Moshi/Room) vs AppContainer wiring | Clean — T9 does not consume Room; Room arrives T10 |
| T5 → T6 | SessionStore/FakeCipher vs ApiClient session.clear() on 401 | Clean — interface matches |
| T6 → T7 → T8 | ApiClient vs EntitySource/AuthApi/OperatorRepository | Clean — linear chain, stable interfaces |
| T8 → T12 | OperatorResolution/SignInViewModel vs CompanyChoice routing | Clean — consumed verbatim |
| T9 → T10 → T11 | AppContainer vs cache field vs ContextRepository/OverviewRepo | Clean — sequential, same file ordered 9→10 |
| T11 → T12 | OverviewFragment vs MainActivity routing | Clean — sequential, ordered |
| T13 ↔ T14 | Both consume EntitySource/Booking/CompanyStore; identical checkIn 3-field PATCH contract | Clean by design |
| T14 → T3/manifest | CAMERA permission deferred to T14 | Clean — deferred as planned |
| T9 deletes MainViewModel; T15 consumes TicketPrinter/TlsProbe | Diagnostics move to T15 | Clean — PosApp.printer and TlsProbe object remain |
| T16 → T0 | removes plain-HTTP fallback once HTTPS trusted on device | Clean — real ordered dependency |
| T0 → all device tasks | trusted origin for V1 | Real dependency; V1 hardware gate may partially block |

Self-consistency per task (test-vs-code, files created vs touched):

- T1: test sets DB_PATH before importing auth.js; db.js reads env at module load — works. Better Auth 1.4 `signUpEmail` returns `token`; `getSession({headers})` honors Bearer once plugin enabled. Clean.
- T2: test makeDb() operator columns match buildContext SQL (id,name,slug,country,status + owner_email in WHERE). Clean.
- T4: test parseQuery helper decodes URL-encoded values back to JSON; toQueryString must encode filter JSON. Clean.
- T5: FakeCipher round-trips `enc:x`; corrupt-blob test overwrites raw value; store must tolerate. Clean.
- T6: MockWebServer is http:// — ApiClient rejects non-https base URL; test for that exists. MockWebServer tests must use an http base or a test seam. NOTE for reviewer: plan says "http is rejected before a request is made" AND tests use MockWebServer (http). Implementer needs a seam (e.g. allow override in tests) — flagged in T6 dispatch.
- T8: AuthApi reads nested user.email/user.name from sign-in response — Better Auth sign-in response is `{token, user:{id,email,name}}`. Clean.
- T9: Destinations tests pin exact id lists; placeholders for all. Clean.
- T10: fake DAO tests; CacheKey order-independence test vs "append query verbatim" — the query object passed must be canonical; test wording "order-independent for the same query object" is satisfied if input is the same string. Clean.
- T11: month window test; Kampala zone math verified (2026-11-19T23:30Z → 2026-11-20). Aggregate row keys count/sum_amount/sum_passenger_count match entities.js engine. Clean.
- T12: CompanyChoice pick rules vs Task 8 resolution shapes. Clean.
- T13: filters mirror OperatorBookingsTab.jsx (upcoming $gte + $ne cancelled; past $lt + $ne cancelled; cancelled status only). Clean.
- T14: BL regex `\\bBL[A-Z0-9]{6,10}\\b` matches BL7K2M9QX (10 chars); "12A" fails both rules (3 chars). Clean.
- T15: consumes existing spike TicketPrinter interface + TlsProbe object — both exist. Clean.
- T16: publish script rewrite; keystore CN=YooTerminal POS expected. Clean.

Global constraints: no Compose/WebView/Play/Retrofit/WorkManager in any task; cleartext stays false; writes online-only; backend+Android gates present per task. Clean.

Rulings:
- Ruling: no worktree — plan + user approved execution on `main`; commits land on main sequentially, one per task. — Reason: single-device sequential plan, user approved the method on this branch; worktree adds merge overhead with no parallelism. — Cost if wrong: main carries intermediate states until task reviews pass; recoverable by reset since each task is its own commit.
- Ruling: Task 6 tests will need a test seam so MockWebServer (http://) can be used despite the https-only rule in production paths. — Reason: plan mandates both "reject non-https base" and "MockWebServer tests"; the seam (constructor takes http, production factory enforces https) is the only reading that satisfies both. — Cost if wrong: reviewer may flag the seam as widening; the https assertion test still guards PRODUCTION_BASE_URL.

## Task 0 — COMPLETED (with device gate BLOCKED)
- Commit: `1d28587` (base was `106ce42`)
- Runbook: `docs/ops/zerossl-certificate.md`
- Chain: RSA → ZeroSSL → Sectigo R46 → USERTrust RSA ✓
- Device gate: BLOCKED — no V1 attached via adb. Manual test required before Tasks 1–16 run on device.

## Task 1 — COMPLETED
- Commit: `425d319`
- Review: task-1-review.md
- All steps passed

## Task 2 — COMPLETED
- Commit: `7d1e374` (base was `425d319`)
- Report: task-2-report.md
- All steps passed: 7 tests pass, lint clean, build succeeds
- Note: `/app-version` endpoint added post-commit to match plan spec (returns snake_case keys)