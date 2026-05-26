# 02 Security Findings

This section covers Phase B. Every specified command-exec, path, dynamic-require, remote-fetch, credential, authorization, HTML, and DoS item is either a finding or an explicit OK note.

## Findings

### FND-006: `ping` target reaches `exec()` shell interpolation
- **Severity**: Critical
- **Category**: security
- **File(s)**: `src/plugin/ping.ts:168-169`, `src/plugin/ping.ts:251-269`, `src/plugin/ping.ts:351-367`
- **Component**: ping plugin
- **Platform**: Linux | macOS
- **Reproduction / Trigger**: Send `.ping 127.0.0.1;id` or `.ping example.com;uname${IFS}-a`. `parseTarget()` treats non-IP input as a domain, then `systemPing()` builds `ping -c 3 -W 5 ${target}` for the shell.
- **Evidence**: `execAsync(pingCmd)` receives a string built from user-controlled `target`; the domain branch returns raw input without hostname validation or argument array escaping.
- **Root Cause**: Shell command construction is used for user-supplied network targets.
- **Impact**: Any authorized command invoker, including sudo users via FND-008, can execute arbitrary host shell commands.
- **Suggested Fix**: Replace `exec()` with `execFile("ping", args)` or skip ICMP shell entirely. Validate hostnames with a strict RFC-compatible allowlist and reject metacharacters. Use platform-specific argument arrays: Linux/macOS `["-c", String(count), "-W", "5", target]`, Windows `["-n", String(count), target]`.
- **Confidence**: 5
- **References**: Node `child_process.exec` shell semantics.

### FND-007: Update plugin interpolates git names into shell commands and exposes forced reset
- **Severity**: High
- **Category**: security
- **File(s)**: `src/plugin/update.ts:15-36`, `src/plugin/update.ts:73-90`, `src/plugin/update.ts:153-160`
- **Component**: update plugin
- **Platform**: All
- **Reproduction / Trigger**: A malicious local `.git/config` remote/ref name is returned by `git remote`/`git branch -r`; `.update` builds `git reset --hard ${fullBranch}` and `git pull ${remote} ${branch} --no-rebase` as shell strings. Any user able to trigger `.update -f` also discards local changes.
- **Evidence**: `execAsync` is `promisify(exec)`; `remote` and `branch` originate from git command output, not a hard-coded allowlist.
- **Root Cause**: Shell string construction is used where argument arrays are sufficient; high-impact update operations are command-accessible.
- **Impact**: Local repository metadata tampering can become shell execution, and delegated users can destructive-reset the working tree.
- **Suggested Fix**: Use `execFile("git", ["pull", remote, branch, "--no-rebase"])` and validate `remote`/`branch` with `git check-ref-format` plus a conservative allowlist. Require explicit owner-only confirmation for `-f`, and block it from sudo/sure delegated invocations.
- **Confidence**: 3
- **References**: FND-008 for delegated execution path.

### FND-008: Sudo delegation can invoke every command, including `.exec`, `.tpm`, `.update`, and `.prefix`
- **Severity**: Critical
- **Category**: security
- **File(s)**: `src/plugin/sudo.ts:252-278`, `src/plugin/sure.ts:349-391`, `src/utils/pluginManager.ts:328-339`, `src/plugin/exec.ts:161-164`
- **Component**: sudo / sure / command dispatcher
- **Platform**: All
- **Reproduction / Trigger**: Add a sudo user; that user sends an allowed-prefix message such as `.exec id`, `.tpm i all`, `.update -f`, or `.prefix set x`.
- **Evidence**: `sudo.ts` verifies user/chat allowlists, re-sends the original message with the main account, then calls `dealCommandPluginWithMessage()`. There is no denylist, risk tier, owner-only flag, or confirmation gate.
- **Root Cause**: Delegated command authority is equivalent to owner authority.
- **Impact**: A sudo user can run shell commands, install arbitrary plugins, reset/pull code, change command prefixes, send logs/backups, and mutate config as the main Telegram account.
- **Suggested Fix**: Add per-command capability metadata (`dangerous`, `ownerOnly`, `requiresConfirmation`) in `Plugin`. Deny dangerous commands from sudo/sure by default. Provide explicit grants like `sudo allow ping status` and never grant `.exec`, `.tpm install`, `.update -f`, `.sendlog`, or `.bf all` unless the owner opts in with clear warnings.
- **Confidence**: 5
- **References**: FND-006, FND-009, FND-012, FND-016.

