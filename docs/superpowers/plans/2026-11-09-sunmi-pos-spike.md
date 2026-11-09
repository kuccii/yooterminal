# Sunmi V1 Printer + TLS Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove on the real Sunmi V1 that a native app can bind Sunmi's print service, print a 58mm ticket with a scannable QR, and reach the YooTerminal API over HTTPS — before any POS feature work starts.

**Architecture:** One Kotlin/XML-Views Android module at `pos-android/` with a single activity exposing three checks (TLS, printer, print sample). Sunmi's V1 print service is reached through vendored AIDL (`woyou.aidlservice.jiuiv5.IWoyouService`). TLS is probed twice: with the system trust store and with a composite trust manager that adds Let's Encrypt's `ISRG Root X1`.

**Tech Stack:** Kotlin 2.0.21, AGP 8.9.2, Gradle 8.14, compileSdk 35, minSdk 23, targetSdk 33, OkHttp 4.12, ZXing core 3.5.3, JUnit 4.13.2.

**Spec:** `docs/superpowers/specs/2026-11-09-sunmi-pos-design.md`

**Precondition:** the physical Sunmi V1 is reachable for Tasks 3–7. Tasks 1–2 and 4–6 can be completed without it; the gate stays open until the on-device steps pass.

**Spec deviation:** the spec says the spike calls `/api/pos/context`. That endpoint is built in the backend phase, so the spike calls the existing public `/api/health` instead. `/api/pos/context` is exercised in the backend phase.

## Global Constraints

- Package/applicationId `com.yooterminal.pos`; `minSdk 23`, `compileSdk 35`, `targetSdk 33`.
- Kotlin with XML Views and ViewBinding. No Jetpack Compose, no WebView.
- HTTPS only; `android:usesCleartextTraffic="false"`.
- Ticket paper is 58mm / 384 dots; text lines are at most 32 characters.
- QR content is the bare booking reference (`BL…`).
- The release keystore and its passwords never enter git.
- Vendor AIDL and constants verbatim; Sunmi's action strings contain typos (`jiuv5`, `ACITON`) that must not be "fixed".

## Review Focus

- **Printer service absent or a different package:** the app must report "service not found" and not hang or crash.
- **Out of paper, cover open, overheated:** the print call must return a visible failure, never a silent success.
- **Long or non-ASCII passenger names:** the formatter must wrap to ≤32 characters without losing characters or splitting a word mid-way.
- **Device clock far in the past/future:** TLS fails with an expiry error; the probe must show that message rather than a generic failure.
- **A certificate chain the V1 rejects:** the probe must distinguish "system trust failed, bundled root worked" from "both failed" so the TLS decision is unambiguous.

---

### Task 1: Scaffold the Android module and build a debug APK

