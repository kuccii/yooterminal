# Sunmi V1 Printer + TLS Spike Results

**Status:** PENDING — the app builds and all JVM tests pass, but every row below
needs the physical Sunmi V1. Fill this in during the device session, then commit.

- Plan: `docs/superpowers/plans/2026-11-09-sunmi-pos-spike.md`
- Spec: `docs/superpowers/specs/2026-11-09-sunmi-pos-design.md`
- App: `com.yooterminal.pos`, version `1.0.0-spike`
- Device serial: _to record_ (`adb devices`)
- Android version on device: _to record_ (`adb shell getprop ro.build.version.release`)

## Checks

| Check | Result | Notes |
|---|---|---|
| Print service found | _pending_ | If no: `adb shell service list \| grep -i woyou`, `adb shell dumpsys package woyou.aidlservice.jiuiv5` |
| Service version | _pending_ | **Check printer** button |
| Printer status before print | _pending_ | READY expected |
| Printer status after print | _pending_ | |
| Sample ticket printed | _pending_ | photo / logcat |
| QR scans to `BLDEMO42` | _pending_ | scanner used |
| Out-of-paper reported as failure | _pending_ | remove the roll, tap **Print sample ticket** |
| TLS system trust | _pending_ | `Ok(200)` / `Failed(message)` |
| TLS with ISRG root | _pending_ | `Ok(200)` / `Failed(message)` |
| Install path | _pending_ | download / adb / file manager |
| Certificate warning on download | _pending_ | yes/no |

## Decision

One of:

- **Proceed** — service binds and prints, and one TLS mode returns 200. Record which
  TLS mode; that sets the phase-2 API host and trust-manager decision.
- **Proceed with vendor SDK** — service not found; evaluate Sunmi's vendor SDK before
  phase 2.
- **Stop** — neither TLS mode works or printing is unusable; recommend a newer device.

_Decision: pending device run._

## Build evidence (already verified without the device)

- `:app:assembleDebug` and `:app:assembleRelease` both succeed.
- JVM tests: 7 passing (`TlsProbeTest` 1, `PrinterStatusTest` 1, `QrTest` 1,
  `TicketFormatterTest` 4).
- Release APK signed: `CN=YooTerminal POS, O=YooTerminal, C=UG`, verified with
  `apksigner verify --print-certs`.
