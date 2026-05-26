# 01 Dependency Audit

## Gate Results

- `npm ls --all`: failed with `ELSPROBLEMS`; all dependencies are `UNMET DEPENDENCY`.
- `npm outdated`: all rows show `Current=MISSING`; wanted/latest values were returned.
- `npm audit --omit=dev`: failed with `ENOLOCK`; no CVE report can be produced without a lockfile.
- `package-lock.json`: absent and ignored by `.gitignore:17`.

## Dependency Table

| Package | Declared | Wanted / Latest from `npm outdated` | Use Evidence | Status |
|---|---:|---:|---|---|
| `@modelcontextprotocol/sdk` | `^1.26.0` | `1.29.0 / 1.29.0` | no source import | remove or document remote-plugin contract |
| `@types/archiver` | `^6.0.3` | `6.0.4 / 7.0.0` | no source import | stale type dependency |
| `@types/better-sqlite3` | `^7.6.13` | `7.6.13 / 7.6.13` | supports DB wrappers | needed only for TS |
| `@types/cron` | `^2.0.1` | `2.0.1 / 2.0.1` | supports `cron` | may mismatch `cron@4` API surface |
| `@types/js-yaml` | `^4.0.9` | `4.0.9 / 4.0.9` | no source import | remove with `js-yaml` if unused |
| `@types/lodash` | `^4.17.20` | `4.17.24 / 4.17.24` | no source import | remove with `lodash` if unused |
| `@types/lowdb` | `^1.0.15` | `1.0.15 / 1.0.15` | lowdb v7 has bundled types | likely redundant |
| `@types/node` | `^24.3.0` | `24.12.4 / 25.9.1` | project-wide | keep pinned to Node 24 line |
| `@types/opencc-js` | `^1.0.3` | `1.0.3 / 1.0.3` | no source import | remove with `opencc-js` if unused |
| `@types/qrcode-terminal` | `^0.12.2` | `0.12.2 / 0.12.2` | `loginManager.ts` | needed |
| `@vitalets/google-translate-api` | `^9.2.1` | `9.2.1 / 9.2.1` | docs only | unused by built-ins; ESM-risk |
| `archiver` | `^7.0.1` | `7.0.1 / 8.0.0` | docs only | unused; `bf.ts` shells out to `tar` |
| `axios` | `^1.11.0` | `1.16.1 / 1.16.1` | `src/plugin/tpm.ts` | used; update after lock restoration |
| `better-sqlite3` | `^12.2.0` | `12.10.0 / 12.10.0` | DB wrappers | used; native install risk |
| `canvas` | `^3.2.1` | `3.2.3 / 3.2.3` | no source import | unused native dependency |
| `cheerio` | `^1.2.0` | `1.2.0 / 1.2.0` | docs only | unused by built-ins |
| `cron` | `^4.3.3` | `4.4.0 / 4.4.0` | `cronManager.ts` | used |
| `dayjs` | `^1.11.18` | `1.11.20 / 1.11.20` | `logger.ts` | used |
| `dotenv` | `^17.2.2` | `17.4.2 / 17.4.2` | `index.ts`, ecosystem | used |
| `js-yaml` | `^4.1.1` | `4.1.1 / 4.1.1` | no source import | unused |
| `lodash` | `^4.17.21` | `4.18.1 / 4.18.1` | docs only | unused by built-ins |
| `lowdb` | `^7.0.1` | `7.0.1 / 7.0.1` | logger/reload/status/tpm/bf | used; concurrency issue in FND-026 |
| `modern-gif` | `^2.0.4` | `2.1.0 / 2.1.0` | docs only | unused by built-ins; ESM-risk |
| `node-schedule` | `^2.1.1` | `2.1.1 / 2.1.1` | no source import | unused; cron replacement exists |
| `opencc-js` | `^1.0.5` | `1.3.1 / 1.3.1` | docs only | unused by built-ins; ESM-risk |
| `p-limit` | `^7.2.0` | `7.3.0 / 7.3.0` | no source import | unused; ESM-risk |
| `qrcode-terminal` | `^0.12.0` | `0.12.0 / 0.12.0` | `loginManager.ts` | used |
| `sharp` | `^0.34.3` | `0.34.5 / 0.34.5` | docs only | unused by built-ins; native install risk |
| `ssh2` | `^1.15.0` | `1.17.0 / 1.17.0` | docs only | unused by built-ins; native install risk |
| `teleproto` | `^1.223.1` | `1.225.3 / 1.225.3` | core import | used; private API coupling in FND-025 |
| `tsconfig-paths` | `^4.2.0` | `4.2.0 / 4.2.0` | runner | used |
| `tsx` | `^4.20.4` | `4.22.3 / 4.22.3` | runner | used |
| `typescript` | `^5.9.2` | `5.9.3 / 6.0.3` | type gate | used but missing locally |

