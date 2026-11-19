# Task 2 Report: POS Context and App Version Policy

## Step 1: Write the failing test

Created `server/tests/posContext.test.js` with the test file from the task brief. The test file imports from `../posContext.js` and `../pos.js` which do not exist yet.

## Step 2: Run and watch them fail

Running tests: FAIL - module not found as expected.

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../server/posContext.js'
```

## Step 3: Implement `server/posContext.js`

Created `server/posContext.js` with:
- `currencyFor(country)` - returns 'RWF' for Rwanda, 'UGX' otherwise (including null/undefined)
- `buildContext({ sqlite, caller, now, policy })` - queries operator by owner_email (case-insensitive), returns operator with currency, or null operator if not found
- `appPolicyFromEnv()` - reads environment variables with defaults

## Step 4: Implement `server/pos.js` and mount it

Created `server/pos.js` with `createPosRouter` function that:
- Accepts sqlite and getCallerFn options with defaults
- Has GET /context endpoint that:
  - Resolves caller via getCallerFn
  - Returns 401 if no caller
  - Returns JSON context with operator info and app policy

Mounted the router in `server/index.js` next to other routers.

## Step 5: Run the tests, then the suite, lint and build

Running tests...

All 4 posContext tests pass:
```
✔ context maps Rwanda to RWF and Uganda to UGX (0.9329ms)
✔ context resolves the operator by owner email, case-insensitively (6.5079ms)
✔ context returns a null operator when nobody owns the caller email (0.49ms)
✔ GET /api/pos/context is 401 without a caller (50.1629ms)
```

Full server test suite (20 tests): pass
Lint: pass
Build: success

## Step 6: Commit

```
git add server/posContext.js server/pos.js server/index.js server/tests/posContext.test.js
git commit -m "feat(pos): expose operator context and app version policy"
```