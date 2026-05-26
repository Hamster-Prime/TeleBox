# TeleBox Audit Inventory

Evidence collected on 2026-05-25 from `/home/sanite/DEV/TeleBox`.

## Commands Run

- `git status --short`: only `plan.md` was untracked before audit files were created.
- `wc -l ...`: total inspected text/source lines: 17875.
- `npm ls --all`: failed with `ELSPROBLEMS`; every declared dependency is `UNMET DEPENDENCY`.
- `npm outdated`: all dependencies show `Current=MISSING`; wanted/latest data was still returned.
- `npm audit --omit=dev`: failed with `ENOLOCK` because `package-lock.json` is absent.
- `npx --no-install tsc --noEmit`: failed because local `typescript` is not installed.
- `find . -maxdepth 3 -type f -name '*.yml' -o -name '*.yaml'`: no CI config found.
- `test -d tests`: no tests directory.
- `git blame -L 21,38 -- src/utils/channelGapBreaker.ts`: threshold changed in `c43b7385`; breaker introduced in `ac7c1842`.
- `git blame -L 167,246 -- src/utils/channelGapBreaker.ts`: teleproto 1.225 private layout support added in `c64f9f05`.

## Source File LOC

| File | LOC | Notes |
|---|---:|---|
| `src/index.ts` | 26 | Entry, global process handlers, imports monkey patch. |
| `src/hook/listen.ts` | 40 | Dead `patchMsgEdit` hook; imported but commented out. |
| `src/hook/patches/telegram.patch.ts` | 62 | Monkey patches HTML parser and `Api.Message` methods. |
| `src/hook/types/telegram.d.ts` | 38 | Declaration merge for patched methods. |
| `src/plugin/alias.ts` | 144 | SQLite alias management, reloads runtime after edits. |
| `src/plugin/bf.ts` | 720 | Backup/restore, `tar`/`gzip` child processes. |
| `src/plugin/debug.ts` | 754 | Entity/message debug output and file export. |
| `src/plugin/exec.ts` | 169 | Shell command execution plugin. |
| `src/plugin/help.ts` | 294 | Command help rendering and alias lookup. |
| `src/plugin/loglevel.ts` | 98 | Logger level control. |
| `src/plugin/ping.ts` | 469 | Network/ICMP/TCP/HTTP ping. |
| `src/plugin/prefix.ts` | 117 | Runtime prefix update and `.env` persistence. |
| `src/plugin/re.ts` | 143 | Message repeat/forward/copy. |
| `src/plugin/reload.ts` | 742 | Runtime reload, PM2 restart, memory guard. |
| `src/plugin/sendLog.ts` | 246 | Sends and deletes log files. |
| `src/plugin/status.ts` | 972 | System status and template storage. |
| `src/plugin/sudo.ts` | 282 | Sudo delegation. |
| `src/plugin/sure.ts` | 405 | Whitelisted delegation/redirection. |
| `src/plugin/tpm.ts` | 1436 | Remote/local plugin install/update/uninstall. |
| `src/plugin/update.ts` | 164 | Git update + npm install + runtime reload. |
| `src/utils/aliasDB.ts` | 106 | `better-sqlite3` alias DB. |
| `src/utils/apiConfig.ts` | 100 | `config.json` and StringSession persistence. |
| `src/utils/authGuards.ts` | 28 | Telegram auth error guards. |
| `src/utils/banUtils.ts` | 285 | Telegram moderation helpers, not imported by built-in plugins. |
| `src/utils/channelGapBreaker.ts` | 273 | Teleproto private state breaker. |
| `src/utils/conversation.ts` | 275 | Abortable conversation helper. |
| `src/utils/cronManager.ts` | 105 | Cron registration/disposal. |
| `src/utils/entityHelpers.ts` | 362 | Entity resolution/forward retry helpers. |
| `src/utils/generationContext.ts` | 508 | Runtime lifecycle resource tracker. |
| `src/utils/globalClient.ts` | 9 | Re-exports runtime client/generation APIs. |
| `src/utils/logger.ts` | 389 | Console override and lowdb log level. |
| `src/utils/loginManager.ts` | 262 | QR/phone login, StringSession save. |
| `src/utils/npm_install.ts` | 66 | `npm install` wrapper. |
| `src/utils/pathHelpers.ts` | 37 | Asset/temp directory creation. |
| `src/utils/pluginBase.ts` | 99 | Plugin contract and validator. |
| `src/utils/pluginManager.ts` | 596 | Dynamic require, command dispatch, reload bridge. |
| `src/utils/runtimeManager.ts` | 368 | Runtime start/reload/shutdown. |
| `src/utils/safeGetMessages.ts` | 51 | Telegram getMessages guard. |
| `src/utils/sendLogDB.ts` | 47 | `better-sqlite3` sendlog target DB. |
| `src/utils/sudoDB.ts` | 136 | `better-sqlite3` sudo DB. |
| `src/utils/sureDB.ts` | 192 | `better-sqlite3` sure DB. |
| `src/utils/teleboxInfoHelper.ts` | 49 | Version/app name helpers. |
| `src/utils/telegramFormatter.ts` | 583 | Formatter helper; no built-in import found. |
| `src/utils/telegraphFormatter.ts` | 761 | Formatter helper; no built-in import found. |
| `src/utils/tlRevive.ts` | 88 | TL JSON revive helper. |
| `scripts/run-tsx.cjs` | 48 | Node/tsx runner and localStorage flag. |
| `ecosystem.config.cjs` | 101 | PM2 app config. |

