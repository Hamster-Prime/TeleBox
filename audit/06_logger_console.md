# 06 Logger Console

## Covered Findings

- FND-015: full object inspection and sendlog leakage.
- FND-025: channel-gap downgrade/circuit-breaker coupling.

## Notes

- `src/utils/logger.ts:46-58` stores original console functions and overrides once via `Logger.isOverridden`; excluding logger from plugin cache purge avoids stacked wrappers.
- `src/utils/logger.ts:104-110` uses full-depth `util.inspect`, which is the sensitive-data issue captured in FND-015.
- `src/utils/logger.ts:227-313` duplicates downgrade/circuit-breaker logic across `log`, `warn`, and `error`. This is maintainability risk, but not a separate finding because behavior is currently consistent across those three paths.
- ANSI color constants are always emitted. PM2 file logs can retain escape codes because there is no `isTTY` guard.
- `initDB().catch(console.error)` is fire-and-forget during construction; if lowdb initialization fails, the logger silently remains at default INFO.

## Recommendations

1. Centralize downgrade logic in one helper to reduce drift.
2. Add redaction before `util.inspect`.
3. Disable ANSI colors when stdout/stderr are not TTY or when `PM2_HOME` is set.
4. Make log-level DB initialization failure visible through one clear startup warning.