### FND-009: TPM remote plugin keys can path-traverse outside `plugins/`
- **Severity**: Critical
- **Category**: security
- **File(s)**: `src/plugin/tpm.ts:308-324`, `src/plugin/tpm.ts:361-411`, `src/plugin/tpm.ts:520-558`
- **Component**: tpm plugin
- **Platform**: All
- **Reproduction / Trigger**: A remote plugins index contains a key like `../../temp/owned`; `.tpm i ../../temp/owned`, `.tpm i all`, or update-all writes through `path.join(PLUGIN_PATH, `${plugin}.ts`)`.
- **Evidence**: Plugin names come from `Object.keys(res.data)` or user args matched against that index; no `path.basename`, regex, or `path.resolve(...).startsWith(PLUGIN_PATH)` guard exists before `fs.writeFileSync`.
- **Root Cause**: Remote metadata is trusted as a filesystem path component.
- **Impact**: A compromised plugin index can overwrite arbitrary `.ts`-suffixed files writable by the process, including source files, temp startup markers, or user plugins outside the intended directory.
- **Suggested Fix**: Validate plugin IDs with `^[a-z0-9_-]{1,64}$`, reject separators/dots, and after `path.resolve` enforce `resolved.startsWith(path.resolve(PLUGIN_PATH) + path.sep)`. Store remote display names separately from filesystem names.
- **Confidence**: 5
- **References**: Path traversal pattern also appears in FND-010.

### FND-010: Uploaded plugin filenames can path-traverse and are executed during validation
- **Severity**: Critical
- **Category**: security
- **File(s)**: `src/plugin/tpm.ts:222-225`, `src/plugin/tpm.ts:625-645`
- **Component**: tpm plugin upload install
- **Platform**: All
- **Reproduction / Trigger**: Reply to a Telegram document whose `fileName` is `../../src/plugin/prefix.ts` or whose first document attribute lacks `fileName`; then run `.tpm i`.
- **Evidence**: `getMediaFileName()` returns `metadata.document.attributes[0].fileName`; install path is `path.join(PLUGIN_PATH, fileName)`; validation uses `require(filePath)`, which executes uploaded code before deciding validity.
- **Root Cause**: Telegram document metadata is trusted for filesystem path and code execution.
- **Impact**: Arbitrary file overwrite and immediate host code execution by any invoker allowed to install a plugin.
- **Suggested Fix**: Extract filename only from a verified `DocumentAttributeFilename`, sanitize with `path.basename`, require `^[a-z0-9_-]+\.ts$`, resolve-and-check directory containment, write to a quarantine temp file, statically inspect exported shape where possible, and move into `plugins/` only after user confirmation. Do not `require()` untrusted code just to validate it.
- **Confidence**: 5
- **References**: FND-012.

### FND-011: TPM downloads arbitrary-host plugin URLs without integrity or size limits
- **Severity**: High
- **Category**: security
- **File(s)**: `src/plugin/tpm.ts:227-245`, `src/plugin/tpm.ts:279-294`, `src/plugin/tpm.ts:316-324`, `src/plugin/tpm.ts:401-411`
- **Component**: tpm plugin remote fetch
- **Platform**: All
- **Reproduction / Trigger**: The remote index returns `url: "http://169.254.169.254/..."`, an internal host, a huge file, or mutable non-GitHub content; `.tpm i <name>` fetches and writes it.
- **Evidence**: `normalizeGithubUrl()` rewrites GitHub blob URLs but returns all other URLs unchanged. `axios.get` sets timeout/headers but no host allowlist, checksum, signature, `maxContentLength`, or `maxBodyLength`.
- **Root Cause**: Remote index metadata is treated as trusted code distribution.
- **Impact**: Supply-chain compromise, internal network probing from the host, disk exhaustion, and silent plugin replacement.
- **Suggested Fix**: Restrict plugin URLs to `raw.githubusercontent.com/TeleBoxDev/TeleBox_Plugins/...` or use a signed index with sha256 per file. Set strict `maxContentLength`/`maxBodyLength`, require HTTPS, reject redirects to other hosts, and display diff/hash before install/update.
- **Confidence**: 5
- **References**: FND-009 and FND-012.