## Dependency Usage Snapshot

Exact import/reference scan over `src`, `plugins`, `scripts`, `ecosystem.config.cjs`, and docs:

| Dependency | Declared | Current Evidence |
|---|---:|---|
| `teleproto` | `^1.223.1` | Core runtime/plugins/hooks import it. |
| `tsx`, `tsconfig-paths` | `^4.20.4`, `^4.2.0` | Used by `scripts/run-tsx.cjs`. |
| `dotenv` | `^17.2.2` | Used by `src/index.ts`, `ecosystem.config.cjs`. |
| `better-sqlite3` | `^12.2.0` | Used by alias/sudo/sure/sendlog DBs. |
| `lowdb` | `^7.0.1` | Used by logger, reload, status, tpm, bf. |
| `axios` | `^1.11.0` | Used by `src/plugin/tpm.ts`. |
| `cron` | `^4.3.3` | Used by `src/utils/cronManager.ts`. |
| `dayjs` | `^1.11.18` | Used by `src/utils/logger.ts`. |
| `qrcode-terminal` | `^0.12.0` | Used by `src/utils/loginManager.ts`. |
| `@modelcontextprotocol/sdk`, `archiver`, `canvas`, `cheerio`, `js-yaml`, `node-schedule`, `p-limit`, `sharp`, `ssh2` | various | No source import match. |
| `@vitalets/google-translate-api`, `modern-gif`, `opencc-js`, `lodash` | various | Docs mention them; no built-in source import match. |
| `@types/*` packages | various | Runtime dependencies, but only type support. No installed state. |

## Top-Level Config Notes

- `package.json` has `"type": "commonjs"` while several declared packages are ESM-only or effectively unused by built-in code.
- `package-lock.json` is explicitly ignored by `.gitignore:17` and is absent.
- `tsconfig.json` has `"strict": true`, `"allowJs": true`, `"skipLibCheck": true`, path alias `@utils/*`, and includes both `src/**/*` and `plugins/**/*`.
- `scripts/run-tsx.cjs` injects `--localstorage-file` via `NODE_OPTIONS` on Node 22+ and relies on `tsx` plus `tsconfig-paths/register`.
- `ecosystem.config.cjs` allows `PM2_EXEC_MODE=cluster` and arbitrary positive `PM2_INSTANCES`, including `max`.
- `.env-sample` documents `TB_PREFIX`, `TB_SUDO_PREFIX`, `TB_CMD_IGNORE_EDITED`, and `TB_LISTENER_HANDLE_EDITED`, but omits `TB_CONNECTION_RETRIES`, `TB_LOCALSTORAGE_FILE`, `PM2_*`, `XDG_CACHE_HOME`, `LANG`, and `LC_ALL`.

