# 13 Error Handling

## Finding

### FND-028: Unhandled promise rejections are logged but the process keeps running
- **Severity**: Medium
- **Category**: error_handling
- **File(s)**: `src/index.ts:12-20`
- **Component**: process lifecycle
- **Platform**: All
- **Reproduction / Trigger**: Any unhandled rejection in a listener, cron task, or async command path escapes local handlers.
- **Evidence**: `process.on("unhandledRejection")` logs `[FATAL]` but does not exit; `uncaughtException` logs and exits with code 1.
- **Root Cause**: Fatality policy differs between sync exceptions and async rejections.
- **Impact**: The process can continue after a corrupted async state, leaked resources, or failed invariant while PM2 never restarts it.
- **Suggested Fix**: Decide explicit policy. For production, log, attempt graceful shutdown with timeout, then `process.exit(1)`. For development, optionally keep alive behind `TB_UNHANDLED_REJECTION=warn`.
- **Confidence**: 5
- **References**: Node.js unhandled rejection behavior changed across versions; Node 24 policy should be explicit.

## Notes

- `dealCommandPluginWithMessage()` catches command handler errors and attempts one safe `msg.edit`.
- Many plugin commands expose raw error messages to users; this is acceptable for a userbot owner, but risky in delegated sudo/sure contexts.
- Several fallback catches swallow context (`catch {}`) in hooks and Telegram private-field code; that keeps the bot alive but makes diagnosis harder.

