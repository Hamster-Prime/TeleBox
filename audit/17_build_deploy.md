# 17 Build And Deploy

## Findings

### FND-004: PM2 config permits multiple UserBot instances on one session
- **Severity**: High
- **Category**: runtime
- **File(s)**: `ecosystem.config.cjs:38-39`, `ecosystem.config.cjs:51-52`, `ecosystem.config.cjs:71-77`
- **Component**: PM2 deployment
- **Platform**: All
- **Reproduction / Trigger**: Set `PM2_EXEC_MODE=cluster` and `PM2_INSTANCES=max` or any value greater than 1, then start PM2 with the ecosystem config.
- **Evidence**: `parseInstances()` accepts `max` and positive integers; `execMode` accepts `cluster`; the app reuses the same `config.json` session and local runtime.
- **Root Cause**: Generic PM2 scaling flags are exposed for a stateful Telegram user session.
- **Impact**: Multiple processes can log in with the same StringSession, race SQLite/lowdb files, duplicate command handlers, trigger Telegram session invalidation, and corrupt runtime assumptions.
- **Suggested Fix**: Hard-code `exec_mode: "fork"` and `instances: 1` for the default app. If multi-account support is desired, require explicit separate `cwd`, `config.json`, assets, PM2 app names, and sessions.
- **Confidence**: 5
- **References**: Telegram user sessions are single-account state; data-layer risks in FND-026 and FND-027.

### FND-033: Update reloads runtime after npm install instead of restarting for native/module changes
- **Severity**: Medium
- **Category**: runtime
- **File(s)**: `src/plugin/update.ts:88-100`, `src/utils/npm_install.ts:56-65`
- **Component**: update plugin / deploy lifecycle
- **Platform**: All
- **Reproduction / Trigger**: `.update` pulls a dependency or native module change and runs `npm install`; the code then calls `reloadRuntime()` instead of replacing the Node process.
- **Evidence**: `update.ts` runs `npm_install_project_dependencies()` and then `reloadRuntime()`. Native modules and already-loaded module state are not guaranteed to be replaced by cache purge.
- **Root Cause**: Code update and dependency update are treated like plugin reload.
- **Impact**: Users can see "update complete" while the process still runs old native bindings, old transitive modules, or stale global side effects. ABI mismatches can surface later.
- **Suggested Fix**: After successful `npm install`, prefer full process restart under PM2 (`pm2 restart telebox`) or write an exit marker and `process.exit(0)` when supervised. For bare mode, tell the user to restart manually and do not claim runtime reload is enough.
- **Confidence**: 4
- **References**: Related PM2 dependency in FND-018.

## Build Notes

- `scripts/run-tsx.cjs:31-46` correctly registers `tsconfig-paths/register` for `@utils/*`.
- Node 22+ `--localstorage-file` is injected through `NODE_OPTIONS`; if PM2 or a host sets its own `NODE_OPTIONS`, the runner appends rather than overwrites.
- `src/plugin/update.ts` intentionally runs `npm install`; that command is a side effect and was not run during this audit.

