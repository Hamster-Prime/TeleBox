# 14 Concurrency

## Cross-Referenced Findings

- FND-004: multi-instance PM2 allows cross-process races.
- FND-019: timed-out generations are not terminally disposed.
- FND-021: failed destroy can leave stale runtime handles.
- FND-024: cron in-flight tasks are not awaited by cron manager.
- FND-026: lowdb write races.
- FND-027: SQLite locking/perf risks without WAL.
- FND-028: unhandled rejection policy keeps process alive after async failures.

## Race Assessment

| Area | Trigger | Assessment |
|---|---|---|
| `reloadRuntime()` x N | concurrent reload commands | `transitionPromise` serializes callers, mostly OK. |
| `shutdownRuntime()` during reload | process signal/exit while reload runs | waits `transitionPromise`, then disposes current runtime; acceptable but destroy timeout risk remains. |
| Sudo/sure resend | delegated message sends then direct handler call | waits `sendMessage`; avoids event queue dependency, but duplicates are still possible if root self-message event also arrives. |
| Memory monitor vs user config | cron writes same lowdb file as commands | real lost-update risk; FND-026. |
| Cron reload | old cron execution overlaps new generation | real overlap risk; FND-024. |
| PM2 cluster | multiple processes share session/db/files | not safe; FND-004. |

