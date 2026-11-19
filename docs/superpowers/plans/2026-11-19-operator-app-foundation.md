# YooTerminal Operator — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first usable slice of the native operator app: a trusted HTTPS origin on Android 6, bearer authentication, and an app that signs in, resolves the operator's company, and runs Overview, Booked tickets and Ticket validation with a read cache.

**Architecture:** Backend adds Better Auth's bearer plugin and a small `/api/pos` router for context and version policy; everything else reuses the existing `/api/entities`, `/api/seats` and `/api/profile` routes. The Android app is native Kotlin + XML views in the existing `pos-android` project, with a thin OkHttp client, a Keystore-encrypted session, Room for read caching, and one activity hosting fragments.

**Tech Stack:** Node 24 + Express 5 + Better Auth 1.4 + better-sqlite3; Kotlin 2.0.21 + AGP 8.9.2 + KSP; OkHttp 4.12 + Moshi 1.15 (codegen) + Room 2.6 + zxing-android-embedded 4.3.

**Spec:** `docs/superpowers/specs/2026-11-19-operator-android-app-design.md` (selling, mobile money, printing, config writes and reporting are later plans; the approved sale/print rules live in `docs/superpowers/specs/2026-11-09-sunmi-pos-design.md`)

## Global Constraints

- Android: `minSdk 23`, `targetSdk 33`, `compileSdk 35`, JDK 17, portrait only, package `com.yooterminal.pos`, `versionCode 2`, `versionName "2.0.0"`.
- No Compose, no WebView, no Google Play Services, no Retrofit, no WorkManager.
- HTTPS only; `android:usesCleartextTraffic="false"`; TLS 1.2+; bearer token never logged.
- Reads may come from cache; **writes are online-only**. This plan contains no selling.
- One company per device. Sign-out, company switch and `401` clear the session **and** the cache.
- Server-side access rules are authoritative; the app never widens them and never sends amounts.
- The web dashboard must behave exactly as before.
- Backend gates: `npm run test:server`, `npm run lint`, `npm run build`.
- Android gates: `.\gradlew.bat :app:testDebugUnitTest` and `.\gradlew.bat :app:assembleDebug` from `pos-android`.

## Review Focus

1. **Expired or revoked token mid-shift** → the app lands on sign-in with a message; it must not loop, crash, or show an empty dashboard. Tested in Tasks 6 and 12.
2. **Signed-in user with zero or several companies** → explicit "no company linked" or a picker; never a blank screen. Tested in Tasks 8 and 12.
3. **First launch offline with an empty cache** → a clear error with retry, not an endless spinner. Tested in Tasks 10 and 11.
4. **Scanned or pasted ticket reference** (`" bl7k2m9qx "`, a URL containing it, unrelated text) → normalized to `BL7K2M9QX` or rejected. Tested in Task 14.
5. **Device clock ahead of or behind the server** → "today" comes from `/api/pos/context` server time, not `System.currentTimeMillis()`, wherever a date filter decides what is upcoming. Tested in Tasks 2, 11 and 13.

---

### Task 0: ZeroSSL certificate swap and Android 6 gate

**Files:**
- Create: `docs/ops/zerossl-certificate.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `https://www.yooterminal.com` with an RSA chain ending at USERTrust RSA, which Android 6 trusts. Every later task that talks to the device depends on this.

- [ ] **Step 1: Back up the working nginx configuration and certificate paths**

```bash
ssh root@72.60.188.94 'tar -czf /root/nginx-backup-$(date +%F-%H%M).tar.gz /etc/nginx && ls -l /root/nginx-backup-*.tar.gz | tail -1'
```

Record the path in the runbook. Rollback is: extract, `nginx -t`, `systemctl reload nginx`.

- [ ] **Step 2: Store the ZeroSSL access key without putting it in shell history**

```bash
ssh root@72.60.188.94 'install -m 600 /dev/null /root/.zerossl-key'
```

Paste the key into `/root/.zerossl-key` with `nano`. Never `echo` it, never commit it, never put it in a script.

- [ ] **Step 3: Fetch EAB credentials and prove they arrived**

```bash
ssh root@72.60.188.94 'curl -sS "https://api.zerossl.com/acme/eab-credentials?access_key=$(cat /root/.zerossl-key)" -o /root/.zerossl-eab.json && node -e "const j=require(\"/root/.zerossl-eab.json\"); if(!j.eab_kid||!j.eab_hmac_key) { console.error(j); process.exit(1) } console.log(\"eab ok\")"'
```

Expected: `eab ok`. If ZeroSSL returns an error object, stop and read it; do not retry blindly.

- [ ] **Step 4: Register the ACME account and issue an RSA certificate under a new cert name**

Use a **new** `--cert-name` so the existing Let's Encrypt certificate remains intact for rollback.

```bash
ssh root@72.60.188.94 'KID=$(node -e "console.log(require(\"/root/.zerossl-eab.json\").eab_kid)"); HMAC=$(node -e "console.log(require(\"/root/.zerossl-eab.json\").eab_hmac_key)"); certbot register --server https://acme.zerossl.com/v2/DV90 --eab-kid "$KID" --eab-hmac-key "$HMAC" --email ops@yooterminal.com --agree-tos --no-eff-email || echo "already registered, continuing"; certbot certonly --server https://acme.zerossl.com/v2/DV90 --nginx -d www.yooterminal.com --cert-name www.yooterminal.com-zerossl --key-type rsa --rsa-key-size 2048 --agree-tos --non-interactive'
```

Expected: `Certificate is saved at: /etc/letsencrypt/live/www.yooterminal.com-zerossl/fullchain.pem`.

- [ ] **Step 5: Point the yooterminal server block at the new certificate and reload**

Edit the `server_name www.yooterminal.com` block (and its `yooterminal.com` alias if present) so both `ssl_certificate` and `ssl_certificate_key` use `/etc/letsencrypt/live/www.yooterminal.com-zerossl/`. Then:

```bash
ssh root@72.60.188.94 'nginx -t && systemctl reload nginx'
```

- [ ] **Step 6: Verify the chain from outside, expecting an RSA chain to USERTrust**

```bash
echo | openssl s_client -connect www.yooterminal.com:443 -servername www.yooterminal.com -showcerts 2>/dev/null | grep -E '^ *[0-9]+ s:|^ *i:' | head -8
echo | openssl s_client -connect www.yooterminal.com:443 -servername www.yooterminal.com 2>/dev/null | openssl x509 -noout -issuer -text | grep -E 'Issuer:|Public Key Algorithm'
```

Expected: issuer chain mentions ZeroSSL, ends at `USERTrust RSA Certification Authority`, and `Public Key Algorithm: rsaEncryption`. An ECDSA leaf or a USERTrust **ECC** root means the Android 6 gate will fail — reissue with the RSA flags.

- [ ] **Step 7: Gate on the real V1**

On the Sunmi V1, open the stock browser and load:

```
https://www.yooterminal.com/api/health
```

Expected: `{"ok":true,...}` with **no** certificate warning. Then load `https://www.yooterminal.com/pos/` and confirm the install page renders.

If either fails, stop. Restore the nginx backup, reload, and report the exact browser error. Do not bundle a root and do not enable cleartext.

- [ ] **Step 8: Write the runbook and commit it**

`docs/ops/zerossl-certificate.md` records: issue date, cert name, chain fingerprint, the two verification commands, the device result, the rollback command, and a reminder to rotate the access key.

```bash
git add docs/ops/zerossl-certificate.md
git commit -m "docs(ops): record the ZeroSSL certificate swap and Android 6 gate"
```

---

### Task 1: Bearer authentication and a test database path

**Files:**
- Modify: `server/db.js` (database path selection)
- Modify: `server/auth.js` (bearer plugin)
- Test: `server/tests/bearerAuth.test.js`

**Interfaces:**
- Consumes: Better Auth 1.4 (already installed).
- Produces: `Authorization: Bearer <session token>` resolves through `auth.api.getSession` and therefore through `getCaller(req)`, which every existing router already uses.

- [ ] **Step 1: Write the failing test**