### FND-012: Plugin installation is full host/account code execution but UX/docs understate it
- **Severity**: High
- **Category**: security
- **File(s)**: `src/plugin/tpm.ts:343-355`, `src/plugin/tpm.ts:641-678`, `src/utils/pluginManager.ts:150-160`, `README.md:184-190`
- **Component**: plugin system / tpm
- **Platform**: All
- **Reproduction / Trigger**: Install any local/remote plugin; the plugin is dynamically required and can import Node modules, read `config.json`, send Telegram messages, or spawn processes.
- **Evidence**: `dynamicRequireWithDeps()` calls `require(normalized)`; uploaded plugin validation also calls `require(filePath)`. README describes an online plugin store but does not make "install plugin = trust arbitrary host code and Telegram account control" a first-class warning.
- **Root Cause**: The plugin architecture is intentionally privileged, but the trust boundary is not explicit in commands/docs.
- **Impact**: Users may install unreviewed remote plugins that fully compromise the host and Telegram account.
- **Suggested Fix**: Add hard warnings to `.tpm i`, README, INSTALL, and plugin docs. Show plugin source URL/hash, require confirmation for remote installs, provide a local review mode, and consider a restricted plugin API for non-trusted plugins.
- **Confidence**: 5
- **References**: FND-008, FND-009, FND-010, FND-011.

### FND-013: `config.json` stores Telegram StringSession plaintext without chmod/secret-store controls
- **Severity**: Critical
- **Category**: security
- **File(s)**: `src/utils/apiConfig.ts:13-34`, `src/utils/loginManager.ts:130-133`, `.gitignore:8`
- **Component**: config / secrets
- **Platform**: All
- **Reproduction / Trigger**: First login writes `session` to `config.json`.
- **Evidence**: `storeStringSession()` assigns `config.session` and `saveConfig()` uses `fs.writeFileSync(..., "utf-8")` without mode or permission correction. `.gitignore` hides the file from git but not from local users, backups, logs, or plugin code.
- **Root Cause**: Secret storage is plain JSON in the project directory.
- **Impact**: Leaking `config.json` leaks the full Telegram auth key; an attacker can take over the user session until revoked.
- **Suggested Fix**: Write with `mode: 0o600`, chmod existing files to `0600`, warn if permissions are broader, support `TB_SESSION`/secret manager injection, and document revocation steps. Avoid including `config.json` in backups/logs.
- **Confidence**: 5
- **References**: Telethon/GramJS StringSession semantics: session string includes auth material.

### FND-014: Debug commands leak TL internals/access hashes and send unescaped JSON as HTML
- **Severity**: High
- **Category**: security
- **File(s)**: `src/plugin/debug.ts:137-179`, `src/plugin/debug.ts:181-222`
- **Component**: debug plugin
- **Platform**: All
- **Reproduction / Trigger**: Run `.entity` or `.msg` in a group or target chat.
- **Evidence**: The plugin `JSON.stringify`s full entity/message objects, logs them, and sends them in `<blockquote expandable>${txt}</blockquote>` with `parseMode: "html"` without escaping.
- **Root Cause**: Diagnostic commands expose raw Telegram TL objects directly to chat/log output.
- **Impact**: `accessHash`, peer metadata, forwarded-message details, and other private fields can be posted to all chat participants or stored in logs; unescaped `<`/`&` can break HTML parsing.
- **Suggested Fix**: Redact `accessHash`, `phone`, auth/session-like fields, and media file references. Escape JSON before HTML, default output to Saved Messages, and require an explicit `--unsafe` flag for raw dumps.
- **Confidence**: 5
- **References**: FND-015 for log exfiltration path.

### FND-015: Logger and sendlog can expose secrets through full dumps and log-file transfer
- **Severity**: High
- **Category**: security
- **File(s)**: `src/utils/logger.ts:104-110`, `src/plugin/sendLog.ts:17-32`, `src/plugin/sendLog.ts:137-221`
- **Component**: logger / sendlog
- **Platform**: All
- **Reproduction / Trigger**: Any code logs an object containing session/token/access hash; `.sendlog` sends full PM2/project/system logs to configured target.
- **Evidence**: logger uses `util.inspect(arg, { colors: true, depth: null, breakLength: Infinity })`; sendlog scans `~/.pm2/logs`, `./logs`, and `/var/log/telebox`, then sends files up to 50MB.
- **Root Cause**: No redaction policy exists for logs, and log transfer has no content scan/confirmation.
- **Impact**: Session strings, access hashes, API credentials, filesystem paths, and command outputs can be sent to the wrong chat or retained in Telegram.
- **Suggested Fix**: Add structured redaction for keys matching `session`, `api_hash`, `auth`, `token`, `accessHash`, `password`. Make sendlog preview metadata and require confirmation, default to Saved Messages, and redact or bundle only recent tail output.
- **Confidence**: 5
- **References**: FND-013, FND-014.

