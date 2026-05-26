# 12 TypeScript Types

## Gate Result

Original audit gate: `npx --no-install tsc --noEmit` and `npx --no-install tsc --noEmit --noUnusedLocals` did not run the compiler because local `typescript` was missing. This was tracked by FND-002.

Post-fix gate: deterministic install is restored. `npm run typecheck` and `npm run typecheck:plugins` now run the compiler successfully, including a Node 24 validation pass.

## Findings

### FND-029: TypeScript strictness is weakened by broad `any`/`@ts-ignore` hotspots
- **Severity**: Medium
- **Category**: typescript_types
- **File(s)**: `src/utils/tlRevive.ts:8-63`, `src/utils/logger.ts:36-39`, `src/plugin/debug.ts:421-749`, `src/plugin/sudo.ts:45-177`, `src/plugin/sure.ts:61-220`
- **Component**: type system
- **Platform**: All
- **Reproduction / Trigger**: Run the grep from plan V.6.
- **Evidence**: `rg` found many `any`, `as any`, and `@ts-ignore` occurrences concentrated in TL revive, logger, debug, sudo/sure, banUtils, tpm, bf, re, and status.
- **Root Cause**: Teleproto dynamic TL shapes are handled with escape hatches, and strict companion options are not enabled.
- **Impact**: Runtime-only bugs remain invisible to TypeScript, especially around Telegram entity/message shapes and DB row types.
- **Suggested Fix**: Define narrow helper types for peer IDs, document attributes, entity serialization, and logger inputs. Replace `@ts-ignore` in `tlRevive` with typed constructors or a constrained factory. Add `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` behind a separate hardening branch.
- **Confidence**: 5
- **References**: `tsconfig.json:3-21`.

### FND-030: User `plugins/**/*` are part of project typecheck
- **Severity**: Low
- **Category**: dx
- **File(s)**: `tsconfig.json:23-24`
- **Component**: tsconfig
- **Platform**: All
- **Reproduction / Trigger**: A user downloads an arbitrary third-party plugin into `plugins/` and then runs `tsc`.
- **Evidence**: `"include": ["src/**/*", "plugins/**/*"]`.
- **Root Cause**: Runtime plugin directory is also treated as project source.
- **Impact**: Typecheck failures from local/user plugins can block validating the core framework.
- **Suggested Fix**: Split configs: `tsconfig.core.json` for `src/**/*` and `tsconfig.plugins.json` for optional plugin validation.
- **Confidence**: 5
- **References**: FND-012 plugin trust boundary.

## Config Notes

- `strict: true` is enabled, but `allowJs`, `skipLibCheck`, and the many `any` escapes reduce coverage.
- `sourceMap: false` makes production stack traces less useful.
- `lib` includes `dom`; no browser runtime was found, so this may hide accidental DOM global usage.
- `@utils/*` path alias works only because the runner registers `tsconfig-paths/register`.

## Type Escape Index

The plan's grep was run for `as any`, `: any`, `@ts-ignore`, `@ts-expect-error`, `Function`, and `Object`. Matches involving `Object.entries`/`Object.keys` are included because they were part of the requested pattern, even though they are not all type escapes.