```js
// server/tests/bearerAuth.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dbFile = path.join(os.tmpdir(), `yt-bearer-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = dbFile;
process.env.BETTER_AUTH_SECRET = 'test-secret-0123456789-0123456789';
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:3001';

const { auth } = await import('../auth.js');

test('a session token is accepted as a bearer credential', async () => {
  const email = `bearer-${Date.now()}@example.com`;
  const signup = await auth.api.signUpEmail({
    body: { email, password: 'TestPass123!', name: 'Bearer Test' },
  });
  assert.ok(signup.token, 'sign-up returns a session token');

  const session = await auth.api.getSession({
    headers: new Headers({ authorization: `Bearer ${signup.token}` }),
  });
  assert.equal(session?.user?.email, email);

  const anonymous = await auth.api.getSession({ headers: new Headers() });
  assert.equal(anonymous, null);
});

test.after(() => {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbFile + suffix); } catch { /* already gone */ }
  }
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test "server/tests/bearerAuth.test.js"`

Expected: FAIL — either `DB_PATH` is ignored (the on-disk dev database is used) or the bearer session is `null`.

- [ ] **Step 3: Make `DB_PATH` selectable**

In `server/db.js`, replace the fixed path with:

```js
export const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(DATA_DIR, 'app.db');
```

Ensure the parent directory exists before opening: `fs.mkdirSync(path.dirname(dbPath), { recursive: true })`. `npm run seed` and production must be unaffected when `DB_PATH` is unset.

- [ ] **Step 4: Enable the bearer plugin**

In `server/auth.js`:

```js
import { bearer } from 'better-auth/plugins/bearer';
// inside betterAuth({ ... })
plugins: [bearer()],
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test "server/tests/bearerAuth.test.js"`

Expected: PASS, two assertions.

- [ ] **Step 6: Run the whole suite, lint, and commit**

Run: `npm run test:server; npm run lint`

Expected: 15 existing tests plus 1 new test pass; lint clean.

```bash
git add server/db.js server/auth.js server/tests/bearerAuth.test.js
git commit -m "feat(auth): accept bearer session tokens for native clients"
```

---

### Task 2: `/api/pos` context and app-version

**Files:**
- Create: `server/posContext.js`
- Create: `server/pos.js`
- Modify: `server/index.js:63-70` (mount the router)
- Test: `server/tests/posContext.test.js`

**Interfaces:**
- Consumes: `getCaller` from `server/auth.js`; `sqlite` from `server/db.js`.
- Produces:
  - `currencyFor(country: string|null): "UGX"|"RWF"`
  - `buildContext({ sqlite, caller, now, policy }): { operator: {slug,name,currency}|null, user: {id,email,role}, server_time: string, app: {min_version,latest_version,apk_url,sha256} }`
  - `appPolicyFromEnv(env): { minVersion, latestVersion, apkUrl, sha256 }`
  - `createPosRouter({ sqlite, getCallerFn } = {}): express.Router`
  - `GET /api/pos/context` → 200 context, 401 signed out
  - `GET /api/pos/app-version` → 200 `{ min_version, latest_version, apk_url, sha256 }`

- [ ] **Step 1: Write the failing tests**

Use an in-memory database with the `app_user` and `operator` columns the context reads, plus an ephemeral Express server and `fetch`. The file imports `express`, `node:test`, `node:assert/strict` and `better-sqlite3`; `makeDb()` creates `new Database(':memory:')` with the `operator` columns `id, name, slug, country, status, owner_email, created_date` and one row whose `owner_email` is `'Ops@Example.com'`, `country` is `'Rwanda'`, `slug` is `'kigali-coach'`.

```js
test('context maps Rwanda to RWF and Uganda to UGX', () => {
  assert.equal(currencyFor('Rwanda'), 'RWF');
  assert.equal(currencyFor('Uganda'), 'UGX');
  assert.equal(currencyFor(null), 'UGX');
});

test('context resolves the operator by owner email, case-insensitively', () => {
  const ctx = buildContext({
    sqlite: makeDb(),                       // operator owner_email = 'Ops@Example.com'
    caller: { id: '1', email: 'ops@example.com', role: 'operator' },
    now: new Date('2026-11-19T10:00:00.000Z'),
    policy: { minVersion: 1, latestVersion: 2, apkUrl: 'https://x/a.apk', sha256: 'abc' },
  });
  assert.equal(ctx.operator.slug, 'kigali-coach');
  assert.equal(ctx.operator.currency, 'RWF');
  assert.equal(ctx.server_time, '2026-11-19T10:00:00.000Z');
  assert.equal(ctx.app.latest_version, 2);
});

test('context returns a null operator when nobody owns the caller email', () => {
  const ctx = buildContext({ sqlite: makeDb(), caller: { id: '2', email: 'nobody@example.com', role: 'user' }, now: new Date(), policy: {} });
  assert.equal(ctx.operator, null);
  assert.equal(ctx.user.role, 'user');
});