### FND-016: `bf all` can exfiltrate almost the whole program directory without size guard
- **Severity**: High
- **Category**: security
- **File(s)**: `src/plugin/bf.ts:474-523`, `src/plugin/bf.ts:543-585`
- **Component**: backup plugin
- **Platform**: All
- **Reproduction / Trigger**: Run `.bf all`; the plugin tars the current program directory from its parent and uploads it to configured destinations or `me`.
- **Evidence**: Excludes only `node_modules`, `.git`, `my_session`, `temp`, and `logs`; it does not exclude `config.json`, `.env`, `assets`, `plugins`, `package-lock` if restored, or arbitrary user files in the repo.
- **Root Cause**: Full backup is implemented as broad archive-and-send rather than an allowlisted data backup.
- **Impact**: Telegram receives sensitive config/session/proxy/plugin data; large files can fill temp disk and fail upload after expensive compression.
- **Suggested Fix**: Default to allowlisting `plugins/` and selected `assets/` only. Require `--include-config` for secrets, redact or exclude `config.json` and `.env`, calculate size before upload, and impose timeout/size limits.
- **Confidence**: 5
- **References**: FND-013, FND-026.

### FND-017: `re` has unbounded message count/repeat loops
- **Severity**: Medium
- **Category**: security
- **File(s)**: `src/plugin/re.ts:17-20`, `src/plugin/re.ts:33-80`
- **Component**: re plugin
- **Platform**: All
- **Reproduction / Trigger**: Run `.re 1000 1000` while replying to a message.
- **Evidence**: `count` and `repeat` are parsed with `parseInt` and no upper bounds, then nested loops forward or copy messages.
- **Root Cause**: User-controlled amplification parameters are not capped.
- **Impact**: Telegram flood waits, account restrictions, high CPU/network use, and noisy spam in chats.
- **Suggested Fix**: Cap `count` and `repeat` conservatively, require confirmation above small thresholds, and use lifecycle-aware cancellation/backoff for flood waits.
- **Confidence**: 5
- **References**: FND-008 expands trigger scope to sudo users.

### FND-034: `.exec` uses Markdown without escaping command/output
- **Severity**: Medium
- **Category**: security
- **File(s)**: `src/plugin/exec.ts:70-75`, `src/plugin/exec.ts:99-110`, `src/plugin/exec.ts:118-125`
- **Component**: exec plugin
- **Platform**: All
- **Reproduction / Trigger**: Run a shell command containing backticks, underscores, malformed links, or output ending inside a Markdown fence-like fragment.
- **Evidence**: `shellCommand`, `stdout`, `stderr`, and `String(error)` are interpolated into Markdown messages without escaping; output is truncated at 3500 chars, which can leave malformed entities.
- **Root Cause**: User/command output is formatted with Markdown instead of escaped plain text or HTML `<pre>`.
- **Impact**: Status/result edits can fail, display misleading content, or accidentally create Telegram entities from command output.
- **Suggested Fix**: Use `parseMode: "html"` with escaped `<pre><code>` blocks, or send output as a file for nontrivial output. Escape command text and close formatting after truncation.
- **Confidence**: 4
- **References**: FND-008 for sudo-triggered `.exec`.

### FND-035: Prefix `.env` writer can emit invalid values
- **Severity**: Low
- **Category**: config
- **File(s)**: `src/plugin/prefix.ts:89-103`
- **Component**: prefix plugin
- **Platform**: All
- **Reproduction / Trigger**: Use `.prefix set` with values containing quotes, newlines, or shell/dotenv-special characters.
- **Evidence**: The plugin writes `TB_PREFIX="${value}"` via regex replacement with no escaping.
- **Root Cause**: dotenv serialization is hand-written.
- **Impact**: `.env` can become unparsable or can change subsequent config interpretation after restart.
- **Suggested Fix**: Restrict prefixes to visible non-whitespace single tokens without quotes/newlines, or use a proper dotenv serializer/escaper.
- **Confidence**: 4
- **References**: FND-008 because sudo can mutate prefixes.

## Explicit OK / Scoped Notes

- `src/plugin/status.ts:855-862` uses fixed command strings through `execSync`; no user-controlled shell input was found, but platform issues are in FND-037.
- `src/plugin/bf.ts:204-210` and `src/plugin/bf.ts:481-495` use `spawn()` argument arrays, so those calls are not command-injection surfaces; their risks are exfiltration/DoS in FND-016.
- `src/plugin/reload.ts:471-474` uses fixed `pm2 restart telebox`; not injection, but deployment assumptions are in FND-018.
- `src/utils/teleboxInfoHelper.ts:21-25` runs fixed `git rev-parse --short HEAD`; no input injection found.
- `src/utils/npm_install.ts:20-31` correctly uses `execFileSync("npm", args)` rather than shell interpolation; dependency reproducibility remains FND-001.
- `src/utils/tlRevive.ts:53-58` dynamically constructs TL classes from JSON. No built-in untrusted caller was found; keep it internal or add an allowlist if exposed to plugins/user input.