## Findings

### FND-001: Missing ignored lockfile makes dependency trees non-reproducible
- **Severity**: High
- **Category**: dependency
- **File(s)**: `.gitignore:17`, `package.json:1-63`
- **Component**: package management
- **Platform**: All
- **Reproduction / Trigger**: Fresh clone and run `npm install`; npm resolves semver ranges without a committed `package-lock.json`.
- **Evidence**: `.gitignore` ignores `package-lock.json`; `npm audit --omit=dev` failed with `ENOLOCK`; `npm outdated` already reports newer wanted versions for many ranges.
- **Root Cause**: The project intentionally excludes the npm lockfile while using broad caret ranges and native/ESM dependencies.
- **Impact**: Two deployments can run different `teleproto`, `axios`, native module, or transitive versions; security audit cannot map CVEs to an installed tree; rollback is weak.
- **Suggested Fix**: Commit `package-lock.json` generated on Node 24/npm target. Enforce `npm ci` in docs/PM2/deploy. If plugins need flexible deps, isolate those in plugin-specific optional installs rather than the core app lock.
- **Confidence**: 5
- **References**: `npm audit` output: `ENOLOCK`; recent commit `691ea42 chore: ignore package-lock.json`.

### FND-002: Current checkout cannot run dependency, audit, or type gates
- **Severity**: Medium
- **Category**: dx
- **File(s)**: `node_modules/.gitkeep:1`, `package.json:24-61`, `CHANGELOG.md:12-14`
- **Component**: validation gates
- **Platform**: All
- **Reproduction / Trigger**: Run `npm ls --all`, `npm audit --omit=dev`, or `npx --no-install tsc --noEmit` in this checkout.
- **Evidence**: `npm ls --all` reports every declared dependency as `UNMET DEPENDENCY`; `npx --no-install tsc --noEmit` printed the npm placeholder error instead of compiling; `CHANGELOG.md` says this repo passed `npx tsc --noEmit`.
- **Root Cause**: Dependencies are not installed, no lockfile exists for deterministic install, and the documentation records an unverifiable gate result.
- **Impact**: Maintainers cannot prove type safety, CVE status, or runtime dependency shape from the repository state.
- **Suggested Fix**: Restore a lockfile, document `npm ci`, and make `npm run typecheck` a script. Update CHANGELOG claims only after a reproducible command output is available.
- **Confidence**: 5
- **References**: Active validation command output captured in `audit/_inventory.md`.

### FND-003: Declared dependency set is oversized and partially unused/ESM-risky
- **Severity**: Medium
- **Category**: dependency
- **File(s)**: `package.json:24-61`
- **Component**: dependency surface
- **Platform**: All
- **Reproduction / Trigger**: Grep exact imports for declared packages.
- **Evidence**: No built-in source imports were found for `@modelcontextprotocol/sdk`, `archiver`, `canvas`, `cheerio`, `js-yaml`, `node-schedule`, `p-limit`, `sharp`, `ssh2`, and several docs-only dependencies. `package.json` remains CommonJS.
- **Root Cause**: Dependencies appear to support remote plugins or historical code, but are installed as core runtime dependencies.
- **Impact**: Larger install footprint, more native build failures on Windows/macOS/Linux, greater supply-chain risk, and ESM/CJS breakage risk.
- **Suggested Fix**: Move unused built-in dependencies to optional plugin manifests or document them as remote-plugin peer deps. Keep only core imports in `dependencies`; make native packages optional where possible.
- **Confidence**: 4
- **References**: Dependency usage scan in `audit/_inventory.md`.

