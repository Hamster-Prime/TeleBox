# 07 Plugin By Plugin

Each built-in plugin was reviewed. Findings are globally numbered in their topic reports; this file keeps per-plugin traceability.

## `src/plugin/alias.ts`

- Finding refs: FND-023.
- `setAlias()` writes SQLite then calls `loadPlugins()` for every alias change (`alias.ts:66-79`), so a small metadata edit triggers a full runtime reload.
- Split logic depends on `getPluginEntry(tokens[i])`; aliases that overlap original command names are hard to reason about.
- DB handles are closed in normal paths; no direct injection risk found because values use prepared statements.

## `src/plugin/bf.ts`

- Finding refs: FND-016, FND-005.
- `bf all` archives the project directory from its parent and uploads to Telegram (`bf.ts:474-585`).
- `restoreBackup()` copies current dirs, deletes originals, then restores (`bf.ts:285-310`); if restore fails mid-way, rollback is manual.
- Uses `spawn()` argument arrays, so reviewed command-injection surface is OK; platform dependency on `tar`/`gzip` remains.

## `src/plugin/debug.ts`

- Finding refs: FND-014.
- `.entity` and `.msg` raw dump full TL objects to logs and chat (`debug.ts:137-222`).
- Long dump filenames are derived from entity/message IDs (`debug.ts:167-172`, `debug.ts:210-215`); low risk, but still should avoid raw `entity?.id` if shapes vary.
- `echo` handles common media/text paths but does not support every message type; expected for debug tooling.

## `src/plugin/exec.ts`

- Finding refs: FND-008, FND-034.
- Shell execution is intentional owner functionality, but sudo can reach it.
- Child process and status interval are lifecycle-tracked (`exec.ts:37-61`, `exec.ts:80-90`), which is good.
- Markdown output is unescaped and truncation can break formatting.

## `src/plugin/help.ts`

- Finding refs: FND-023.
- Uses `AliasDB` during help formatting and closes it; acceptable for interactive help, but same DB pattern is hot in command parsing.
- Entity limit planner hard-codes 100 entities (`help.ts:15-25`); keep tested against Telegram parser limits.
- Plugin descriptions are inserted as trusted HTML (`help.ts:252-267`); this is acceptable only if installed plugins are trusted (FND-012).

## `src/plugin/loglevel.ts`

- Finding refs: FND-015.
- `client.setLogLevel` failure is swallowed (`loglevel.ts:80-88`), yet success text says GramJS level synchronized.
- Logger config uses lowdb; concurrent write risk is low but same class of JSON store issue as FND-026.
- User input level parsing is bounded to known strings.

## `src/plugin/ping.ts`

- Finding refs: FND-006, FND-005.
- `systemPing()` is shell-injectable through target.
- `ping all` serially shells out to `ping | awk` for five DCs (`ping.ts:206-245`), platform-specific and slow.
- TCP/HTTP fallback probes arbitrary hosts and ports 80/443; acceptable only for owner use, but sudo delegation expands it.

## `src/plugin/prefix.ts`

- Finding refs: FND-008, FND-035.
- Sudo can change prefixes because there is no owner-only command metadata.
- `.env` writer hand-rolls quoting.
- It calls `setPrefixes()` then `loadPlugins()`; behavior is live but expensive.

## `src/plugin/re.ts`

- Finding refs: FND-017.
- `count` and `repeat` are unbounded (`re.ts:17-20`).
- Copy fallback reuses `message.entities` as formatting entities (`re.ts:117-132`); this preserves formatting but should be bounded and error-tested.
- `topMsgId` from source topic may not make sense when copying to a different chat.

## `src/plugin/reload.ts`

- Finding refs: FND-018, FND-033.
- Memory guard assumes a process supervisor for `process.exit(0)`.
- `pmr` assumes PM2 is installed and app name is `telebox` (`reload.ts:469-477`).
- Startup import side effect reads `temp/exit/msg.json` and edits a Telegram message (`reload.ts:186-211`); move to an explicit startup hook.

## `src/plugin/sendLog.ts`

- Finding refs: FND-015.
- Sends full log files to a stored target up to 50MB each (`sendLog.ts:137-221`).
- `sendlog clean` deletes discovered log files without confirmation (`sendLog.ts:85-134`).
- Target is stored as a string and not resolved/previewed before sending.

## `src/plugin/status.ts`

- Finding refs: FND-026, FND-037.
- lowdb template writes can race other status/template commands.
- Shell commands are fixed strings, so command injection was not found.
- Windows path relies on deprecated `wmic`, while Linux/macOS shell probes are platform-specific.

## `src/plugin/sudo.ts`

- Finding refs: FND-008, FND-027.
- Delegated users can invoke every command.
- Sudo user/chat cache is 10s and populated through repeated sync DB open/close.
- Re-sending delegated messages as the main account is clear, but can duplicate with normal self-message event handling.

## `src/plugin/sure.ts`

- Finding refs: FND-008, FND-027.
- Sure is narrower than sudo due message allowlists, but redirected messages can still target dangerous commands.
- `_command:` suffix matching correctly requires empty suffix or a leading space (`sure.ts:361-369`).
- `formattingEntities: message.entities` is a bug because `message` is a string (`sure.ts:375-383`); formatting is lost.

## `src/plugin/tpm.ts`

- Finding refs: FND-009, FND-010, FND-011, FND-012, FND-036.
- Remote index keys and Telegram filenames are unsafe path components.
- Remote URL fetching lacks host/integrity/size constraints.
- Uploaded plugin validation executes code with `require(filePath)`.

## `src/plugin/update.ts`

- Finding refs: FND-007, FND-033.
- Uses shell-string git commands with remote/ref interpolation.
- Runs `npm install` and then only reloads runtime.
- Error reporting includes failed command/stderr in chat; useful for owner, but avoid delegated exposure.

