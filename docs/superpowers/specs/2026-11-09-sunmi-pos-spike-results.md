# Sunmi V1 Printer + TLS Spike Results

**Status:** PENDING — the app builds and all JVM tests pass, but every row below
needs the physical Sunmi V1. Fill this in during the device session, then commit.

- Plan: `docs/superpowers/plans/2026-11-09-sunmi-pos-spike.md`
- Spec: `docs/superpowers/specs/2026-11-09-sunmi-pos-design.md`
- App: `com.yooterminal.pos`, version `1.0.0-spike`
- Device serial: _to record_ (`adb devices`)
- Android version on device: _to record_ (`adb shell getprop ro.build.version.release`)

## How to run

Install `pos-android/app/build/outputs/apk/release/app-release.apk`, open the app,
and use the five buttons. **Copy diagnostics** puts the whole log on the
clipboard, including the raw status reply — paste it into this file.

## Checks

| Check | Result | Notes |
|---|---|---|
| Print service found | _pending_ | If no: `adb shell service list \| grep -i woyou`, `adb shell dumpsys package woyou.aidlservice.jiuiv5` |
| Service version | _pending_ | **Check printer** → `service version` |
| Printer model / serial | _pending_ | **Check printer** → `printer model` / `printer serial` |
| Firmware mode | _pending_ | Expect `PRINT_MODE` (0xC3). `BOOTLOADER` (0xA5) means nothing will print |
| Status reply (DLE EOT) | _pending_ | Raw hex from **Check printer**. `none` means this firmware ignores DLE EOT and status falls back to broadcasts |
| Printer status before print | _pending_ | Expect `ready`; `unknown` is acceptable, `out of paper` is a real answer |
| Printer status after print | _pending_ | Should stay `ready` |
| Sample ticket printed | _pending_ | photo / logcat |
| Ticket layout legible | _pending_ | 32 columns, no wrapped or clipped lines, QR centred |
| QR scans to `BLDEMO42` | _pending_ | scanner used; note how close the phone must be |
| Out-of-paper reported as failure | _pending_ | Remove the roll, tap **Print sample ticket**. Expected: `print: failed — printer not ready: out of paper`. If it says `success`, DLE EOT is unsupported and the broadcast path also missed it — record that |
| Cover-open reported as failure | _pending_ | Open the cover mid-print |
| Reprint after paper refill | _pending_ | Printer must not stay bold after a failed print |
| TLS system trust | _pending_ | `Ok(200)` / `NotTrusted(...)` / `NetworkError(...)` / `HttpError(...)` |
| TLS with ISRG root | _pending_ | same vocabulary — the difference between the two rows is the whole point |
| Install path | _pending_ | download / adb / file manager |
| Certificate warning on download | _pending_ | yes/no |

## Decision

One of:

- **Proceed** — service binds and prints, and one TLS mode returns `Ok(200)`.
  Record which mode; that sets the phase-2 API host and trust-manager decision.
- **Proceed with vendor SDK** — service not found; evaluate Sunmi's vendor SDK
  before phase 2.
- **Stop** — neither TLS mode works or printing is unusable; recommend a newer
  device.

_Decision: pending device run._

## Build evidence (already verified without the device)

- `:app:assembleDebug`, `:app:assembleRelease` and `:app:lintDebug` all succeed.
- JVM tests: **24 passing** — `TicketFormatterTest` 7, `PrinterStatusTest` 5,
  `MoneyTest` 4, `QrTest` 3, `PrintStyleTest` 3, `TlsProbeTest` 1,
  `AidlContractTest` 1.
- `QrTest` decodes the rendered bitmap back to `BLDEMO42` with ZXing, so the QR
  is proven scannable in software; the device row is about print quality only.
- Release APK signed: `CN=YooTerminal POS, O=YooTerminal, C=UG`, verified with
  `apksigner verify --print-certs`.
- Lint: 0 errors, 7 warnings — all deliberate (`OldTargetApi` for the Android 6
  fleet, plus "newer version available" notices).

## Deviations from the plan

Recorded so the next phase does not re-derive them:

1. **Status is queried, not assumed.** `getFirmwareStatus()` returns firmware
   *mode* (0 / 0xA5 / 0xC3), not paper state. Paper/cover state comes from a
   `DLE EOT 1` query over `sendRAWData`, with vendor broadcasts as fallback.
   The reply is validated against the ESC/POS bit pattern so a hex-text answer
   is not misread as "out of paper".
2. **`print()` runs on `Dispatchers.IO`** with a 20 s overall budget, instead of
   per-step timeouts only. Per-step is 5 s.
3. **Style is cached** (`PrintStyle`): alignment/emphasis are sent only when
   they change, and bold is force-cleared in a `finally`.
4. **Printer is app-scoped** (`PosApp`), not bound to Activity visibility, and
   the activity is locked to portrait.
5. **`Ticket` carries `fareMinor` + `currency`** (formatted by `Money`) and an
   explicit `qrPayload`, so the formatter never decides what the QR encodes.
6. **QR quiet zone is 4 modules** (was 1), still rendered at 384 px.
7. **TLS failures are classified** (`NotTrusted` / `NetworkError` / `HttpError`),
   and both probes share one `ConnectionSpec` so trust is the only variable.
8. **AIDL provenance documented** in `app/src/main/aidl/PROVENANCE.md`; still
   third-party and must be replaced with Sunmi's official SDK before production.
