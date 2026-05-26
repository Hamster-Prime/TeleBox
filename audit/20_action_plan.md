# 20 Action Plan

## P0 - 24h

| Findings | Work | Estimate | Breaking / API Impact |
|---|---|---:|---|
| FND-006 | Replace `ping` shell execution with `execFile`/argument arrays and strict hostname validation. | 4h | No plugin API break |
| FND-008 | Add owner-only/dangerous command metadata and block sudo/sure from `.exec`, `.tpm install/update`, `.update -f`, `.bf all`, `.sendlog`, `.prefix` by default. | 8h | Plugin metadata addition |
| FND-009, FND-010 | Add path containment/sanitizer for TPM remote keys and uploaded filenames; quarantine uploaded plugin validation. | 8h | May reject previously invalid plugin names |
| FND-013 | Harden `config.json` permissions, warn on insecure mode, document session revocation. | 3h | No API break |
| FND-014 | Redact access hashes and escape raw JSON in debug output; default raw dumps to Saved Messages. | 4h | Debug command behavior change |

## P1 - 1 Week

| Findings | Work | Estimate | Breaking / API Impact |
|---|---|---:|---|
| FND-001, FND-002 | Restore committed lockfile and add `typecheck`/`audit` scripts using reproducible install. | 4h | Deploy flow changes to `npm ci` |
| FND-004 | Force PM2 single-instance defaults and document multi-account isolation. | 2h | PM2 env behavior restricted |
| FND-007, FND-033 | Convert update git commands to `execFile`; restart process after dependency changes. | 6h | Update behavior changes |
| FND-011, FND-012 | Add signed/hashed remote plugin index or host allowlist plus explicit trust warnings. | 12h | TPM install UX changes |
| FND-015, FND-016 | Add log redaction, sendlog confirmation, backup allowlist/secret exclusion/size guard. | 10h | Backup/log command output changes |
| FND-018, FND-019, FND-021 | Fix memory guard supervisor detection, terminal drain state, and destroy timeout recovery. | 14h | Runtime behavior change |
| FND-022, FND-024, FND-026 | Clarify plugin precedence, drain cron executions, serialize lowdb writes. | 12h | Plugin conflict behavior change |
| FND-028 | Make unhandled rejection fatal with graceful shutdown in production. | 4h | Process lifecycle change |

## P2 - 1 Month

| Findings | Work | Estimate | Breaking / API Impact |
|---|---|---:|---|
| FND-003 | Remove unused deps or move them to optional plugin peer dependencies. | 8h | Remote plugin dependency docs |
| FND-005, FND-037 | Add platform capability checks and Windows/macOS docs/smoke tests. | 12h | None |
| FND-017 | Cap repeat/count and add flood-wait-aware throttling. | 4h | Command behavior change |
| FND-020 | Rename/fix generation cancellation counters. | 4h | Status diagnostics wording |
| FND-023, FND-027 | Add alias cache and DB singletons/WAL/busy timeout. | 8h | Internal only |
| FND-029, FND-030 | Split tsconfigs and reduce `any` hotspots. | 16h | Types tighten for plugin authors |
| FND-032 | Make monkey patches idempotent/collision-safe and remove dead hook. | 6h | Internal only |
| FND-034, FND-035, FND-036 | Escape exec output, robust dotenv writer, split TPM CLI core. | 10h | CLI/formatting behavior changes |
| FND-038 | Regenerate docs, env sample, and command lists from source. | 8h | Docs only |

## P3 - Iterative

| Findings | Work | Estimate | Breaking / API Impact |
|---|---|---:|---|
| FND-025 | Upstream/public API for teleproto channel-state reset or version-gated adapter tests. | 16h | Depends on teleproto |
| FND-031 | Make path helpers recursive and validate names at call sites. | 2h | Internal only |

## Coverage Check

All finding IDs FND-001 through FND-038 are assigned to P0, P1, P2, or P3 above.

