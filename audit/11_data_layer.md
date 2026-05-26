# 11 Data Layer

## Findings

### FND-026: lowdb writes can lose updates under concurrent command/cron writes
- **Severity**: Medium
- **Category**: concurrency
- **File(s)**: `src/plugin/reload.ts:71-82`, `src/plugin/reload.ts:254-356`, `src/plugin/status.ts:212-220`, `src/plugin/tpm.ts:216-219`, `src/plugin/bf.ts:11-12`
- **Component**: lowdb-backed configs
- **Platform**: All
- **Reproduction / Trigger**: Run memory monitor cron while a user changes memory settings, status template, TPM records, or backup targets.
- **Evidence**: Each feature creates its own `JSONFilePreset`/`Low` instance and calls `db.write()` without an app-level mutex.
- **Root Cause**: JSON file storage is used as if it provides transactional concurrent writes.
- **Impact**: Last writer wins; settings or plugin records can be silently lost.
- **Suggested Fix**: Centralize lowdb access per file and serialize read-modify-write with a mutex. For high-value state, migrate to SQLite with transactions.
- **Confidence**: 4
- **References**: FND-024 in-flight cron risk.

### FND-027: SQLite DBs use sync open/close per operation and no WAL
- **Severity**: Medium
- **Category**: perf
- **File(s)**: `src/utils/aliasDB.ts:13-18`, `src/utils/sudoDB.ts:18-23`, `src/utils/sureDB.ts:25-30`, `src/utils/sendLogDB.ts:8-12`
- **Component**: better-sqlite3 wrappers
- **Platform**: All
- **Reproduction / Trigger**: High-frequency command parsing, sudo/sure listener checks, or repeated sendlog/alias operations.
- **Evidence**: Every wrapper constructor opens `new Database(dbPath)` and initializes tables; callers frequently create and close DBs. No `PRAGMA journal_mode=WAL` or `busy_timeout` appears.
- **Root Cause**: Synchronous SQLite API is used in hot paths without connection reuse or pragmas.
- **Impact**: Event-loop stalls, extra disk churn, and cross-process locking failures if PM2 multi-instance is enabled.
- **Suggested Fix**: Use per-runtime singleton DB handles, prepared statements, WAL, `busy_timeout`, and clean shutdown disposal. Keep command hot paths backed by in-memory caches.
- **Confidence**: 5
- **References**: FND-004, FND-023.

## Database Inventory

| Store | File | Use | Risk |
|---|---|---|---|
| Alias SQLite | `assets/alias/alias.db` | command aliases | hot-path open/close |
| Sudo SQLite | `assets/sudo/sudo.db` | delegated users/chats | sync listener reads |
| Sure SQLite | `assets/sure/sure.db` | user/chat/message allowlists | sync listener reads |
| SendLog SQLite | `assets/sendlog/sendlog.db` | log destination | string-only target |
| TPM lowdb | `assets/tpm/plugins.json` | remote plugin records | lost updates |
| Reload lowdb | `assets/reload/config.json` | memory guard | cron/command races |
| Status lowdb | `assets/status/config.json` | template | command write races |
| Backup lowdb | `assets/bf/config.json` | destinations | command write races |