test('GET /api/pos/context is 401 without a caller', async () => {
  const app = express();
  app.use('/api/pos', createPosRouter({ sqlite: makeDb(), getCallerFn: async () => null }));
  const server = app.listen(0);
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/pos/context`);
  assert.equal(res.status, 401);
  server.close();
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `node --test "server/tests/posContext.test.js"`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `server/posContext.js`**

`currencyFor` returns `RWF` only for `Rwanda`, otherwise `UGX`. `buildContext` selects:

```sql
SELECT id, name, slug, country, status FROM operator
WHERE lower(owner_email) = lower(?) ORDER BY created_date ASC LIMIT 1
```

and returns `operator: null` when no row. `appPolicyFromEnv` reads `POS_MIN_VERSION` (default `1`), `POS_LATEST_VERSION` (default `2`), `POS_APK_URL` (default `https://www.yooterminal.com/pos/yooterminal-operator-2.0.0.apk`), `POS_APK_SHA256` (default `''`).

- [ ] **Step 4: Implement `server/pos.js` and mount it**

Thin router only: resolve caller, 401 if absent, call the pure functions, `res.json`. Inject `sqlite` and `getCallerFn` with defaults so the test can replace them.

In `server/index.js` next to the other routers:

```js
import { createPosRouter } from './pos.js';
app.use('/api/pos', createPosRouter());
```

- [ ] **Step 5: Run the tests, then the suite, lint and build**

Run: `node --test "server/tests/posContext.test.js"; npm run test:server; npm run lint; npm run build`

Expected: all pass; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add server/posContext.js server/pos.js server/index.js server/tests/posContext.test.js
git commit -m "feat(pos): expose operator context and app version policy"
```

---

### Task 3: Android build foundation

**Files:**
- Modify: `pos-android/build.gradle.kts`
- Modify: `pos-android/app/build.gradle.kts`
- Modify: `pos-android/app/src/main/AndroidManifest.xml` (camera permission and `ScanContract` activity are added in Task 14)

**Interfaces:**
- Consumes: existing Kotlin 2.0.21 / AGP 8.9.2 project.
- Produces: KSP, Moshi codegen, Room, fragment/recyclerview/swipe-refresh, zxing-android-embedded, `java.time` desugaring, and MockWebServer for tests. `versionCode 2`, `versionName "2.0.0"`.

- [ ] **Step 1: Add the KSP plugin to the root build**

```kotlin
plugins {
    id("com.android.application") version "8.9.2" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    id("com.google.devtools.ksp") version "2.0.21-1.0.28" apply false
}
```

- [ ] **Step 2: Apply KSP and add dependencies**

In `app/build.gradle.kts` add `id("com.google.devtools.ksp")`, bump `versionCode = 2` and `versionName = "2.0.0"`, enable core library desugaring, and add:

```kotlin
implementation("androidx.fragment:fragment-ktx:1.8.5")
implementation("androidx.recyclerview:recyclerview:1.3.2")
implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
implementation("com.squareup.moshi:moshi:1.15.2")
ksp("com.squareup.moshi:moshi-kotlin-codegen:1.15.2")
implementation("androidx.room:room-runtime:2.6.1")
implementation("androidx.room:room-ktx:2.6.1")
ksp("androidx.room:room-compiler:2.6.1")
implementation("com.journeyapps:zxing-android-embedded:4.3.0")
coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.3")
testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
```

and:

```kotlin
compileOptions {
    isCoreLibraryDesugaringEnabled = true
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}
```

- [ ] **Step 3: Build and run the existing tests**

Run from `pos-android`:

```
.\gradlew.bat :app:testDebugUnitTest
.\gradlew.bat :app:assembleDebug
```

Expected: the existing 24 JVM tests pass; the debug APK builds. If KSP cannot resolve, stop and fix the version pair before writing any code.

- [ ] **Step 4: Commit**

```bash
git add pos-android/build.gradle.kts pos-android/app/build.gradle.kts
git commit -m "build(android): add KSP, Moshi, Room and QR scanning"
```

---

### Task 4: JSON and entity query building

**Files:**
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/data/Json.kt`
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/data/EntityQuery.kt`
- Test: `pos-android/app/src/test/java/com/yooterminal/pos/data/EntityQueryTest.kt`

**Interfaces:**
- Consumes: Moshi.
- Produces:
  - `object Json { val moshi: Moshi; fun <T> decode(type: Type, text: String): T; fun encode(value: Any): String }`
  - `data class EntityQuery(val filter: Map<String, Any?> = emptyMap(), val sort: String? = null, val limit: Int? = null, val fields: List<String> = emptyList())` with `fun toQueryString(): String`
  - `data class AggregateRequest(val query: Map<String, Any?> = emptyMap(), val groupBy: String? = null, val sum: List<String> = emptyList(), val avg: String? = null, val sort: String? = null, val limit: Int? = null)`

- [ ] **Step 1: Write the failing test**

Assertions the test must make:

```kotlin
@Test fun `encodes filter sort limit and fields like the web client`() {
    val query = EntityQuery(
        filter = linkedMapOf("operator_slug" to "kigali-coach", "travel_date" to mapOf("\$gte" to "2026-11-01")),
        sort = "-travel_date",
        limit = 60,
        fields = listOf("id", "booking_ref"),
    )
    val params = parseQuery(query.toQueryString())
    assertEquals("""{"operator_slug":"kigali-coach","travel_date":{"${'$'}gte":"2026-11-01"}}""", params["filter"])
    assertEquals("-travel_date", params["sort"])
    assertEquals("60", params["limit"])
    assertEquals("id,booking_ref", params["fields"])
}

@Test fun `empty query is an empty string`() {
    assertEquals("", EntityQuery().toQueryString())
}

@Test fun `quotes and spaces are url-encoded, not dropped`() {
    val params = parseQuery(EntityQuery(filter = mapOf("booking_ref" to "BL 7K&2")).toQueryString())
    assertEquals("""{"booking_ref":"BL 7K&2"}""", params["filter"])
}
```

`parseQuery` is a local test helper that splits on `&` and URL-decodes each value.

- [ ] **Step 2: Run it and watch it fail**

Run from `pos-android`: `.\gradlew.bat :app:testDebugUnitTest --tests "com.yooterminal.pos.data.EntityQueryTest"`

Expected: FAIL — unresolved reference `EntityQuery`.

- [ ] **Step 3: Implement**

Use `java.net.URLEncoder.encode(value, "UTF-8")` for values. Only append keys that are present. Serialize the filter with Moshi so nested operators and numbers survive. `Json.moshi` is a plain `Moshi.Builder().build()` — generated adapters only, no `KotlinJsonAdapterFactory`.

- [ ] **Step 4: Run the test and commit**

Run: `.\gradlew.bat :app:testDebugUnitTest --tests "com.yooterminal.pos.data.EntityQueryTest"`

Expected: PASS.

```bash
git add pos-android/app/src/main/java/com/yooterminal/pos/data/Json.kt pos-android/app/src/main/java/com/yooterminal/pos/data/EntityQuery.kt pos-android/app/src/test/java/com/yooterminal/pos/data/EntityQueryTest.kt
git commit -m "feat(android): build entity query strings"
```

---

### Task 5: Keystore-backed session storage

**Files:**
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/data/SessionStore.kt`
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/data/TokenCipher.kt`
- Test: `pos-android/app/src/test/java/com/yooterminal/pos/data/SessionStoreTest.kt`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface KeyValueStore { fun get(key: String): String?; fun put(key: String, value: String); fun remove(key: String) }`
  - `interface TokenCipher { fun encrypt(plain: String): String; fun decrypt(blob: String): String? }`
  - `class SessionStore(private val prefs: KeyValueStore, private val cipher: TokenCipher)` with `fun token(): String?`, `fun email(): String?`, `fun save(token: String, email: String)`, `fun clear()`
  - `class AndroidTokenCipher : TokenCipher` (AES/GCM key in `AndroidKeyStore`, alias `yooterminal-session`, ciphertext + IV base64 in one string)
  - `class SharedPrefsStore(context: Context) : KeyValueStore`

- [ ] **Step 1: Write the failing test**

```kotlin
class FakeCipher : TokenCipher {
    override fun encrypt(plain: String) = "enc:$plain"
    override fun decrypt(blob: String) = blob.removePrefix("enc:").takeIf { blob.startsWith("enc:") }
}

@Test fun `save then read returns the token and email`() { /* save("tok","a@b.c"); assert token/email */ }
@Test fun `clear removes both`() { /* save, clear, both null */ }
@Test fun `a corrupt blob yields null instead of throwing`() {
    val store = SessionStore(MemoryStore(), FakeCipher())
    store.save("tok", "a@b.c") // then overwrite the raw value with "garbage"
    assertNull(store.token())
}
@Test fun `saving twice replaces, never appends`() { /* token() == "second" */ }
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.\gradlew.bat :app:testDebugUnitTest --tests "com.yooterminal.pos.data.SessionStoreTest"`

Expected: FAIL — unresolved references.

- [ ] **Step 3: Implement the pure store and the Android adapters**

`SessionStore` stores `session.token` and `session.email`. `token()` decrypts and returns null on any exception. `AndroidTokenCipher` generates the key with `KeyGenParameterSpec.Builder(alias, PURPOSE_ENCRYPT or PURPOSE_DECRYPT).setBlockModes(GCM).setEncryptionPaddings(NONE).build()`, and encodes `iv:ciphertext` in Base64. The Android classes are exercised on the device in Task 12 (sign-in persists the token); the JVM test covers the logic.

- [ ] **Step 4: Run the test and commit**

Run: `.\gradlew.bat :app:testDebugUnitTest --tests "com.yooterminal.pos.data.SessionStoreTest"`

Expected: PASS.

```bash
git add pos-android/app/src/main/java/com/yooterminal/pos/data/SessionStore.kt pos-android/app/src/main/java/com/yooterminal/pos/data/TokenCipher.kt pos-android/app/src/test/java/com/yooterminal/pos/data/SessionStoreTest.kt
git commit -m "feat(android): store the session token behind an Android Keystore key"
```

---

### Task 6: HTTP client with bearer auth and 401 handling

**Files:**
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/data/ApiClient.kt`
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/data/ApiException.kt`
- Test: `pos-android/app/src/test/java/com/yooterminal/pos/data/ApiClientTest.kt`

**Interfaces:**
- Consumes: `SessionStore`, `OkHttpClient`.
- Produces:
  - `class ApiClient(val baseUrl: String, private val session: SessionStore, http: OkHttpClient = defaultHttp())`
  - `suspend fun get(path: String): String`, `post(path, body: String)`, `patch(path, body: String)`, `delete(path)`
  - `suspend fun postUnauthenticated(path: String, body: String): String`
  - `open class ApiException(message: String, val status: Int) : IOException(message)`
  - `class AuthExpiredException : ApiException("Session expired", 401)`
  - `class InvalidCredentialsException : ApiException("Invalid email or password", 401)`
  - `object AuthEvents { val expired: SharedFlow<Unit>; fun notifyExpired() }` — the one signal a screen needs to return to sign-in from anywhere
  - `companion object { const val PRODUCTION_BASE_URL = "https://www.yooterminal.com" }`

- [ ] **Step 1: Write the failing tests with MockWebServer**

```kotlin
@Test fun `adds the bearer token to authenticated requests`()
@Test fun `a 401 on an authenticated request clears the session and emits AuthExpired`()
@Test fun `a 401 on sign-in does not clear the session and throws InvalidCredentials`()
@Test fun `non-2xx surfaces the server message from error or message`()
@Test fun `no token means no Authorization header`()
@Test fun `http is rejected before a request is made`()  // baseUrl must start with https://
```

Use `runTest`, a `MockWebServer`, a `SessionStore` with the fake cipher from Task 5, and `takeRequest()` assertions.

- [ ] **Step 2: Run and watch them fail**

Run: `.\gradlew.bat :app:testDebugUnitTest --tests "com.yooterminal.pos.data.ApiClientTest"`

Expected: FAIL — unresolved references.

- [ ] **Step 3: Implement**

- `defaultHttp()` builds an `OkHttpClient` with `ConnectionSpec.Builder(ConnectionSpec.MODERN_TLS).tlsVersions(TlsVersion.TLS_1_2).build()`, 20 s connect/read timeouts, and no logging interceptor.
- All calls run on `Dispatchers.IO`.
- URL is `baseUrl.trimEnd('/') + path`; reject a base URL that does not start with `https://`.
- Authenticated 401 → `session.clear()`, `AuthEvents.notifyExpired()`, then `AuthExpiredException`.
- Unauthenticated 401 → `InvalidCredentialsException`, session untouched, no event emitted.
- Parse `{"error":...}` or `{"message":...}` for the exception message; fall back to `Request failed (N)`.

- [ ] **Step 4: Run the tests and commit**

Run: `.\gradlew.bat :app:testDebugUnitTest --tests "com.yooterminal.pos.data.ApiClientTest"`

Expected: PASS.

```bash
git add pos-android/app/src/main/java/com/yooterminal/pos/data/ApiClient.kt pos-android/app/src/main/java/com/yooterminal/pos/data/ApiException.kt pos-android/app/src/test/java/com/yooterminal/pos/data/ApiClientTest.kt
git commit -m "feat(android): add a bearer-aware HTTPS client"
```

---

### Task 7: Entity source and booking model

**Files:**
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/data/EntitySource.kt`
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/data/Models.kt`
- Test: `pos-android/app/src/test/java/com/yooterminal/pos/data/EntitySourceTest.kt`

**Interfaces:**
- Consumes: `ApiClient`, `Json`, `EntityQuery`, `AggregateRequest`.
- Produces:
  - `interface EntitySource { suspend fun list(entity: String, query: EntityQuery = EntityQuery()): List<Map<String, Any?>>; suspend fun aggregate(entity: String, request: AggregateRequest): List<Map<String, Any?>>; suspend fun update(entity: String, id: String, patch: Map<String, Any?>): Map<String, Any?> }`
  - `class HttpEntitySource(private val client: ApiClient) : EntitySource`
  - `@JsonClass(generateAdapter = true) data class Booking(...)` with `bookingRef`, `status`, `travelDate`, `departureTime`, `originCity`, `destinationCity`, `operatorSlug`, `operatorName`, `seats`, `passengers`, `amount`, `currency`, `contactName`, `contactPhone`, `validated`
  - `@JsonClass(generateAdapter = true) data class Passenger(val name: String?, val seat: String?)`
  - `fun Map<String, Any?>.toBooking(): Booking?`

- [ ] **Step 1: Write the failing tests**

```kotlin
@Test fun `list reads items and tolerates an empty body`()   // {"items":[{...}],"count":1} and {"items":[]}
@Test fun `aggregate posts the request body and reads rows`()
@Test fun `update patches the encoded id and returns the row`()
@Test fun `a booking row decodes passengers, seats and validated`()
@Test fun `a row without a booking_ref decodes to null`()
```

The MockWebServer path assertions must be exact: `/api/entities/Booking?filter=...`, `/api/entities/Booking/aggregate`, `/api/entities/Booking/42`.

- [ ] **Step 2: Run and watch them fail**

Run: `.\gradlew.bat :app:testDebugUnitTest --tests "com.yooterminal.pos.data.EntitySourceTest"`

Expected: FAIL.

- [ ] **Step 3: Implement**

`HttpEntitySource.list` GETs `/api/entities/{entity}{query}` and reads `items` via `Json`. `aggregate` POSTs `{"query":...,"groupBy":...,"sum":[...],"avg":...,"sort":...,"limit":...}` and reads `rows`. Both decode into `List<Map<String, Any?>>` using `Types.newParameterizedType(List::class.java, Map::class.java, String::class.java, Any::class.java)`.

All `Booking` fields are nullable except `id`, because the server omits columns and Moshi codegen does not apply Kotlin defaults to missing JSON. `toBooking()` requires `id` and `booking_ref`, and normalizes `seats`/`passengers` to empty lists.

- [ ] **Step 4: Run the tests, then the whole Android suite, and commit**

Run: `.\gradlew.bat :app:testDebugUnitTest`

Expected: PASS.

```bash
git add pos-android/app/src/main/java/com/yooterminal/pos/data/EntitySource.kt pos-android/app/src/main/java/com/yooterminal/pos/data/Models.kt pos-android/app/src/test/java/com/yooterminal/pos/data/EntitySourceTest.kt
git commit -m "feat(android): add the entity source and booking model"
```

---

### Task 8: Sign-in and company resolution

**Files:**
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/auth/AuthApi.kt`
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/auth/OperatorRepository.kt`
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/auth/SignInViewModel.kt`
- Test: `pos-android/app/src/test/java/com/yooterminal/pos/auth/SignInTest.kt`

**Interfaces:**
- Consumes: `ApiClient`, `SessionStore`, `EntitySource`.
- Produces:
  - `class AuthApi(private val client: ApiClient) { suspend fun signIn(email: String, password: String): SignInResult }`
  - `data class SignInResult(val token: String, val email: String, val name: String)`
  - `data class OperatorSummary(val id: String, val name: String, val slug: String, val country: String?, val status: String)`
  - `sealed interface OperatorResolution { data object None; data class One(val operator: OperatorSummary); data class Many(val operators: List<OperatorSummary>) }`
  - `class OperatorRepository(private val entities: EntitySource) { suspend fun resolve(email: String): OperatorResolution }`
  - `class SignInViewModel(...)` with `state: StateFlow<SignInState>` where `SignInState` is `Idle | Loading | Error(message) | SignedIn(OperatorResolution)`

- [ ] **Step 1: Write the failing tests**

```kotlin
@Test fun `sign-in posts the credentials unauthenticated and saves the token`()
@Test fun `bad credentials surface InvalidCredentials and store nothing`()
@Test fun `resolve returns None for zero companies`()
@Test fun `resolve returns One for a single company`()
@Test fun `resolve returns Many sorted by name for several companies`()
@Test fun `resolve matches the owner email case-insensitively`()  // query filter uses lower-cased email
```

- [ ] **Step 2: Run and watch them fail**

Run: `.\gradlew.bat :app:testDebugUnitTest --tests "com.yooterminal.pos.auth.SignInTest"`

Expected: FAIL.

- [ ] **Step 3: Implement**

- `AuthApi.signIn` calls `postUnauthenticated("/api/auth/sign-in/email", {"email":...,"password":...})`, reads `token` and the nested `user.email`/`user.name`, and calls `session.save(token, email)`.
- `OperatorRepository.resolve` calls `entities.list("Operator", EntityQuery(filter = mapOf("owner_email" to email.lowercase()), sort = "name", limit = 200))`. Ignore rows without `slug`. Map `status` to `"pending"` when absent so the UI can show the review banner.
- `SignInViewModel` never throws to the fragment: map `InvalidCredentialsException` to `Error("Invalid email or password")`, `IOException` to `Error("No connection. Check the network and retry.")`, and anything else to its message.

- [ ] **Step 4: Run the tests and commit**

Run: `.\gradlew.bat :app:testDebugUnitTest --tests "com.yooterminal.pos.auth.SignInTest"`

Expected: PASS.

```bash
git add pos-android/app/src/main/java/com/yooterminal/pos/auth pos-android/app/src/test/java/com/yooterminal/pos/auth/SignInTest.kt
git commit -m "feat(android): sign in and resolve the operator company"
```

---

### Task 9: App shell and navigation

**Files:**
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/ui/nav/Destinations.kt`
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/data/CompanyStore.kt`
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/AppContainer.kt` (manual dependency wiring; grown by later tasks)
- Modify: `pos-android/app/src/main/java/com/yooterminal/pos/PosApp.kt`
- Modify: `pos-android/app/src/main/java/com/yooterminal/pos/MainActivity.kt` (replace the spike)
- Delete: `pos-android/app/src/main/java/com/yooterminal/pos/MainViewModel.kt` (diagnostics move to Task 15)
- Modify: `pos-android/app/src/main/res/layout/activity_main.xml`
- Modify: `pos-android/app/src/main/res/values/strings.xml`
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/ui/PlaceholderFragment.kt`
- Test: `pos-android/app/src/test/java/com/yooterminal/pos/ui/nav/DestinationsTest.kt`
- Test: `pos-android/app/src/test/java/com/yooterminal/pos/data/CompanyStoreTest.kt`

**Interfaces:**
- Consumes: `ApiClient`, `SessionStore`, `HttpEntitySource`, `AuthApi`, `OperatorRepository` from Tasks 5–8. Real screens arrive in Tasks 11–15 and replace placeholders one by one.
- Produces:
  - `enum class Destination(val id: String, val title: String, val group: NavGroup)` where `NavGroup` is `BOTTOM` or `MORE`
  - `object Destinations { val BOTTOM: List<Destination>; val MORE: List<Destination>; fun byId(id: String): Destination? }`
  - `data class Company(val id: String, val name: String, val slug: String, val country: String?, val status: String)`
  - `class CompanyStore(prefs: KeyValueStore)` with `fun save(company: Company)`, `fun current(): Company?`, `fun clear()` — the single place a screen asks "which company is this device on?"
  - `class AppContainer(context: Context, baseUrl: String = ApiClient.PRODUCTION_BASE_URL)` exposing `session`, `api`, `entities`, `authApi`, `operators`, `company`; later tasks add `cache` and `contexts`
  - `MainActivity` hosts `FragmentContainerView` with id `fragment_container` and a `BottomNavigationView` with id `bottom_nav`.

- [ ] **Step 1: Write the failing tests**

```kotlin
@Test fun `bottom bar is sell dashboard tickets validate more`() {
    assertEquals(listOf("sell","overview","tickets","validate","more"), Destinations.BOTTOM.map { it.id })
}
@Test fun `more contains the remaining operator areas exactly once`() {
    val ids = Destinations.MORE.map { it.id }
    assertEquals(listOf("timetable","fleet","seats","earnings","reports","customers","coupons","settings"), ids)
    assertEquals(ids.size, ids.toSet().size)
}
@Test fun `no destination is in both groups`() { /* intersection empty */ }
@Test fun `every title is non-blank`() { /* all groups */ }

@Test fun `the company survives a store round trip`()   // save then current() returns the same values
@Test fun `a store with nothing saved reports no company`()  // current() == null, first launch
@Test fun `clear forgets the company`()
```

- [ ] **Step 2: Run and watch it fail**

Run: `.\gradlew.bat :app:testDebugUnitTest --tests "com.yooterminal.pos.ui.nav.DestinationsTest" --tests "com.yooterminal.pos.data.CompanyStoreTest"`

Expected: FAIL — unresolved references.

- [ ] **Step 3: Implement the navigation model and shell**

- Bottom bar: Sell, Dashboard, Tickets, Validate, More. "Dashboard" opens Overview once Task 11 lands; until then every destination opens `PlaceholderFragment`.
- Replace the spike layout: toolbar with the company name, fragment container, bottom navigation. Keep the activity locked to portrait.
- Build `AppContainer` with the Keystore session, OkHttp client, `HttpEntitySource`, `AuthApi`, `OperatorRepository` and a `CompanyStore` over the same `SharedPrefsStore`. `PosApp` exposes it as `container`.
- `CompanyStore` round-trips through `KeyValueStore` as one JSON blob so a partial write can never leave a half-company behind; `current()` returns null when the blob is missing or unparsable.
- Routing for this task: if the session has no token, show a placeholder "Sign in"; otherwise show a placeholder "Dashboard". Tasks 11 and 12 replace both with the real fragments. The 401 → sign-in rule is implemented in Task 12, when `SignInFragment` exists.
- `strings.xml`: `app_name` becomes `YooTerminal Operator`.

- [ ] **Step 4: Run the tests and a debug build**

Run: `.\gradlew.bat :app:testDebugUnitTest --tests "com.yooterminal.pos.ui.nav.DestinationsTest" --tests "com.yooterminal.pos.data.CompanyStoreTest"; .\gradlew.bat :app:assembleDebug`

Expected: PASS; APK builds. The app opens on placeholders until Task 12.

- [ ] **Step 5: Commit**

```bash
git add pos-android/app/src/main/java/com/yooterminal/pos/AppContainer.kt pos-android/app/src/main/java/com/yooterminal/pos/PosApp.kt pos-android/app/src/main/java/com/yooterminal/pos/MainActivity.kt pos-android/app/src/main/java/com/yooterminal/pos/data/CompanyStore.kt pos-android/app/src/main/java/com/yooterminal/pos/ui pos-android/app/src/main/res pos-android/app/src/test/java/com/yooterminal/pos/ui pos-android/app/src/test/java/com/yooterminal/pos/data/CompanyStoreTest.kt
git rm pos-android/app/src/main/java/com/yooterminal/pos/MainViewModel.kt
git commit -m "feat(android): replace the spike with the operator app shell"
```

---

### Task 10: Room cache for offline reads

**Files:**
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/data/CacheEntry.kt`
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/data/CacheDao.kt`
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/data/CacheDatabase.kt`
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/data/CacheRepository.kt`
- Modify: `pos-android/app/src/main/java/com/yooterminal/pos/AppContainer.kt` (add `cache`)
- Test: `pos-android/app/src/test/java/com/yooterminal/pos/data/CacheRepositoryTest.kt`

**Interfaces:**
- Consumes: Room (Task 3), `AppContainer` (Task 9).
- Produces:
  - `@Entity(tableName = "cache_entry") data class CacheEntry(@PrimaryKey val key: String, val body: String, val fetchedAt: Long)`
  - `@Dao interface CacheDao { fun read(key: String): CacheEntry?; fun write(entry: CacheEntry); fun clear() }` (use `@Insert(onConflict = REPLACE)`)
  - `data class CachedBody(val body: String, val fetchedAt: Long)`
  - `class CacheRepository(private val dao: CacheDao, private val clock: () -> Long = System::currentTimeMillis)` with `fun read(key: String): CachedBody?`, `fun write(key: String, body: String)`, `fun clear()`
  - `object CacheKey { fun of(path: String, query: String = ""): String }`

- [ ] **Step 1: Write the failing tests with a fake DAO**

```kotlin
@Test fun `write then read returns the body and timestamp`()
@Test fun `read of an unknown key returns null`()          // the first-launch-offline case
@Test fun `write replaces rather than duplicating`()
@Test fun `clear removes every key`()
@Test fun `key normalizes path and query deterministically`()  // order-independent for the same query object
```

- [ ] **Step 2: Run and watch it fail**

Run: `.\gradlew.bat :app:testDebugUnitTest --tests "com.yooterminal.pos.data.CacheRepositoryTest"`

Expected: FAIL.

- [ ] **Step 3: Implement**

`CacheDatabase` is a `RoomDatabase` with `version = 1` and `fallbackToDestructiveMigration()`. `CacheRepository` catches any DAO exception and returns null, so a corrupted cache never crashes a screen. `CacheKey.of` lowercases the path and appends the query verbatim.

- [ ] **Step 4: Run the tests and commit**

Run: `.\gradlew.bat :app:testDebugUnitTest --tests "com.yooterminal.pos.data.CacheRepositoryTest"`

```bash
git add pos-android/app/src/main/java/com/yooterminal/pos/data/Cache*.kt pos-android/app/src/main/java/com/yooterminal/pos/data/CacheRepository.kt pos-android/app/src/test/java/com/yooterminal/pos/data/CacheRepositoryTest.kt
git commit -m "feat(android): cache entity reads for offline screens"
```

---

### Task 11: Server clock and Overview

**Files:**
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/data/ContextRepository.kt`
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/overview/OverviewRepository.kt`
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/ui/OverviewFragment.kt`
- Create: `pos-android/app/src/main/res/layout/fragment_overview.xml`
- Test: `pos-android/app/src/test/java/com/yooterminal/pos/overview/OverviewTest.kt`

**Interfaces:**
- Consumes: `EntitySource`, `CacheRepository`, `ApiClient`, `CompanyStore` (Task 9).
- Produces:
  - `data class ServerContext(val serverTime: Instant, val currency: String, val minVersion: Int, val latestVersion: Int)`
  - `class ContextRepository(private val client: ApiClient)` with `suspend fun load(): ServerContext`
  - `object MonthWindow { fun monthOf(today: LocalDate): Pair<LocalDate, LocalDate>; fun todayIn(context: ServerContext, country: String?): LocalDate }` — `Asia/Kampala` for Uganda, `Africa/Kigali` otherwise; the only source of "today"
  - `data class OverviewMetrics(val revenue: Double, val currency: String, val tickets: Int, val passengers: Int, val todayDepartures: Int)`
  - `class OverviewRepository(private val entities: EntitySource, private val cache: CacheRepository)` with `suspend fun load(operatorSlug: String, today: LocalDate): LoadResult<OverviewMetrics>`
  - `sealed interface LoadResult<out T> { data class Fresh<T>(val value: T); data class Cached<T>(val value: T, val fetchedAt: Long); data class Failed(val message: String) }`

- [ ] **Step 1: Write the failing tests**

```kotlin
@Test fun `overview sums revenue, tickets and passengers for the month`()
@Test fun `an empty month yields zeros, not null`()
@Test fun `an offline load with a cached body returns Cached`()
@Test fun `an offline load with no cache returns Failed`()   // first launch, no signal
@Test fun `the month window is the first and last day of that month`()
@Test fun `today comes from the server context, not the device clock`()
// serverTime 2026-11-19T23:30:00Z is already 2026-11-20 in Kampala
```

Fake `EntitySource` returns `listOf(mapOf("count" to 4, "sum_amount" to 120000.0, "sum_passenger_count" to 6))`.

- [ ] **Step 2: Run and watch them fail**

Run: `.\gradlew.bat :app:testDebugUnitTest --tests "com.yooterminal.pos.overview.OverviewTest"`

Expected: FAIL.

- [ ] **Step 3: Implement**

- `ContextRepository.load` GETs `/api/pos/context`, reads `server_time` with `Instant.parse`, and defaults currency to `UGX`.
- `OverviewRepository.load(operatorSlug, today)` computes the window with `MonthWindow.monthOf(today)`, aggregates `Booking` by `operator_slug` with `travel_date` between the first and last day of the month and `status != "cancelled"`, sums `amount` and `passenger_count`, and counts active `Schedule` rows for today. On `IOException` it reads `CacheKey.of("/api/entities/Booking/aggregate", "overview:$operatorSlug:$monthStart")` and returns `Cached`, else `Failed("No connection and no saved data yet.")`. On success it writes the response body to that key.
- Revenue is the `sum_amount` number (already in major units). Passengers is `sum_passenger_count`. A month with no rows is `count: 0` and both sums `null`; map those to zero.
- The fragment takes the company from `CompanyStore`, shows its name in the toolbar and the pending banner when `status != "approved"`, derives `today` with `MonthWindow.todayIn(context, company.country)`, and renders four cards, a pull-to-refresh, and a footer "Offline copy — last updated …" for `Cached`.

- [ ] **Step 4: Run the tests and commit**

Run: `.\gradlew.bat :app:testDebugUnitTest --tests "com.yooterminal.pos.overview.OverviewTest"`

```bash
git add pos-android/app/src/main/java/com/yooterminal/pos/overview pos-android/app/src/main/java/com/yooterminal/pos/ui/OverviewFragment.kt pos-android/app/src/main/res/layout/fragment_overview.xml pos-android/app/src/main/java/com/yooterminal/pos/data/ContextRepository.kt pos-android/app/src/test/java/com/yooterminal/pos/overview/OverviewTest.kt
git commit -m "feat(android): add the overview dashboard with server time"
```

---

### Task 12: Sign-in screen and session routing

**Files:**
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/ui/SignInFragment.kt`
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/ui/NoCompanyFragment.kt`
- Create: `pos-android/app/src/main/res/layout/fragment_sign_in.xml`
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/auth/CompanyChoice.kt`
- Modify: `pos-android/app/src/main/java/com/yooterminal/pos/MainActivity.kt` (real routing and the `AuthEvents` observer)
- Test: `pos-android/app/src/test/java/com/yooterminal/pos/auth/CompanyChoiceTest.kt`

**Interfaces:**
- Consumes: `AppContainer` (Task 9), `SignInViewModel` and `OperatorResolution` (Task 8), `CompanyStore` (Task 9), `AuthEvents` (Task 6), `OverviewFragment` (Task 11).
- Produces:
  - `object CompanyChoice { fun pick(resolution: OperatorResolution, savedSlug: String?): OperatorSummary? }` — null means "ask the operator which company"
  - `fun OperatorSummary.toCompany(): Company`
  - `MainActivity` observes `AuthEvents.expired` and shows `SignInFragment` with the message "Your session expired. Sign in again."

- [ ] **Step 1: Write the failing tests**

```kotlin
@Test fun `one company is picked without asking`()          // One(op) + any savedSlug -> op
@Test fun `many companies with a saved slug resumes that company`()
@Test fun `many companies with no saved slug needs a choice`()   // -> null
@Test fun `many companies with a stale saved slug needs a choice`() // saved slug no longer in the list
@Test fun `no companies picks nothing`()                     // None -> null
@Test fun `an operator summary maps to a company row`()      // slug, name, status carried over; status defaults to pending
```

- [ ] **Step 2: Run and watch them fail**

Run: `.\gradlew.bat :app:testDebugUnitTest --tests "com.yooterminal.pos.auth.CompanyChoiceTest"`

Expected: FAIL — unresolved references.

- [ ] **Step 3: Implement the screen and the routing**

- Sign-in fields: email prefilled from `session.email()`, password, sign-in button, inline error, version label. The keyboard action on password submits. The button is disabled while loading and re-enabled on error.
- `SignedIn(One)` and the picked case → `company.save(...)`, then show `OverviewFragment`.
- `SignedIn(Many)` → an `AlertDialog` listing the companies by name; the pick is saved to `CompanyStore` and shown as Overview. Dismissing the dialog leaves the operator on a "Choose your company" state rather than an empty screen.
- `SignedIn(None)` → `NoCompanyFragment`: the signed-in email, "No company is linked to this account yet. Ask an administrator to approve it." and a **Sign out** button.
- Start-up routing: no token → `SignInFragment`; token present → `company.current()` → Overview, otherwise `SignInFragment` prefilled so the operator re-resolves rather than landing on a blank dashboard.
- `AuthEvents.expired` → clear `CompanyStore` and the cache, then `SignInFragment` with the expiry message. This is the only place that navigates on expiry, so a burst of failed calls cannot loop.
- A pending company (`status != "approved"`) still opens Overview, which already carries the banner from Task 11.

- [ ] **Step 4: Device check**

On the V1: wrong password shows the error and stores nothing; correct password lands on Overview; force-stop and reopen lands on Overview without a password; revoke the session server-side and pull to refresh → sign-in with the expiry message; sign out returns to sign-in.

- [ ] **Step 5: Run the tests, build, and commit**

Run: `.\gradlew.bat :app:testDebugUnitTest; .\gradlew.bat :app:assembleDebug`

```bash
git add pos-android/app/src/main/java/com/yooterminal/pos/auth/CompanyChoice.kt pos-android/app/src/main/java/com/yooterminal/pos/ui/SignInFragment.kt pos-android/app/src/main/java/com/yooterminal/pos/ui/NoCompanyFragment.kt pos-android/app/src/main/res/layout/fragment_sign_in.xml pos-android/app/src/main/java/com/yooterminal/pos/MainActivity.kt pos-android/app/src/test/java/com/yooterminal/pos/auth/CompanyChoiceTest.kt
git commit -m "feat(android): add the operator sign-in screen and session routing"
```

---

### Task 13: Booked tickets

**Files:**
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/bookings/BookingsRepository.kt`
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/ui/TicketsFragment.kt`
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/ui/BookingAdapter.kt`
- Create: `pos-android/app/src/main/res/layout/fragment_tickets.xml`
- Create: `pos-android/app/src/main/res/layout/item_booking.xml`
- Test: `pos-android/app/src/test/java/com/yooterminal/pos/bookings/BookingsTest.kt`

**Interfaces:**
- Consumes: `EntitySource`, `Booking`, `CompanyStore` (Task 9), `ContextRepository` (Task 11).
- Produces:
  - `enum class BookingTab { UPCOMING, PAST, CANCELLED }`
  - `class BookingsRepository(private val entities: EntitySource)` with `suspend fun list(operatorSlug: String, tab: BookingTab, search: String, today: LocalDate): List<Booking>` and `suspend fun checkIn(booking: Booking, operatorName: String, now: Instant): Booking`
  - `fun normalizeSearch(raw: String): String?`

- [ ] **Step 1: Write the failing tests**

```kotlin
@Test fun `upcoming filters out cancelled and sorts by travel date`()
@Test fun `past uses a strict less-than on today`()
@Test fun `cancelled filters on status only`()
@Test fun `search uppercases and trims`()
@Test fun `check-in writes validated, validated_at and validated_by`()
@Test fun `a lowercase pasted reference still matches`()
```

Capture the `EntityQuery` passed to a fake `EntitySource` and assert the filter map exactly.

- [ ] **Step 2: Run and watch it fail**

Run: `.\gradlew.bat :app:testDebugUnitTest --tests "com.yooterminal.pos.bookings.BookingsTest"`

Expected: FAIL.

- [ ] **Step 3: Implement**

Queries mirror `OperatorBookingsTab.jsx`:

- Upcoming: `operator_slug`, `travel_date: {"$gte": today}`, `status: {"$ne":"cancelled"}`, sort `travel_date`, limit 60.
- Past: `travel_date: {"$lt": today}`, `status: {"$ne":"cancelled"}`, sort `-travel_date`.
- Cancelled: `status: "cancelled"`, sort `-travel_date`.
- Search adds `booking_ref: {"$regex": normalized, "$options": "i"}`.

`checkIn` PATCHes `{validated: true, validated_at: now.toString(), validated_by: operatorName}` and returns the merged model.

The screen: three tabs, search box, list of cards (ref, route, date/time, seats, passenger count, amount, validated badge), tap for a detail sheet with check-in. Check-in is disabled when already validated or cancelled. No print button in this plan.

The fragment takes `operatorSlug` from `CompanyStore` and `today` from `ContextRepository`, so a device with a wrong clock still files the right tickets under Upcoming.

- [ ] **Step 4: Run the tests and commit**

Run: `.\gradlew.bat :app:testDebugUnitTest --tests "com.yooterminal.pos.bookings.BookingsTest"`

```bash
git add pos-android/app/src/main/java/com/yooterminal/pos/bookings pos-android/app/src/main/java/com/yooterminal/pos/ui/TicketsFragment.kt pos-android/app/src/main/java/com/yooterminal/pos/ui/BookingAdapter.kt pos-android/app/src/main/res/layout/fragment_tickets.xml pos-android/app/src/main/res/layout/item_booking.xml pos-android/app/src/test/java/com/yooterminal/pos/bookings
git commit -m "feat(android): list and check in booked tickets"
```

---

### Task 14: Ticket validation by scan or reference

**Files:**
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/validation/ReferenceNormalizer.kt`
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/validation/ValidationRepository.kt`
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/ui/ValidateFragment.kt`
- Create: `pos-android/app/src/main/res/layout/fragment_validate.xml`
- Modify: `pos-android/app/src/main/AndroidManifest.xml` (camera permission)
- Test: `pos-android/app/src/test/java/com/yooterminal/pos/validation/ValidationTest.kt`

**Interfaces:**
- Consumes: `EntitySource`, `Booking`, `CompanyStore` (Task 9).
- Produces:
  - `object ReferenceNormalizer { fun normalize(raw: String): String? }`
  - `sealed interface LookupResult { data class Found(val booking: Booking); data object NotFound; data class Failed(val message: String) }`
  - `sealed interface CheckInResult { data class CheckedIn(val booking: Booking); data object AlreadyCheckedIn; data object Cancelled; data class Failed(val message: String) }`
  - `class ValidationRepository(private val entities: EntitySource)` with `suspend fun lookup(operatorSlug: String, raw: String): LookupResult` and `suspend fun checkIn(booking: Booking, operatorName: String, now: Instant): CheckInResult`

- [ ] **Step 1: Write the failing tests**

```kotlin
@Test fun `trims and uppercases a typed reference`()          // " bl7k2m9qx " -> "BL7K2M9QX"
@Test fun `extracts a reference from a URL`()                  // "https://x/t/BL7K2M9QX" -> "BL7K2M9QX"
@Test fun `extracts a reference from pasted ticket text`()     // "Ref BL7K2M9QX seat 12A" -> "BL7K2M9QX"
@Test fun `rejects unrelated text`()                           // "no ref" -> null, "12A" -> null
@Test fun `lookup queries by exact reference and limit one`()
@Test fun `lookup of an unknown reference is NotFound`()
@Test fun `check-in refuses an already validated ticket`()
@Test fun `check-in refuses a cancelled ticket`()
@Test fun `check-in stamps the operator name and time`()
```

- [ ] **Step 2: Run and watch them fail**

Run: `.\gradlew.bat :app:testDebugUnitTest --tests "com.yooterminal.pos.validation.ValidationTest"`

Expected: FAIL.

- [ ] **Step 3: Implement the normalizer and repository**

`normalize`: trim, uppercase, then match `Regex("\\bBL[A-Z0-9]{6,10}\\b")`; if no match, accept a whole string of 5–12 letters/digits; otherwise null.

`lookup`: `entities.list("Booking", EntityQuery(filter = mapOf("booking_ref" to normalized, "operator_slug" to operatorSlug), limit = 1))`. Empty → `NotFound`; IOException → `Failed("No connection. Check the network and retry.")`.

`checkIn`: `validated == true` → `AlreadyCheckedIn`; `status == "cancelled"` → `Cancelled`; otherwise PATCH the same three fields as Task 13 and return `CheckedIn`.

- [ ] **Step 4: Implement the screen and the camera path**

- Large reference field + **Check in** button, always usable.
- **Scan QR** button opens `ScanContract` with `ScanOptions().setDesiredBarcodeFormats(ScanOptions.QR_CODE)`. On a result, run `ReferenceNormalizer.normalize` and the same lookup.
- Request `android.permission.CAMERA` on first scan with `ActivityResultContracts.RequestPermission`; if denied, keep the typed path and show "Camera permission denied — type the reference."
- Result card: passenger(s), seat(s), route, date, status, validated state, and a single **Check in** action.
- Declare `<uses-permission android:name="android.permission.CAMERA" />`; leave `usesCleartextTraffic="false"` untouched.

- [ ] **Step 5: Run the tests and the device check**

Run: `.\gradlew.bat :app:testDebugUnitTest --tests "com.yooterminal.pos.validation.ValidationTest"`

On the V1: scan a printed sample QR from the spike, then type the same reference in lowercase with spaces — both must resolve to the same ticket. Check in once; the second attempt must say "already checked in".

- [ ] **Step 6: Commit**

```bash
git add pos-android/app/src/main/java/com/yooterminal/pos/validation pos-android/app/src/main/java/com/yooterminal/pos/ui/ValidateFragment.kt pos-android/app/src/main/res/layout/fragment_validate.xml pos-android/app/src/main/AndroidManifest.xml pos-android/app/src/test/java/com/yooterminal/pos/validation
git commit -m "feat(android): validate tickets by QR scan or reference"
```

---

### Task 15: Settings, sign-out and diagnostics

**Files:**
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/ui/SettingsFragment.kt`
- Create: `pos-android/app/src/main/res/layout/fragment_settings.xml`
- Create: `pos-android/app/src/main/java/com/yooterminal/pos/ui/SettingsViewModel.kt`
- Test: `pos-android/app/src/test/java/com/yooterminal/pos/ui/SettingsViewModelTest.kt`

**Interfaces:**
- Consumes: `SessionStore`, `CacheRepository`, `CompanyStore`, `TicketPrinter`, `TlsProbe`.
- Produces:
  - `class SettingsViewModel(session, cache, company, printer, tlsProbe)` with `fun signOut()`, `fun checkTls()`, `fun checkPrinter()`, `fun printSample()`, `fun diagnosticsText(): String`, and `log: StateFlow<List<String>>`
  - Sign-out clears the session, the cache **and** the selected company before navigating to sign-in.

- [ ] **Step 1: Write the failing test**

```kotlin
@Test fun `sign out clears the session and the cache`()
@Test fun `sign out clears the selected company`()
@Test fun `diagnostics never contain the token`()
```

Use fakes for session, cache, company and printer; assert `session.token() == null`, `cache.read(any) == null`, `company.current() == null`, and that a token saved before sign-out does not appear in `diagnosticsText()`.

- [ ] **Step 2: Run and watch it fail**

Run: `.\gradlew.bat :app:testDebugUnitTest --tests "com.yooterminal.pos.ui.SettingsViewModelTest"`

Expected: FAIL.

- [ ] **Step 3: Implement**

Move the spike's diagnostics into `SettingsViewModel`: TLS system probe, printer model/serial/status, sample print, copy diagnostics. Settings also shows the signed-in email, company name and status, device label, app version, and **Sign out**. Account editing, company switching and the update check are later plans.

- [ ] **Step 4: Run the tests and the debug build**

Run: `.\gradlew.bat :app:testDebugUnitTest; .\gradlew.bat :app:assembleDebug`

Expected: PASS; APK builds.

- [ ] **Step 5: Commit**

```bash
git add pos-android/app/src/main/java/com/yooterminal/pos/ui/SettingsFragment.kt pos-android/app/src/main/java/com/yooterminal/pos/ui/SettingsViewModel.kt pos-android/app/src/main/res/layout/fragment_settings.xml pos-android/app/src/test/java/com/yooterminal/pos/ui/SettingsViewModelTest.kt
git commit -m "feat(android): add settings, sign-out and printer diagnostics"
```

---

### Task 16: Publish the release and install it on the V1

**Files:**
- Modify: `scripts/publish-pos-apk.mjs` (versioned APK name, manifest, remove the plain-HTTP hint)
- Modify: `public/pos/index.html` (generated by the script)
- Modify: `public/pos/build.json` (generated by the script)
- Delete: `public/pos/yooterminal-pos.apk` (replaced by the versioned file)
- Modify: `public/pos/manifest.json` (new)

**Interfaces:**
- Consumes: the completed app from Tasks 3–15, signed with the existing `yooterminal-pos.jks` keystore.
- Produces: `https://www.yooterminal.com/pos/yooterminal-operator-2.0.0.apk` and `https://www.yooterminal.com/pos/manifest.json` with `{versionName, versionCode, url, sha256, size, publishedAt}`.

- [ ] **Step 1: Remove the obsolete plain-HTTP fallback**

The certificate change in Task 0 makes HTTPS work on the device. Delete the `POS_PUBLIC_HTTP_*` logic and the HTTP link in the install page; the page must link only to the HTTPS APK.

- [ ] **Step 2: Make the publish script versioned and manifest-driven**

- Source: `pos-android/app/build/outputs/apk/release/app-release.apk`.
- Target: `public/pos/yooterminal-operator-<versionName>.apk`.
- Write `public/pos/manifest.json` with `versionName`, `versionCode`, `url` (absolute HTTPS), `sha256`, `size`, `publishedAt`.
- Keep `build.json` and `index.html` for humans; both read the same values.
- Refuse to publish if the APK signature cannot be verified with `apksigner verify --print-certs`.

- [ ] **Step 3: Build, sign, publish**

```
cd pos-android
.\gradlew.bat :app:assembleRelease
cd ..
npm run pos:publish
npm run build
```

Expected: `public/pos/yooterminal-operator-2.0.0.apk`, `public/pos/manifest.json`, and `dist/pos/…` after the build.

- [ ] **Step 4: Verify the signature and hash**

```
apksigner verify --print-certs pos-android\app\build\outputs\apk\release\app-release.apk
certutil -hashfile public\pos\yooterminal-operator-2.0.0.apk SHA256
```

Expected: `CN=YooTerminal POS` (existing keystore) and the hash printed matches `manifest.json`.

- [ ] **Step 5: Deploy the build**

Follow the project's established deploy: copy `dist/` plus the changed server files to the production app directory, restart the pm2 app that serves this site, then health-check. Never run `npm run seed` in production. (Host, directory and process names live in the operator's local notes, not in this repo.)

Verify from outside:

```
curl -sS https://www.yooterminal.com/pos/manifest.json
curl -sSI https://www.yooterminal.com/pos/yooterminal-operator-2.0.0.apk
```

Expected: manifest JSON with the same hash; the APK responds `200` with `application/vnd.android.package-archive` or `application/octet-stream`.

- [ ] **Step 6: Install on the V1 and run the acceptance checklist**

On the device browser, open `https://www.yooterminal.com/pos/`, download, allow unknown sources once, install.

Acceptance:

1. App opens without a certificate warning anywhere.
2. Sign in with an operator account; Overview shows the company and the month's numbers.
3. Force-stop and reopen; still signed in.
4. Tickets lists upcoming rows; search by a lowercase reference finds the ticket.
5. Validate scans a printed QR and checks the ticket in; a second attempt says already checked in.
6. Airplane mode: Overview and Tickets show the offline copy with a timestamp; Validation says it needs a connection.
7. Sign out returns to sign-in and clears the cached data.
8. Printer diagnostics still report model and status.

- [ ] **Step 7: Commit the published files**

```bash
git add scripts/publish-pos-apk.mjs public/pos
git commit -m "release(android): publish operator app 2.0.0"
```

---

## Self-Review

**Spec coverage (phase 0 + 1):**

| Spec requirement | Task |
|---|---|
| ZeroSSL RSA certificate, Android-6-trusted chain, device gate | 0 |
| Bearer auth over Better Auth | 1 |
| `/api/pos/context` with operator, currency, server time, app policy | 2 |
| `/api/pos/app-version` | 2 |
| Native Kotlin/XML, package, versions, no Play Services | 3, 9 |
| Keystore-encrypted token; no password stored | 5 |
| One operator per device; company resolution 0/1/many | 8, 9, 12 |
| Navigation: Sell · Dashboard · Tickets · Validate · More | 9 |
| Sign-in and session persistence | 12 |
| Read cache with offline copy; clears on sign-out | 10, 15 |
| Overview with server time and pending banner | 11 |
| Booked tickets: upcoming/past/cancelled, search, check-in | 13 |
| Validation: camera QR + typed reference, duplicate/cancelled refusal | 14 |
| Settings: sign-out, printer test, diagnostics, version | 15 |
| APK published over trusted HTTPS and installed | 16 |

**Deliberately not in this plan:** selling, printing tickets, mobile money, timetable/fleet/seat-control/coupon editing, earnings/reports/customers screens, account editing, in-app updates. Each has its own plan per the spec's delivery phases.

**Type consistency:** `EntitySource` is the only repository dependency; `LoadResult` is produced by Task 11 and reused by later read screens; `Booking` is the single booking model used by Tickets and Validation; `SessionStore` is the only token access path; `CompanyStore` is the only company access path; `AuthEvents.expired` is the only expiry signal.

**Task order:** every task compiles and tests green on its own. Tasks 8 and 9 build logic and the shell before any screen; Task 11 adds Overview and Task 12 immediately makes it reachable from sign-in, so the app is first runnable end-to-end at Task 12. Tasks 13–15 add screens that the shell already routes.

**Review Focus tests placed:** token expiry → Tasks 6 and 12; zero/many companies → Tasks 8 and 12; offline first launch → Tasks 10 and 11; reference normalization → Task 14; server clock → Tasks 2, 11 and 13.