```text
ecosystem.config.cjs:19 Object.fromEntries
ecosystem.config.cjs:27 Object.fromEntries
ecosystem.config.cjs:28 Object.entries
src/utils/runtimeManager.ts:48 Object.entries
src/utils/runtimeManager.ts:82 Object.entries
src/utils/tlRevive.ts:8 v: any
src/utils/tlRevive.ts:14 any | undefined
src/utils/tlRevive.ts:17 cur: any / Api as any
src/utils/tlRevive.ts:28 @ts-ignore
src/utils/tlRevive.ts:33 @ts-ignore
src/utils/tlRevive.ts:38 @ts-ignore
src/utils/tlRevive.ts:44 input as any
src/utils/tlRevive.ts:48 Object.entries
src/utils/tlRevive.ts:56 @ts-ignore
src/utils/tlRevive.ts:62 @ts-ignore
src/utils/logger.ts:36 db: any
src/utils/logger.ts:56 Object.keys
src/utils/logger.ts:80 args: any[]
src/utils/logger.ts:95 Object.keys
src/utils/logger.ts:96 Object.entries
src/utils/logger.ts:199 args: any[]
src/utils/logger.ts:221/227/255/263/289 console args: any[]
src/utils/npm_install.ts:10 Object.keys
src/utils/npm_install.ts:48 error: any
src/utils/npm_install.ts:61 error: any
src/utils/apiConfig.ts:9 proxy?: any
src/utils/pluginBase.ts:66 Object.keys
src/utils/pluginBase.ts:81 Object.keys
src/utils/telegraphFormatter.ts:646 kind: any
src/utils/banUtils.ts:16/17/61/62/106/107/134/260 channel/user any
src/utils/banUtils.ts:165 hash: 0 as any
src/utils/banUtils.ts:190/195/225/226 result/participant as any and u/chat any
src/utils/safeGetMessages.ts:3 error: any
src/utils/safeGetMessages.ts:12 client: any
src/utils/safeGetMessages.ts:13 entity: any
src/utils/safeGetMessages.ts:38 msg as any
src/utils/pluginManager.ts:183 Object.keys
src/utils/pluginManager.ts:295 Object.create
src/utils/pluginManager.ts:296 Object.assign
src/utils/pluginManager.ts:298 Object.defineProperty
src/utils/pluginManager.ts:303 Object.defineProperty
src/utils/pluginManager.ts:455 Object.keys
src/utils/pluginManager.ts:496 Object.entries
src/utils/channelGapBreaker.ts:168 client: any
src/utils/channelGapBreaker.ts:253 any | null
src/plugin/sudo.ts:45/54/79/80/81/106/116/146/149/150/151/167/177/255/256 any
src/plugin/reload.ts:35 targetChat: any
src/plugin/reload.ts:192 targetChat: any
src/plugin/sendLog.ts:108/120/176/203/222 error: any
src/plugin/ping.ts:121 res: any
src/plugin/ping.ts:192/385/459 error: any
src/plugin/update.ts:120 error: any
src/plugin/bf.ts:27/34/35/39/43 target/id/entity/e any
src/plugin/loglevel.ts:84 as any
src/plugin/status.ts:198 db: any
src/plugin/status.ts:302 Object.entries
src/plugin/status.ts:838 Object.keys
src/plugin/prefix.ts:9 as any
src/plugin/prefix.ts:90 process.env as any
src/plugin/debug.ts:58/130/157/200/410/465/553/590/601/649/667/749 error: any
src/plugin/debug.ts:148/149 commented entity as any
src/plugin/debug.ts:353 chatId: any
src/plugin/debug.ts:421 entity: any
src/plugin/debug.ts:561 userId: any
src/plugin/debug.ts:661 entity: any
src/plugin/re.ts:102 peerId: any
src/plugin/re.ts:107 sendOptions: any
src/plugin/help.ts:89/129/225 Object.keys
src/plugin/help.ts:245 Object.keys
src/plugin/help.ts:246 Object.entries
src/plugin/help.ts:270 e: any
src/plugin/tpm.ts:96 sendOptions: any
src/plugin/tpm.ts:222 msg: any
src/plugin/tpm.ts:223 msg.media as any
src/plugin/tpm.ts:370/859/936/1082/1219 Object.keys
src/plugin/tpm.ts:899 sendOptions: any
src/plugin/tpm.ts:1426 text: any
src/plugin/tpm.ts:1429 as any
src/plugin/sure.ts:29 any[]
src/plugin/sure.ts:61/70/95/96/97/122/132/161/164/165/166/182/192/220/352/353 any
```
