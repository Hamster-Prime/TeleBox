# 08 Utils By File

## Finding

### FND-031: Path helper cannot create nested subdirectories
- **Severity**: Low
- **Category**: correctness
- **File(s)**: `src/utils/pathHelpers.ts:7-14`
- **Component**: pathHelpers
- **Platform**: All
- **Reproduction / Trigger**: Call `createDirectoryInAssets("a/b")` when `assets/a` does not already exist.
- **Evidence**: `fs.mkdirSync(filePath)` is called without `{ recursive: true }`.
- **Root Cause**: Helper assumes only one-level directory names.
- **Impact**: Future callers using nested names fail unexpectedly; callers may reimplement path creation inconsistently.
- **Suggested Fix**: Use `fs.mkdirSync(filePath, { recursive: true })` and validate names when callers need containment.
- **Confidence**: 5
- **References**: `scripts/run-tsx.cjs:19` uses recursive mkdir for the same class of directory creation.

## Per-File Review

### `src/utils/aliasDB.ts`

- Finding refs: FND-027.
- Prepared statements prevent SQL injection for alias values.
- No WAL/busy timeout and each instance opens/closes sync DB.

### `src/utils/apiConfig.ts`

- Finding refs: FND-013.
- `promptInput()` creates a separate callback readline path from `loginManager.ts`, which uses `readline/promises`; first-run stdin behavior should be tested.
- Invalid JSON returns `{}` and continues, which can overwrite user config later.

### `src/utils/authGuards.ts`

- No direct finding.
- Only `AUTH_KEY_UNREGISTERED` is treated specially; `SESSION_REVOKED` and `USER_DEACTIVATED` should be considered equivalent auth-failure states.

### `src/utils/banUtils.ts`

- No built-in plugin import was found; likely support code for remote plugins.
- Heavy `any` use contributes to FND-029.
- Direct `setTimeout` delays exist (`banUtils.ts:115`, `banUtils.ts:280`) and are not lifecycle-aware unless callers wrap them.

### `src/utils/channelGapBreaker.ts`

- Finding refs: FND-025.
- Private teleproto state access is version fragile.
- `git blame` confirms recent teleproto layout churn.

### `src/utils/conversation.ts`

- No finding.
- Listener cleanup paths remove abort listeners, timers, and event handlers.
- Fallback non-lifecycle timeout exists only when no lifecycle is available.

### `src/utils/cronManager.ts`

- Finding refs: FND-024.
- Cron expression validation exists.
- In-flight execution drain is not owned by the manager.

### `src/utils/entityHelpers.ts`

- No standalone finding.
- FloodWait retry uses lifecycle-aware delays when a generation context exists.
- Each retry resolves source and destination entities again; cache if this becomes hot.

### `src/utils/generationContext.ts`

- Finding refs: FND-019, FND-020.
- Resource tracking is broad and useful, but timeout terminal state and counters need correction.

### `src/utils/globalClient.ts`

- OK.
- Pure re-export shim; no logic beyond runtimeManager exports.

### `src/utils/logger.ts`

- Finding refs: FND-015.
- Console override singleton guard is good.
- Full-depth object inspection and ANSI output need redaction/TTY handling.

### `src/utils/loginManager.ts`

- No standalone finding.
- QR timeout and lifecycle delays are implemented.
- Network/login failures outside `AUTH_KEY_UNREGISTERED` bubble to startup; consider retry/backoff UX.

### `src/utils/npm_install.ts`

- Finding refs: FND-001, FND-033.
- Uses `execFileSync` with argument arrays, so shell injection was not found.
- It strips many npm lifecycle env vars but leaves broader env such as `NODE_OPTIONS`; review if untrusted plugin code can call `npm_install()`.

### `src/utils/pathHelpers.ts`

- Finding refs: FND-031.
- Base paths are fixed to `assets` and `temp`, but callers must still validate names if user-controlled.

### `src/utils/pluginBase.ts`

- Finding refs: FND-029.
- `JSON.parse(process.env.TB_CMD_IGNORE_EDITED || "true")` can throw at module load if env is invalid.
- `isValidPlugin()` is duck-typed; that is practical for plugin authors, but it does not sandbox code.

### `src/utils/pluginManager.ts`

- Finding refs: FND-022, FND-023.
- Command dispatch error containment is reasonable.
- Dynamic require is the central trust boundary; see FND-012.

### `src/utils/runtimeManager.ts`

- Finding refs: FND-021.
- `transitionPromise` prevents most concurrent transition races.
- Destroy timeout failure path needs stronger isolation.

### `src/utils/safeGetMessages.ts`

- No finding.
- Narrowly catches only the known `undefined.date` teleproto crash; other exceptions are intentionally rethrown.

### `src/utils/sendLogDB.ts`

- Finding refs: FND-027.
- Target is string-only; `sendLog.ts` declares `string | number` but DB never returns numbers.

### `src/utils/sudoDB.ts`

- Finding refs: FND-027.
- Prepared statements are used; permission model risk lives in FND-008.

### `src/utils/sureDB.ts`

- Finding refs: FND-027.
- Prepared statements are used; message whitelist logic risk lives in plugin review.

### `src/utils/teleboxInfoHelper.ts`

- No finding.
- `git rev-parse --short HEAD` is a fixed string, no injection.
- Result could be cached because status/help can call it repeatedly.

### `src/utils/telegramFormatter.ts`

- No built-in source import found.
- If this is a public helper for remote plugins, move to documented plugin SDK or mark as internal.

### `src/utils/telegraphFormatter.ts`

- No built-in source import found.
- Large formatter surface should have tests before being advertised as plugin API.

### `src/utils/tlRevive.ts`

- Finding refs: FND-029.
- Dynamic constructor revive is internal in this repo; do not expose it to untrusted JSON without a class allowlist.

