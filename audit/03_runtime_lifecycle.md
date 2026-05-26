# 03 Runtime Lifecycle

## Findings

### FND-018: Memory guard exits bare processes and `on-reload` baselines mask growth
- **Severity**: High
- **Category**: runtime
- **File(s)**: `src/plugin/reload.ts:71-82`, `src/plugin/reload.ts:254-356`, `src/plugin/reload.ts:403-409`
- **Component**: reload plugin / memory monitor
- **Platform**: All
- **Reproduction / Trigger**: Enable memory guard and exceed thresholds while running without PM2, or set `memory mode reload`.
- **Evidence**: `memoryMonitorTask()` calls `reloadRuntime()` and then `scheduleTrackedTimeout(() => process.exit(0), 1000)` if still high. It never checks `PM2_HOME`/`pm_id`. When `baselineMode === "on-reload"`, it rewrites baseline after every reload, which can make growth-based alerts ineffective.
- **Root Cause**: Memory recovery is coupled to PM2 supervision and the baseline policy can reset the signal being monitored.
- **Impact**: Bare `npm start` users lose the bot permanently after `exit(0)`; growth monitoring can fail to detect leaks that grow across reload cycles.
- **Suggested Fix**: Detect supervisor before exiting. If unsupervised, send an actionable warning and skip process exit. Rename `on-reload` to "reset-after-reload" and warn that it disables cross-reload growth detection, or keep a long-lived baseline in a separate file.
- **Confidence**: 5
- **References**: FND-004, FND-033.

### FND-019: Generation drain timeout never transitions to disposed
- **Severity**: High
- **Category**: runtime
- **File(s)**: `src/utils/generationContext.ts:369-439`, `src/utils/runtimeManager.ts:186-208`
- **Component**: generationContext / runtimeManager
- **Platform**: All
- **Reproduction / Trigger**: Start a tracked task that never settles, then call reload; drain times out after 15s.
- **Evidence**: When `result === "timeout"`, `drain()` marks tasks as timed-out but does not set `lifecycleState = "disposed"` and does not complete the abort token. Later snapshots remain in `"draining"` with residual resources.
- **Root Cause**: Timeout is treated as partial drain without a terminal lifecycle state.
- **Impact**: Repeated reloads can retain old generations, residual maps, listeners/tasks that never settle, and misleading diagnostics. This matches the plan's suspected cumulative leak.
- **Suggested Fix**: Introduce a terminal `"disposed-with-residuals"` state or set disposed while preserving residual diagnostics. Ensure subsequent `dispose()` calls do not re-wait forever, and add tests for timeout drain.
- **Confidence**: 5
- **References**: `status lifecycle` output uses these counters.

### FND-020: Generation canceled counters do not represent actual canceled resources
- **Severity**: Medium
- **Category**: runtime
- **File(s)**: `src/utils/generationContext.ts:187-197`, `src/utils/generationContext.ts:476-480`
- **Component**: generationContext diagnostics
- **Platform**: All
- **Reproduction / Trigger**: Abort a generation with active tasks/disposables.
- **Evidence**: `markResourcesCanceled()` increments `stats[kind].canceled` for every active resource except abort-token but leaves those resources active in `resources`; later completion also increments `completed`.
- **Root Cause**: "Abort requested" and "resource actually canceled" share one counter.
- **Impact**: Diagnostics can show resources both canceled and later drained, overstating cancellation and making leak diagnosis harder.
- **Suggested Fix**: Rename to `abortRequested` or move cancellation increments into actual disposal/task abort paths. Keep `active`, `completed`, `timedOut`, and `abortRequested` mutually understandable.
- **Confidence**: 5
- **References**: `src/plugin/status.ts:298-325` renders these stats to users.

### FND-021: Client destroy timeout can leave current runtime failed and old handles alive
- **Severity**: High
- **Category**: runtime
- **File(s)**: `src/utils/runtimeManager.ts:88-140`, `src/utils/runtimeManager.ts:300-352`
- **Component**: runtimeManager
- **Platform**: All
- **Reproduction / Trigger**: `client.destroy()` hangs or exceeds 15s during reload.
- **Evidence**: `destroyClient()` wraps `client.destroy()` in `withTimeout`; if it rejects, `disposeRuntime()` throws; `reloadRuntime()` marks `oldRuntime.state = "failed"` and rethrows before building a new runtime. `currentRuntime` still points to the failed old runtime until a later transition.
- **Root Cause**: Destroy timeout is treated as a hard reload failure without isolating old client handles or starting a replacement.
- **Impact**: The bot can remain bound to a failed old runtime with partially destroyed network handles, while future command paths still resolve `currentRuntime`.
- **Suggested Fix**: On destroy timeout, mark old runtime as abandoned, detach event handlers, set `currentRuntime = null` or continue to build a new runtime, and log residual handles. Consider a best-effort disconnect before destroy and process restart after repeated destroy timeouts.
- **Confidence**: 4
- **References**: FND-019 for residual drain behavior.

### FND-024: Cron cleanup stops schedules but does not wait in-flight executions
- **Severity**: Medium
- **Category**: concurrency
- **File(s)**: `src/utils/cronManager.ts:43-69`, `src/utils/cronManager.ts:72-80`, `src/utils/pluginManager.ts:451-463`
- **Component**: cronManager
- **Platform**: All
- **Reproduction / Trigger**: Reload while a cron handler is still running.
- **Evidence**: `del()` calls `job.stop()` and deletes task state; running promise tasks are tracked only through `GenerationContext.trackTask()`. The manager itself does not expose or wait `running`.
- **Root Cause**: Cron job lifecycle and in-flight execution lifecycle are split.
- **Impact**: A new generation can register a same-named cron task while the old execution still writes lowdb/SQLite, sends messages, or mutates files.
- **Suggested Fix**: Track per-job execution promises and expose `drain(name, timeout)`. On reload, stop schedules and wait or report in-flight tasks before accepting same task names in a new generation.
- **Confidence**: 4
- **References**: FND-026 for lowdb write races.

## File-by-File Lifecycle Notes

### `src/utils/runtimeManager.ts`

- `transitionPromise` serializes start/reload/shutdown but returns the in-progress transition to all callers; that prevents many double-init races.
- Startup failure sets `currentRuntime = null`, while reload plugin-load failure keeps `currentRuntime = newRuntime` with state `failed`. This is intentional per comments but should be documented because command availability differs by path.
- `cloneEmptyDrainStats()` is misnamed; it clones non-empty stats.

### `src/utils/generationContext.ts`

- Core issue: FND-019.
- `delay()` correctly short-circuits when already aborted and tracks task/timeout when active.
- `setTimeout()` and `setInterval()` are tracked, but direct timers outside lifecycle remain in `ping`, `status`, `banUtils`, and fallback paths.

### `src/utils/pluginManager.ts`

- See `04_plugin_system.md`.

### `src/utils/cronManager.ts`

- See FND-024.

### `src/utils/channelGapBreaker.ts`

- See `05_telegram_layer.md`.

### `src/utils/logger.ts`

- See `06_logger_console.md`.

