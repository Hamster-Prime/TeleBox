# 04 Plugin System

## Findings

### FND-022: User/default plugin name collisions run duplicate setup/listeners
- **Severity**: Medium
- **Category**: correctness
- **File(s)**: `src/utils/pluginManager.ts:162-201`, `src/utils/pluginManager.ts:514-553`
- **Component**: pluginManager
- **Platform**: All
- **Reproduction / Trigger**: Create `plugins/ping.ts` or another user plugin with the same command/name as an internal plugin, then reload.
- **Evidence**: `loadPluginsForRuntime()` calls `setPlugins(USER_PLUGIN_PATH)` then `setPlugins(DEFAUTL_PLUGIN_PATH)`. Commands in the `plugins` map are overwritten by later default plugins, but every valid plugin is pushed into `validPlugins`; setup, listener registration, and cron registration iterate `validPlugins`.
- **Root Cause**: Command map conflict handling and plugin lifecycle list are not kept consistent.
- **Impact**: Duplicate listeners/cron/setup side effects can run even when commands route to a different plugin; user override semantics are ambiguous.
- **Suggested Fix**: Decide precedence explicitly. If default wins, skip colliding user plugin entirely. If user wins, load defaults first. Maintain a plugin registry keyed by plugin name/path and reject duplicates with a clear error.
- **Confidence**: 5
- **References**: FND-024 for cron duplicate risk.

### FND-023: Alias lookup opens SQLite on every command parse
- **Severity**: Medium
- **Category**: perf
- **File(s)**: `src/utils/pluginManager.ts:216-244`, `src/utils/aliasDB.ts:13-18`, `src/utils/aliasDB.ts:98-103`
- **Component**: pluginManager / aliasDB
- **Platform**: All
- **Reproduction / Trigger**: Any outgoing/saved message that starts with a command prefix.
- **Evidence**: `getCommandFromMessage()` creates `new AliasDB()`, scans aliases, and closes the DB for each parsed command.
- **Root Cause**: Alias configuration is stored in SQLite but no in-process cache or prepared statement pool is used for hot command dispatch.
- **Impact**: High-frequency chats block the Node event loop on sync SQLite open/close and disk IO.
- **Suggested Fix**: Maintain an alias cache loaded on plugin reload and invalidated by `alias set/del`. Keep a single DB connection per runtime or use a small repository layer with WAL/read-only queries.
- **Confidence**: 5
- **References**: FND-027.

### FND-036: TPM CLI mode is broken outside runtime lifecycle
- **Severity**: Medium
- **Category**: dx
- **File(s)**: `src/plugin/tpm.ts:270-277`, `src/plugin/tpm.ts:1420-1436`
- **Component**: tpm plugin
- **Platform**: All
- **Reproduction / Trigger**: Run the CLI entry path (`node scripts/run-tsx.cjs ./src/plugin/tpm.ts install foo`).
- **Evidence**: `require.main === module` calls `installPlugin(args, fakeMsg)`. `installPlugin()` branches primarily around runtime message state, can call `loadPlugins()`, and its fallback delay uses `setTimeout` without a runtime lifecycle.
- **Root Cause**: Runtime command handler logic is reused as a CLI without a real `Api.Message`, client, generation context, or reload manager.
- **Impact**: CLI installation can fail unpredictably, skip the intended branch, or trigger runtime reload code without a runtime.
- **Suggested Fix**: Split TPM core operations from UI/runtime handlers. Provide a CLI-only function that fetches, validates paths, writes files, and exits without calling `loadPlugins()`.
- **Confidence**: 4
- **References**: FND-009, FND-011.

## Additional Notes

- `purgeModuleCache()` avoids project-external and `node_modules` modules through `shouldPurgeCache()`, which is a reasonable default. Symlinked project dependencies should be tested separately.
- `pluginLoadDepth` prevents nested reload while plugins are being required. This guards top-level `loadPlugins()` calls but does not distinguish generations; current behavior is acceptable with a warning.
- `dealCommandPluginWithMessage()` wraps handler errors and safely catches error-message edits.

