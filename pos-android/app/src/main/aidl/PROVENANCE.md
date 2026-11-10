# Vendored Sunmi AIDL — provenance

The print-service interface in this directory is **not** from Sunmi's official
SDK. It was taken from a third-party mirror and must be replaced before this app
handles real money.

| File | Source |
|---|---|
| `woyou/aidlservice/jiuiv5/IWoyouService.aidl` | `https://raw.githubusercontent.com/eusilvio/cordova-plugin-sunmi-inner-printer/9479982fc72a4c8c2d9f5d06fc2af7ca05aace79/src/android/woyou/aidlservice/jiuiv5/IWoyouService.aidl` |
| `woyou/aidlservice/jiuiv5/ICallback.aidl` | same commit, same directory |
| `com/sunmi/trans/TransBean.aidl` | same commit, same directory |
| `../java/com/sunmi/trans/TransBean.java` | same commit, same directory |

Pinned commit: `9479982fc72a4c8c2d9f5d06fc2af7ca05aace79`.

## Why this matters

`TransBean.java` is a `Parcelable` compiled into our process. A wrong or
hostile `readFromParcel` is code execution on a device that handles payments.
The interface version (`2.1`) may also differ from what the V1's installed
service exposes, which would surface as `NoSuchMethodError` at runtime.

`AidlContractTest` guards only that the methods we call are still declared — it
cannot tell you the file is trustworthy.

## Before production

1. Replace these files with the AIDL/SDK shipped by Sunmi for the V1
   (`woyou.aidlservice.jiuiv5`), and diff the method list against this one.
2. Re-run `AidlContractTest` and the device gate
   (`docs/superpowers/specs/2026-11-09-sunmi-pos-spike-results.md`).
3. Record the SDK version and checksum here.

Line endings are normalised to CRLF by git on Windows, so checksums of the
working copy are not stable; hash the committed blob instead if you need one.
