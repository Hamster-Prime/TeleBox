# 16 Config Secrets

## Findings Referenced

- FND-013: plaintext StringSession in `config.json`.
- FND-015: logs can expose secrets.
- FND-016: backup can include secrets.
- FND-035: prefix `.env` writer can emit invalid values.
- FND-038: `.env-sample` omits several variables.

## Environment Variables Observed

| Variable | File | Default / Behavior | Documented |
|---|---|---|---|
| `TB_PREFIX` | `pluginManager.ts`, `prefix.ts` | overrides command prefixes | yes |
| `TB_SUDO_PREFIX` | `sudo.ts` | sudo-only prefixes | yes |
| `TB_CMD_IGNORE_EDITED` | `pluginBase.ts` | defaults `"true"` | yes |
| `TB_LISTENER_HANDLE_EDITED` | `pluginManager.ts` | allow selected listeners on edits | yes |
| `TB_CONNECTION_RETRIES` | `runtimeManager.ts` | defaults 5 | no |
| `TB_LOCALSTORAGE_FILE` | `scripts/run-tsx.cjs` | Node localStorage path | no |
| `XDG_CACHE_HOME` | `scripts/run-tsx.cjs` | localStorage base | no |
| `PM2_LOG_DIR`, `PM2_EXEC_MODE`, `PM2_INSTANCES` | `ecosystem.config.cjs` | PM2 behavior | no |
| `LANG`, `LC_ALL` | `status.ts` | locale display | no |

