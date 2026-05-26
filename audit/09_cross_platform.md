# 09 Cross Platform

## Findings

### FND-005: Claimed Windows support conflicts with scripts and shell tooling
- **Severity**: Medium
- **Category**: platform
- **File(s)**: `package.json:8`, `src/plugin/ping.ts:168-214`, `src/plugin/bf.ts:204-210`, `src/plugin/status.ts:638-807`, `INSTALL.md:10-31`
- **Component**: scripts / built-in plugins
- **Platform**: Windows
- **Reproduction / Trigger**: Try `npm run dev` in cmd.exe/PowerShell or use `.ping`, `.bf`, `.status` on a stock Windows host.
- **Evidence**: `package.json` uses POSIX inline env `NODE_ENV=development`; `ping.ts` uses `ping -c` and `awk`; `bf.ts` spawns `tar`; `status.ts` shells out to Unix tools on Linux/macOS and uses Windows-specific `wmic`; INSTALL badges Windows but steps are Debian/Ubuntu-focused.
- **Root Cause**: Cross-platform support is claimed at the documentation level while implementation relies on platform-specific shell commands and native modules.
- **Impact**: Windows users can fail during development, backup, ping, or status paths; support load rises because docs promise more than code provides.
- **Suggested Fix**: Use `cross-env` or a JS runner for `dev`, replace shell ping/tar/stat calls with Node libraries where possible, document Windows limitations explicitly, and add a Windows CI smoke test once a lockfile exists.
- **Confidence**: 5
- **References**: No Windows runtime was available; see `audit/_open_questions.md`.

### FND-037: Status/sysinfo has platform gaps, including deprecated Windows `wmic`
- **Severity**: Medium
- **Category**: platform
- **File(s)**: `src/plugin/status.ts:766-807`, `src/plugin/status.ts:681-757`
- **Component**: status plugin
- **Platform**: Windows
- **Reproduction / Trigger**: Run `.status` or `.sysinfo` on modern Windows where `wmic` is absent or disabled.
- **Evidence**: Windows CPU path executes `wmic cpu get loadpercentage /value`; Linux/macOS disk/swap paths shell out to `df`, `free`, `sysctl`, `ps`.
- **Root Cause**: Platform implementations are ad hoc shell commands instead of Node/OS APIs with capability detection.
- **Impact**: Status output silently degrades to `0.00`, `Unknown`, or stale defaults, which hides operational issues.
- **Suggested Fix**: Prefer `os.cpus()`, PowerShell CIM queries with timeout, or a maintained system-info library. Report "unsupported on this platform" instead of fabricated defaults.
- **Confidence**: 4
- **References**: Windows `wmic` deprecation/removal is common on recent Windows builds; verify in Windows smoke test.

## Platform Matrix

| Area | Linux | macOS | Windows |
|---|---|---|---|
| `npm start` | Expected after install | Expected after install | Likely works if native deps install |
| `npm run dev` | Works | Works | Fails because inline env syntax is POSIX |
| `.ping` target | Works but vulnerable (FND-006) | `ping -c` mostly works, awk path may work | Broken flags/tools |
| `.bf` / `.hf` | Requires `tar`/`gzip` | Requires BSD tar/gzip | Depends on bsdtar/PATH; not guaranteed |
| `.status` | Mostly implemented | Partial | Degraded; `wmic` risk |
| Native deps | Build toolchain needed | Xcode/headers needed | VS Build Tools/ABI risk |