**Files:**
- Create: `pos-android/settings.gradle.kts`
- Create: `pos-android/build.gradle.kts`
- Create: `pos-android/gradle.properties`
- Create: `pos-android/app/build.gradle.kts`
- Create: `pos-android/app/src/main/AndroidManifest.xml`
- Create: `pos-android/app/src/main/res/layout/activity_main.xml`
- Create: `pos-android/app/src/main/res/values/strings.xml`
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/MainActivity.kt`
- Modify: `.gitignore`

**Interfaces:**
- Produces: module `:app`, namespace `com.yooterminal.pos`, `MainActivity` with view IDs `statusText`, `checkTlsButton`, `checkPrinterButton`, `printTicketButton`.

- [ ] **Step 1: Create the Gradle files**

`pos-android/settings.gradle.kts`:

```kotlin
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "yooterminal-pos"
include(":app")
```

`pos-android/build.gradle.kts`:

```kotlin
plugins {
    id("com.android.application") version "8.9.2" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
}
```

`pos-android/gradle.properties`:

```properties
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
android.nonTransitiveRClass=true
kotlin.code.style=official
```

`pos-android/app/build.gradle.kts`:

```kotlin
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.yooterminal.pos"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.yooterminal.pos"
        minSdk = 23
        targetSdk = 33
        versionCode = 1
        versionName = "1.0.0-spike"
    }

    buildFeatures { viewBinding = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    buildTypes {
        release { isMinifyEnabled = false }
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.2.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.google.zxing:core:3.5.3")
    testImplementation("junit:junit:4.13.2")
}
```

- [ ] **Step 2: Create the manifest, layout, strings and activity**

`pos-android/app/src/main/AndroidManifest.xml`:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <queries>
        <package android:name="woyou.aidlservice.jiuiv5" />
    </queries>
    <application
        android:allowBackup="false"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:usesCleartextTraffic="false"
        android:theme="@style/Theme.Material3.DayNight.NoActionBar">
        <activity android:name=".MainActivity" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

`res/values/strings.xml`: one `<string name="app_name">YooTerminal POS Spike</string>`.

`res/layout/activity_main.xml`: a `ScrollView` containing a vertical `LinearLayout` with
`TextView` id `statusText` (`textIsSelectable="true"`, monospace) and three `Button`s
ids `checkTlsButton` ("Check TLS"), `checkPrinterButton` ("Check printer"),
`printTicketButton` ("Print sample ticket").

`MainActivity.kt`: `AppCompatActivity` using `ActivityMainBinding`; sets each button to
append a line to `statusText` naming the check. The real work is added in Tasks 2, 3 and 5.

- [ ] **Step 3: Create local.properties and ignore generated files**

`pos-android/local.properties` (never committed):

```properties
sdk.dir=C\:\\Users\\impat\\AppData\\Local\\Android\\Sdk
```

Append to `.gitignore`:

```
# Android POS app
pos-android/.gradle/
pos-android/build/
pos-android/app/build/
pos-android/local.properties
pos-android/keystore.properties
*.jks
*.keystore
```

- [ ] **Step 4: Generate the Gradle wrapper**

Run from `pos-android`:

```powershell
$gradle = (Get-ChildItem "$env:USERPROFILE\.gradle\wrapper\dists\gradle-8.14-all" -Recurse -Filter gradle.bat | Select-Object -First 1).FullName
& $gradle wrapper --gradle-version 8.14
```

Expected: `gradlew.bat`, `gradlew`, `gradle/wrapper/gradle-wrapper.jar` and
`gradle/wrapper/gradle-wrapper.properties` exist. If the cached distribution is
incomplete, download `https://services.gradle.org/distributions/gradle-8.14-bin.zip`,
unzip it, and run its `bin/gradle.bat` with the same arguments.

- [ ] **Step 5: Build the debug APK**

Run: `.\gradlew.bat :app:assembleDebug --no-daemon`
Expected: `BUILD SUCCESSFUL`, and `app\build\outputs\apk\debug\app-debug.apk` exists.

- [ ] **Step 6: Commit**

```bash
git add .gitignore pos-android
git commit -m "feat(pos): scaffold Android spike module"
```

---

### Task 2: Probe TLS with system trust and with the bundled ISRG root

**Files:**
- Create: `pos-android/app/src/main/res/raw/isrg_root_x1.pem`
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/net/TlsProbe.kt`
- Create: `pos-android/app/src/test/java/com/yooterminal/pos/net/TlsProbeTest.kt`
- Modify: `pos-android/app/src/main/java/com/yooterminal/pos/MainActivity.kt`

**Interfaces:**
- Produces: `enum class TrustMode { SYSTEM, SYSTEM_PLUS_ISRG }`,
  `sealed class TlsResult { data class Ok(val status: Int) : TlsResult(); data class Failed(val message: String) : TlsResult() }`,
  `object TlsProbe { fun bundledRootCertificate(file: File): X509Certificate; suspend fun probe(url: String, mode: TrustMode): TlsResult }`.

- [ ] **Step 1: Vendor the root certificate**

```powershell
New-Item -ItemType Directory -Force pos-android\app\src\main\res\raw | Out-Null
curl.exe -sL -o pos-android\app\src\main\res\raw\isrg_root_x1.pem https://letsencrypt.org/certs/isrgrootx1.pem
```

Expected: the file starts with `-----BEGIN CERTIFICATE-----` and is roughly 2 KB.

- [ ] **Step 2: Write the failing test**

`TlsProbeTest.kt`:

```kotlin
package com.yooterminal.pos.net

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class TlsProbeTest {
    @Test
    fun `bundled root parses as ISRG Root X1`() {
        val cert = TlsProbe.bundledRootCertificate(File("src/main/res/raw/isrg_root_x1.pem"))
        assertTrue(cert.subjectX500Principal.name.contains("CN=ISRG Root X1"))
        assertTrue(cert.basicConstraints >= 0)
    }
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `.\gradlew.bat :app:testDebugUnitTest --tests "*TlsProbeTest*" --no-daemon`
Expected: compilation failure — `TlsProbe` does not exist.

- [ ] **Step 4: Implement `TlsProbe`**

`bundledRootCertificate` reads the PEM with `CertificateFactory.getInstance("X.509")`.
`probe` builds an OkHttp client for the mode and performs `GET url` with a 15-second
timeout, returning `Ok(response.code)` or `Failed(throwable.message ?: throwable::class.java.simpleName)`.

For `SYSTEM`, use the OkHttp default client. For `SYSTEM_PLUS_ISRG`, build a
`CompositeTrustManager` that delegates `checkServerTrusted` to the platform default
manager first and, only if that throws `CertificateException`, to an `X509TrustManager`
built from a `KeyStore` containing the bundled root. Install it via
`SSLContext.getInstance("TLS").init(null, arrayOf(composite), null)` and
`sslSocketFactory(context.socketFactory, composite)`, with
`connectionSpecs(listOf(ConnectionSpec.MODERN_TLS))`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `.\gradlew.bat :app:testDebugUnitTest --tests "*TlsProbeTest*" --no-daemon`
Expected: `BUILD SUCCESSFUL`, 1 test passed.

- [ ] **Step 6: Wire the TLS button**

`MainActivity` runs both probes against `https://www.yooterminal.com/api/health` in
`lifecycleScope` and appends two lines: `system trust: …` and `system + ISRG root: …`.

- [ ] **Step 7: Verify on the device**

Install the debug APK (`adb install -r app\build\outputs\apk\debug\app-debug.apk`) or the
release APK from Task 6, open the app, tap **Check TLS**.

Record in the spike results (Task 7):

- If `system trust` is `Ok(200)`, the V1 accepts the current chain.
- If `system trust` fails and `system + ISRG root` is `Ok(200)`, the bundled-root
  fallback works and the TLS decision is "bundle the root in the app".
- If both fail, capture the exact message — the certificate itself must change.

- [ ] **Step 8: Commit**

```bash
git add pos-android
git commit -m "feat(pos): probe TLS trust with bundled ISRG root"
```

---

### Task 3: Bind the Sunmi print service and report status

**Files:**
- Create: `pos-android/app/src/main/aidl/woyou/aidlservice/jiuiv5/IWoyouService.aidl`
- Create: `pos-android/app/src/main/aidl/woyou/aidlservice/jiuiv5/ICallback.aidl`
- Create: `pos-android/app/src/main/aidl/com/sunmi/trans/TransBean.aidl`
- Create: `pos-android/app/src/main/java/com/sunmi/trans/TransBean.java`
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/printer/TicketPrinter.kt`
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/printer/SunmiPrinter.kt`
- Create: `pos-android/app/src/test/java/com/yooterminal/pos/printer/PrinterStatusTest.kt`
- Modify: `pos-android/app/src/main/java/com/yooterminal/pos/MainActivity.kt`

**Interfaces:**
- Produces: `enum class PrinterStatus { READY, OUT_OF_PAPER, COVER_OPEN, OVERHEATED, LOW_VOLTAGE, ERROR, UNKNOWN }` with `companion object { fun fromBroadcast(action: String?): PrinterStatus }`;
  `interface TicketPrinter { fun bind(); fun unbind(); suspend fun serviceVersion(): String?; fun status(): PrinterStatus; suspend fun print(ticket: Ticket): PrintResult }`;
  `sealed class PrintResult { object Success : PrintResult(); data class Failed(val message: String) : PrintResult() }`.

- [ ] **Step 1: Vendor the AIDL files and TransBean**

Run from the repo root, pinned to the upstream commit that carries the V1 AIDL:

```powershell
$base = "https://raw.githubusercontent.com/eusilvio/cordova-plugin-sunmi-inner-printer/9479982fc72a4c8c2d9f5d06fc2af7ca05aace79/src/android"
$aidl = "pos-android/app/src/main/aidl"
New-Item -ItemType Directory -Force "$aidl/woyou/aidlservice/jiuiv5","$aidl/com/sunmi/trans" | Out-Null
curl.exe -sL -o "$aidl/woyou/aidlservice/jiuiv5/IWoyouService.aidl" "$base/woyou/aidlservice/jiuiv5/IWoyouService.aidl"
curl.exe -sL -o "$aidl/woyou/aidlservice/jiuiv5/ICallback.aidl" "$base/woyou/aidlservice/jiuiv5/ICallback.aidl"
curl.exe -sL -o "$aidl/com/sunmi/trans/TransBean.aidl" "$base/com/sunmi/trans/TransBean.aidl"
curl.exe -sL -o "pos-android/app/src/main/java/com/sunmi/trans/TransBean.java" "$base/com/sunmi/trans/TransBean.java"
```

Expected: `IWoyouService.aidl` declares `interface IWoyouService` with 30+ methods in the
vendored order; `TransBean.aidl` is `package com.sunmi.trans; parcelable TransBean;`.
Do not reorder or trim methods — AIDL transaction ids depend on declaration order.

- [ ] **Step 2: Write the failing status test**

`PrinterStatusTest.kt`:

```kotlin
package com.yooterminal.pos.printer

import org.junit.Assert.assertEquals
import org.junit.Test

class PrinterStatusTest {
    @Test
    fun `maps vendor broadcast actions`() {
        assertEquals(PrinterStatus.OUT_OF_PAPER, PrinterStatus.fromBroadcast("woyou.aidlservice.jiuv5.OUT_OF_PAPER_ACTION"))
        assertEquals(PrinterStatus.COVER_OPEN, PrinterStatus.fromBroadcast("woyou.aidlservice.jiuv5.COVER_OPEN_ACTION"))
        assertEquals(PrinterStatus.OVERHEATED, PrinterStatus.fromBroadcast("woyou.aidlservice.jiuv5.OVER_HEATING_ACITON"))
        assertEquals(PrinterStatus.ERROR, PrinterStatus.fromBroadcast("woyou.aidlservice.jiuv5.ERROR_ACTION"))
        assertEquals(PrinterStatus.READY, PrinterStatus.fromBroadcast("woyou.aidlservice.jiuv5.NORMAL_ACTION"))
        assertEquals(PrinterStatus.UNKNOWN, PrinterStatus.fromBroadcast(null))
        assertEquals(PrinterStatus.UNKNOWN, PrinterStatus.fromBroadcast("something.else"))
    }
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `.\gradlew.bat :app:testDebugUnitTest --tests "*PrinterStatusTest*" --no-daemon`
Expected: compilation failure — `PrinterStatus` does not exist.

- [ ] **Step 4: Implement `TicketPrinter` and `SunmiPrinter`**

`SunmiPrinter` binds with:

```kotlin
Intent().apply {
    setPackage("woyou.aidlservice.jiuiv5")
    setAction("woyou.aidlservice.jiuiv5.IWoyouService")
}
context.bindService(intent, connection, Context.BIND_AUTO_CREATE)
```

and calls `context.startService(intent)` first, like Sunmi's own sample. `serviceVersion()`
returns `IWoyouService.getServiceVersion()` or `null` when not bound. `status()` starts as
`UNKNOWN` and is updated by a `BroadcastReceiver` registered for the nine vendor actions,
mapping each through `PrinterStatus.fromBroadcast`. If the bind does not complete within
10 seconds, `bind()` reports `PrinterStatus.ERROR` and `serviceVersion()` returns `null`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `.\gradlew.bat :app:testDebugUnitTest --tests "*PrinterStatusTest*" --no-daemon`
Expected: `BUILD SUCCESSFUL`, 1 test passed.

- [ ] **Step 6: Wire the printer button**

`MainActivity` binds on `onStart`, unbinds on `onStop`, and the **Check printer** button
appends `service version: …`, `printer status: …`, and the last received broadcast action.

- [ ] **Step 7: Verify on the device**

Tap **Check printer**. Expected on a working V1: a non-empty service version and
`printer status: READY`. If it shows "not bound", run `adb shell service list | grep -i
woyou` and `adb shell dumpsys package woyou.aidlservice.jiuiv5` and record the output —
that is the "service absent" review case.

- [ ] **Step 8: Commit**

```bash
git add pos-android
git commit -m "feat(pos): bind Sunmi V1 print service"
```

---

### Task 4: Format the ticket and encode the QR

**Files:**
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/printer/Ticket.kt`
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/printer/TicketFormatter.kt`
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/printer/Qr.kt`
- Create: `pos-android/app/src/test/java/com/yooterminal/pos/printer/TicketFormatterTest.kt`
- Create: `pos-android/app/src/test/java/com/yooterminal/pos/printer/QrTest.kt`

**Interfaces:**
- Produces: `data class Ticket(...)` (fields below);
  `sealed interface TicketLine { data class Text(val value: String, val align: Align = Align.LEFT, val bold: Boolean = false, val size: Float = 24f) : TicketLine; data class Qr(val content: String, val moduleSize: Int = 6) : TicketLine }`;
  `object TicketFormatter { const val WIDTH = 32; fun format(ticket: Ticket): List<TicketLine>; fun wrap(text: String, width: Int = WIDTH): List<String> }`;
  `object Qr { fun encodeMatrix(content: String, sizePx: Int): BitMatrix; fun toBitmap(matrix: BitMatrix): Bitmap }`.

`Ticket` fields: `operatorName`, `originCity`, `destinationCity`, `travelDate`,
`departureTime`, `passengerName`, `seat`, `passengerIndex`, `passengerCount`,
`bookingRef`, `amountLabel`, `paymentLabel`, `contactPhone`, `issuedAt`, `reprintCount`.

- [ ] **Step 1: Write the failing formatter test**

`TicketFormatterTest.kt`:

```kotlin
package com.yooterminal.pos.printer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TicketFormatterTest {
    private val sample = Ticket(
        operatorName = "RWENZORI EXPRESS",
        originCity = "Kampala",
        destinationCity = "Kigali",
        travelDate = "Sat 14 Nov 2026",
        departureTime = "07:00",
        passengerName = "John Doe",
        seat = "12A",
        passengerIndex = 1,
        passengerCount = 2,
        bookingRef = "BLDEMO42",
        amountLabel = "UGX 45,000",
        paymentLabel = "CASH",
        contactPhone = "+256700000000",
        issuedAt = "09 Nov 2026 14:32",
        reprintCount = 0,
    )

    @Test
    fun `renders the 58mm layout`() {
        val lines = TicketFormatter.format(sample).map { line ->
            when (line) {
                is TicketLine.Text -> line.value
                is TicketLine.Qr -> "QR:${line.content}"
            }
        }
        assertEquals(
            listOf(
                "YOOTERMINAL",
                "RWENZORI EXPRESS",
                "--------------------------------",
                "Kampala  ->  Kigali",
                "Sat 14 Nov 2026      07:00",
                "Seat 12A     1 of 2 passengers",
                "--------------------------------",
                "PASSENGER",
                "John Doe",
                "--------------------------------",
                "REF  BLDEMO42",
                "QR:BLDEMO42",
                "--------------------------------",
                "Paid  UGX 45,000    CASH",
                "Contact  +256700000000",
                "Issued   09 Nov 2026 14:32",
                "--------------------------------",
                "Thank you for travelling",
            ),
            lines,
        )
    }

    @Test
    fun `wraps a long passenger name without losing characters`() {
        val name = "Bartholomew Nkusiwagila Musinguzi"
        val lines = TicketFormatter.wrap(name)
        assertTrue(lines.all { it.length <= TicketFormatter.WIDTH })
        assertEquals(name, lines.joinToString(" "))
    }

    @Test
    fun `adds a reprint marker`() {
        val text = TicketFormatter.format(sample.copy(reprintCount = 2))
            .filterIsInstance<TicketLine.Text>()
            .map { it.value }
        assertTrue(text.any { it.contains("REPRINT 2") })
    }
}
```

- [ ] **Step 2: Write the failing QR test**

`QrTest.kt`:

```kotlin
package com.yooterminal.pos.printer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class QrTest {
    @Test
    fun `encodes a square matrix with dark modules`() {
        val matrix = Qr.encodeMatrix("BLDEMO42", 200)
        assertEquals(200, matrix.width)
        assertEquals(200, matrix.height)
        assertTrue((0 until 200).any { x -> (0 until 200).any { y -> matrix[x, y] } })
    }
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `.\gradlew.bat :app:testDebugUnitTest --tests "*TicketFormatterTest*" --tests "*QrTest*" --no-daemon`
Expected: compilation failure — `Ticket`, `TicketFormatter` and `Qr` do not exist.

- [ ] **Step 4: Implement `Ticket`, `TicketFormatter` and `Qr`**

`TicketFormatter.format` emits the exact lines in the test: header centered and bold,
32-dash dividers, the route and departure lines, the seat/passenger line, the passenger
block (wrapped with `wrap`), the reference line, the QR line, the payment block, and the
centered footer. When `reprintCount > 0`, append `REPRINT n` as the last line.
`wrap` is a greedy word wrap at 32 characters; a single word longer than 32 is hard-split.

`Qr.encodeMatrix` uses `QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, sizePx,
sizePx, mapOf(EncodeHintType.MARGIN to 1))`. `Qr.toBitmap` converts a `BitMatrix` to an
ARGB `Bitmap` with black modules on white. `toBitmap` is the only Android-dependent part
and is exercised on the device, not in JVM tests.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `.\gradlew.bat :app:testDebugUnitTest --tests "*TicketFormatterTest*" --tests "*QrTest*" --no-daemon`
Expected: `BUILD SUCCESSFUL`, 4 tests passed.

- [ ] **Step 6: Commit**

```bash
git add pos-android
git commit -m "feat(pos): format 58mm ticket and QR"
```

---

### Task 5: Print the sample ticket on the V1

**Files:**
- Modify: `pos-android/app/src/main/java/com/yooterminal/pos/printer/SunmiPrinter.kt`
- Modify: `pos-android/app/src/main/java/com/yooterminal/pos/MainActivity.kt`

**Interfaces:**
- Consumes: `TicketPrinter`, `TicketFormatter`, `Qr`, `TicketLine`.
- Produces: `SunmiPrinter.print(ticket)` drives `printerInit`, then per line `setAlignment`,
  `setFontSize`, `printText`/`printBitmap`, then `lineWrap(4)`, returning `PrintResult`.

- [ ] **Step 1: Implement `print(ticket)`**

Call `printerInit` first. For each `TicketLine.Text`: `setAlignment(align.value)`,
`setFontSize(size / 24f)`, then `printText(value + "\n")`; when `bold` is true, wrap the
text in `sendRAWData(byteArrayOf(0x1B, 0x45, 0x01))` / `0x1B 0x45 0x00` around it. For
`TicketLine.Qr`: `printBitmap(Qr.toBitmap(Qr.encodeMatrix(content, 384)))`. Finish with
`lineWrap(4)`. Every call passes an `ICallback.Stub` and is awaited with a
`CountDownLatch(1)` and a 5-second timeout; `onRunResult(false)` or a timeout produces
`PrintResult.Failed("…")` with the failing step name.

- [ ] **Step 2: Wire the print button**

**Print sample ticket** builds the fixed sample `Ticket` from the formatter test and calls
`print`, appending `print: success` or `print: failed — <message>`.

- [ ] **Step 3: Verify on the device**

Tap **Print sample ticket**. Expected: a 58mm ticket matching the layout, with a QR that
scans to `BLDEMO42`. Then repeat with the paper roll removed and confirm the app shows
`print: failed` and the status becomes `OUT_OF_PAPER` rather than reporting success.

- [ ] **Step 4: Commit**

```bash
git add pos-android
git commit -m "feat(pos): print sample ticket on Sunmi V1"
```

---

### Task 6: Produce a signed release APK and install it on the V1

**Files:**
- Modify: `pos-android/app/build.gradle.kts`
- Create: `pos-android/proguard-rules.pro`
- Modify: `.gitignore` (already covers `*.jks` and `keystore.properties`)

**Interfaces:**
- Produces: `app/build/outputs/apk/release/app-release.apk`, signed, installable by
  download or adb.

- [ ] **Step 1: Create the keystore outside the repo**

```powershell
New-Item -ItemType Directory -Force C:\Users\impat\keys | Out-Null
keytool -genkeypair -v -keystore C:\Users\impat\keys\yooterminal-pos.jks -alias pos `
  -keyalg RSA -keysize 2048 -validity 10000 -storepass <STORE_PASSWORD> `
  -keypass <KEY_PASSWORD> -dname "CN=YooTerminal POS, O=YooTerminal, C=UG"
```

Create `pos-android/keystore.properties` (gitignored) with `storeFile`,
`storePassword`, `keyAlias`, `keyPassword`.

- [ ] **Step 2: Add the signing config**

In `app/build.gradle.kts`, load `keystore.properties` when it exists and assign
`signingConfigs.release`; set `buildTypes.release.signingConfig = signingConfigs.getByName("release")`.
Create an empty `proguard-rules.pro` and reference it from the release build type.

- [ ] **Step 3: Build and verify the signature**

```powershell
.\gradlew.bat :app:assembleRelease --no-daemon
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\36.1.0\apksigner.bat" verify --print-certs app\build\outputs\apk\release\app-release.apk
```

Expected: `BUILD SUCCESSFUL`; `apksigner` reports one signer with CN=YooTerminal POS.

- [ ] **Step 4: Install on the V1 using the path Task 2 proved**

- If Task 2 showed `system trust: Ok(200)`: copy `app-release.apk` to a public HTTPS path
  on the existing domain, open that link on the V1, and install.
- Otherwise: transfer the APK with `adb install -r` over USB, or copy it to the device
  storage by any file channel, and install from the device's file manager.

Record which path worked and whether the device browser showed a certificate warning.

- [ ] **Step 5: Commit**

```bash
git add pos-android .gitignore
git commit -m "build(pos): sign release spike APK"
```

---

### Task 7: Record spike results and decide the gate

**Files:**
- Create: `docs/superpowers/specs/2026-11-09-sunmi-pos-spike-results.md`

**Interfaces:**
- Produces: the recorded outcome that unblocks (or blocks) the backend and app phases.

- [ ] **Step 1: Write the results file**

Record, with the device serial and app version:

| Check | Result | Notes |
|---|---|---|
| Print service found | yes/no | `service list` output if no |
| Service version | value | from **Check printer** |
| Printer status | READY/… | before and after a print |
| Sample ticket printed | yes/no | photo/logcat |
| QR scans to booking ref | yes/no | scanner used |
| Out-of-paper reported as failure | yes/no | |
| TLS system trust | Ok(200)/Failed(msg) | |
| TLS with ISRG root | Ok(200)/Failed(msg) | |
| Install path | download/adb/file | certificate warning? |

- [ ] **Step 2: State the decision**

One of:

- **Proceed** — service binds and prints, and one TLS mode returns 200. Record which TLS
  mode, which sets the phase-2 API host decision.
- **Proceed with vendor SDK** — service not found; stop and evaluate Sunmi's vendor SDK
  before phase 2.
- **Stop** — neither TLS mode works or printing is unusable; recommend a newer device.

- [ ] **Step 3: Commit and push**

```bash
git add docs/superpowers/specs/2026-11-09-sunmi-pos-spike-results.md
git commit -m "docs(pos): record Sunmi V1 spike results"
git push origin main:master
```

---

## Notes for the next plan

The backend plan (phase 2) starts only after this gate passes. It implements the
`/api/pos` router, bearer auth, `015_pos_sale.sql`, cash sales, lookup and print audit.
The TLS decision recorded in Task 7 sets whether the app ships the bundled-root trust
manager, whether the API needs a different certificate, and whether the APK download URL
must move.
