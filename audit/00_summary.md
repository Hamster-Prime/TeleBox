# TeleBox Audit Summary

## Severity Histogram

| Severity | Count |
|---|---:|
| Critical | 5 |
| High | 11 |
| Medium | 19 |
| Low | 3 |
| Info | 0 |

## Top 10 Risks

1. FND-006 Critical: `ping` target is interpolated into a shell command.
2. FND-008 Critical: sudo users can trigger dangerous commands as the main account.
3. FND-009 Critical: remote TPM plugin names can escape `plugins/` and overwrite files.
4. FND-010 Critical: Telegram-uploaded plugin filenames can escape `plugins/` and are required during validation.
5. FND-013 Critical: Telegram StringSession is stored in plaintext without permission hardening.
6. FND-011 High: TPM plugin URLs accept arbitrary hosts and have no content-size/integrity limits.
7. FND-014 High: debug commands leak entity/message internals, including access hashes.
8. FND-015 High: full object logging plus sendlog can exfiltrate secrets.
9. FND-016 High: `bf all` can send almost the whole project directory to Telegram.
10. FND-019 High: generation drain timeout leaves old contexts undisposed with residual resources.

## Finding Index

| ID | Severity | Title |
|---|---|---|
| FND-001 | High | Missing ignored lockfile makes dependency trees non-reproducible |
| FND-002 | Medium | Current checkout cannot run dependency, audit, or type gates |
| FND-003 | Medium | Declared dependency set is oversized and partially unused/ESM-risky |
| FND-004 | High | PM2 config permits multiple UserBot instances on one session |
| FND-005 | Medium | Claimed Windows support conflicts with scripts and shell tooling |
| FND-006 | Critical | `ping` target reaches `exec()` shell interpolation |
| FND-007 | High | Update plugin interpolates git names into shell commands and exposes forced reset |
| FND-008 | Critical | Sudo delegation can invoke every command, including `.exec`, `.tpm`, `.update`, and `.prefix` |
| FND-009 | Critical | TPM remote plugin keys can path-traverse outside `plugins/` |
| FND-010 | Critical | Uploaded plugin filenames can path-traverse and are executed during validation |
| FND-011 | High | TPM downloads arbitrary-host plugin URLs without integrity or size limits |
| FND-012 | High | Plugin installation is full host/account code execution but UX/docs understate it |
| FND-013 | Critical | `config.json` stores Telegram StringSession plaintext without chmod/secret-store controls |
| FND-014 | High | Debug commands leak TL internals/access hashes and send unescaped JSON as HTML |
| FND-015 | High | Logger and sendlog can expose secrets through full dumps and log-file transfer |
| FND-016 | High | `bf all` can exfiltrate almost the whole program directory without size guard |
| FND-017 | Medium | `re` has unbounded message count/repeat loops |
| FND-018 | High | Memory guard exits bare processes and `on-reload` baselines mask growth |
| FND-019 | High | Generation drain timeout never transitions to disposed |
| FND-020 | Medium | Generation canceled counters do not represent actual canceled resources |
| FND-021 | High | Client destroy timeout can leave current runtime failed and old handles alive |
| FND-022 | Medium | User/default plugin name collisions run duplicate setup/listeners |
| FND-023 | Medium | Alias lookup opens SQLite on every command parse |
| FND-024 | Medium | Cron cleanup stops schedules but does not wait in-flight executions |
| FND-025 | Medium | Channel-gap breaker depends on teleproto private fields and reload resets cooldown |
| FND-026 | Medium | lowdb writes can lose updates under concurrent command/cron writes |
| FND-027 | Medium | SQLite DBs use sync open/close per operation and no WAL |
| FND-028 | Medium | Unhandled promise rejections are logged but the process keeps running |
| FND-029 | Medium | TypeScript strictness is weakened by broad `any`/`@ts-ignore` hotspots |
| FND-030 | Low | User `plugins/**/*` are part of project typecheck |
| FND-031 | Low | Path helper cannot create nested subdirectories |
| FND-032 | Medium | Hook monkey patches are fragile and one imported hook is dead |
| FND-033 | Medium | Update reloads runtime after npm install instead of restarting for native/module changes |
| FND-034 | Medium | `.exec` uses Markdown without escaping command/output |
| FND-035 | Low | Prefix `.env` writer can emit invalid values |
| FND-036 | Medium | TPM CLI mode is broken outside runtime lifecycle |
| FND-037 | Medium | Status/sysinfo has platform gaps, including deprecated Windows `wmic` |
| FND-038 | Medium | README/INSTALL/TELEBOX_DEVELOPMENT/.env-sample diverge from code |

## Phase Status

| Phase | Status | Evidence |
|---|---|---|
| A Global mapping | Completed | `audit/_inventory.md`, `01_dependency_audit.md`, `17_build_deploy.md`, `19_docs_consistency.md` |
| B Security | Completed | `02_security_findings.md` covers B.1-B.8 with findings or OK notes |
| C Runtime/lifecycle | Completed | `03_runtime_lifecycle.md`, `04_plugin_system.md`, `06_logger_console.md` |
| D Cross-platform | Completed | `09_cross_platform.md` |
| E Concurrency/data | Completed | `11_data_layer.md`, `14_concurrency.md` |
| F Perf/memory | Completed | `10_perf_memory.md` |
| G Plugin-by-plugin | Completed | `07_plugin_by_plugin.md` has all 16 built-ins |
| H Utils-by-file | Completed | `08_utils_by_file.md` has all utils files |
| I Hook/monkey patch | Completed | `05_telegram_layer.md`, `08_utils_by_file.md` |
| J TypeScript | Completed and verified post-fix | `npm run typecheck` and `npm run typecheck:plugins` pass after `npm ci` |
| K Tests/observability | Completed | `18_tests_coverage.md`, `15_logging_observability.md` |
| L Docs consistency | Completed | `19_docs_consistency.md` |
| M Action plan | Completed | `20_action_plan.md` |
