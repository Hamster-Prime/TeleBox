# 19 Docs Consistency

## Finding

### FND-038: README/INSTALL/TELEBOX_DEVELOPMENT/.env-sample diverge from code
- **Severity**: Medium
- **Category**: docs
- **File(s)**: `README.md:88-99`, `README.md:376`, `INSTALL.md:193-194`, `TELEBOX_DEVELOPMENT.md:377-379`, `.env-sample:1-8`
- **Component**: documentation
- **Platform**: All
- **Reproduction / Trigger**: Compare docs with current files and runtime config.
- **Evidence**: README lists `id.ts` and `sysinfo.ts`, but current built-ins are `debug.ts` and `status.ts`; README says `NODE_ENV=development tpm run dev`, not `npm run dev`; INSTALL recommends `pm2 start "npm start" --name telebox` despite an ecosystem config; TELEBOX_DEVELOPMENT says Telegram library version `^2.26.22` while package uses `teleproto`; `.env-sample` omits `TB_CONNECTION_RETRIES`, `TB_LOCALSTORAGE_FILE`, and PM2 env knobs.
- **Root Cause**: Documentation was not updated atomically with code and deployment changes.
- **Impact**: Users follow stale commands, miss security-sensitive env configuration, and do not learn about PM2 single-instance constraints.
- **Suggested Fix**: Add a docs verification checklist tied to release. Generate command/plugin lists from source, document all env vars, and replace PM2 quick-start with `pm2 start ecosystem.config.cjs` plus single-instance warning.
- **Confidence**: 5
- **References**: Package/runtime evidence in `audit/_inventory.md`.

## Per-File Notes

- `README.md`: stale structure, typo in development command, no strong warning that `.exec`, sudo, TPM plugin install, sendlog, and backup can expose host/account secrets.
- `INSTALL.md`: Debian/Ubuntu steps are detailed, but Windows badge overpromises; PM2 command bypasses ecosystem config; no native module guidance for Windows/macOS.
- `CHANGELOG.md`: top entry says typecheck/startup validation was completed, but current checkout cannot reproduce it without dependency install and lockfile.
- `TELEBOX_DEVELOPMENT.md`: useful cleanup guidance exists, but dependency/library version examples are stale in places.
- `.env-sample`: missing several env vars used by code.

## Post-Fix Notes

- `README.md` structure now names current built-ins such as `debug.ts`, `status.ts`, and `loglevel.ts`.
- `INSTALL.md` uses `npm ci` and `pm2 start ecosystem.config.cjs`.
- `TELEBOX_DEVELOPMENT.md` uses `teleproto` examples and the current `ecosystem.config.cjs` filename.
- `.env-sample` documents session injection, connection retries, localStorage, command-prefix, and listener-edit env vars.
