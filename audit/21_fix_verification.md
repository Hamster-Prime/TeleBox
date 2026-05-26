# 21 Fix Verification

Current remediation pass for all findings in `audit/*.md`.

## Verification Commands

Run after the fixes:

- `npm ci`
- `npm run typecheck`
- `npm run typecheck:plugins`
- `npm test`
- `npm run audit`
- `npx -y node@24 /home/sanite/.npm-global/lib/node_modules/npm/bin/npm-cli.js ci`
- `npx -y node@24 /home/sanite/.npm-global/lib/node_modules/npm/bin/npm-cli.js run typecheck`
- `npx -y node@24 /home/sanite/.npm-global/lib/node_modules/npm/bin/npm-cli.js run typecheck:plugins`
- `npx -y node@24 /home/sanite/.npm-global/lib/node_modules/npm/bin/npm-cli.js test`
- `npx -y node@24 /home/sanite/.npm-global/lib/node_modules/npm/bin/npm-cli.js run audit`

## Finding Closure Matrix

| Finding | Status | Evidence |
|---|---|---|
| FND-001 | Fixed | `package-lock.json` restored; `.gitignore` no longer ignores it; docs use `npm ci`. |
| FND-002 | Fixed | `typecheck`, `typecheck:plugins`, `test`, and `audit` scripts added and passing. |
| FND-003 | Fixed | Unused/native-heavy dependencies removed from core dependency set; lockfile regenerated. |
| FND-004 | Fixed | PM2 config forces `exec_mode: "fork"` and `instances: 1`; docs warn against shared-session multi-instance. |
| FND-005 | Fixed | Cross-platform dev script uses JS runner; ping/status Windows gaps reduced; Windows limitations documented. |
| FND-006 | Fixed | `ping` uses `execFile` with strict host validation and platform-specific args. |
| FND-007 | Fixed | `update` git commands use `execFile` argument arrays and validate remote/branch names. |
| FND-008 | Fixed | Command policy blocks dangerous owner-only commands from sudo/sure delegated invocations. |
| FND-009 | Fixed | TPM plugin IDs validate with a conservative allowlist and resolve under `plugins/`. |
| FND-010 | Fixed | Uploaded plugin filenames are basenamed/validated, downloaded to quarantine, size-checked, and not `require()`d during validation. |
| FND-011 | Fixed | TPM remote plugin URLs are restricted to official raw GitHub source with body/content size limits and redirects disabled. |
| FND-012 | Fixed | TPM remote install/update and uploaded local plugin install require `--yes`; README/development docs warn that plugins execute trusted code. |
| FND-013 | Fixed | `config.json` writes use `0600`; existing broad permissions are chmodded; `TB_SESSION`/secret env injection supported and documented. |
| FND-014 | Fixed | Debug raw dumps are redacted, HTML-escaped, and sent to Saved Messages by default. |
| FND-015 | Fixed | Logger redacts sensitive fields; sendlog previews metadata and sends redacted tail files only after confirmation. |
| FND-016 | Fixed | `bf all` is disabled; standard backups exclude secret filenames and enforce size limits. |
| FND-017 | Fixed | `re` caps message count and repeat count. |
| FND-018 | Fixed | Memory guard detects supervisor before process exit and documents reset-after-reload baseline risk. |
| FND-019 | Fixed | Drain timeout enters `disposed-with-residuals` and later drains do not re-wait forever. |
| FND-020 | Fixed | Abort no longer increments fake cancellation counters for every active resource; cancellation is recorded on actual disposal. |
| FND-021 | Fixed | Runtime continues building a fresh runtime after old destroy/disposal failure and marks abandoned runtime failed. |
| FND-022 | Fixed | Duplicate plugin names/commands are skipped with first-loaded precedence. |
| FND-023 | Fixed | Alias list is loaded once per plugin reload and used from memory on command parse. |
| FND-024 | Fixed | Cron disposal stops schedules and awaits in-flight executions; covered by unit test. |
| FND-025 | Fixed | Channel-gap cooldown is no longer reset during reload; private-field adapter is tested for legacy and updateManager layouts. |
| FND-026 | Fixed | lowdb users in `tpm`, `reload`, `status`, and `bf` use singleton/read-write serialization. |
| FND-027 | Fixed | SQLite DB helpers use shared per-process handles with WAL and busy timeout. |
| FND-028 | Fixed | Production unhandled rejections trigger graceful shutdown then process exit; development can opt into warn behavior. |
| FND-029 | Fixed | Reported hotspots no longer contain `@ts-ignore`, `as any`, `: any`, or `any` matches; strict typecheck passes. |
| FND-030 | Fixed | Core `tsconfig.json` excludes user plugins; optional `tsconfig.plugins.json` validates plugins. |
| FND-031 | Fixed | Path helper uses recursive mkdir. |
| FND-032 | Fixed | Dead `patchMsgEdit` hook removed; Telegram patches are idempotent and HTML entity sentinels are collision-safe. |
| FND-033 | Fixed | Update exits under supervisor after dependency install; bare mode instructs manual restart. |
| FND-034 | Fixed | `.exec` output uses escaped HTML/code/pre blocks instead of raw Markdown. |
| FND-035 | Fixed | Prefix values reject whitespace/quotes/newlines and persist via JSON string escaping. |
| FND-036 | Fixed | TPM CLI install path uses CLI-only core logic without runtime `loadPlugins()`. |
| FND-037 | Fixed | Status avoids deprecated Windows `wmic`; unsupported process counts report unsupported instead of fabricated defaults. |
| FND-038 | Fixed | README, INSTALL, TELEBOX_DEVELOPMENT, CHANGELOG, and `.env-sample` updated for current behavior. |

## Residual Notes

- Current local shell default is Node `v22.22.2`, so npm emits an engine warning. Node 24 validation is run through `npx -y node@24`.
- Runtime Telegram login flows were not exercised against a live Telegram account; verification here covers static/type/unit/audit gates and code-path evidence.
