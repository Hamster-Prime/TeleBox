# 05 Telegram Layer

## Findings

### FND-025: Channel-gap breaker depends on teleproto private fields and reload resets cooldown
- **Severity**: Medium
- **Category**: correctness
- **File(s)**: `src/utils/channelGapBreaker.ts:23-37`, `src/utils/channelGapBreaker.ts:167-245`, `src/utils/runtimeManager.ts:163-166`
- **Component**: channelGapBreaker / logger
- **Platform**: All
- **Reproduction / Trigger**: Upgrade teleproto internals or reload during a 6h breaker cooldown.
- **Evidence**: The breaker mutates `client.updateManager.channels`, `channelFailRetryTimers`, `channelFailTimeoutS`, `_channelPts`, `_pendingChannelUpdates`, and `_fetchingChannelDifference`. `startFreshRuntime()` calls `resetCircuitBreaker()` on every new runtime.
- **Root Cause**: Teleproto lacks a public reset API for channel PTS state, so the project reaches into private state and clears in-memory cooldowns on reload.
- **Impact**: A teleproto patch can silently break gap recovery mitigation; reload can forget a still-valid cooldown and re-trigger noisy recovery loops.
- **Suggested Fix**: Upstream a public teleproto API or wrap private-field access in version-gated adapters with explicit health logs when no layout matches. Persist cooldown state across reloads or exclude reset from normal reload.
- **Confidence**: 4
- **References**: `git blame` shows threshold at `c43b7385` and 1.225 layout at `c64f9f05`.

### FND-032: Hook monkey patches are fragile and one imported hook is dead
- **Severity**: Medium
- **Category**: correctness
- **File(s)**: `src/index.ts:4-7`, `src/hook/listen.ts:15-38`, `src/hook/patches/telegram.patch.ts:14-37`, `src/hook/patches/telegram.patch.ts:39-62`
- **Component**: Telegram monkey patches
- **Platform**: All
- **Reproduction / Trigger**: Start the app with text containing Unicode private-use sentinels `\uE000`-`\uE004`, or rely on `patchMsgEdit()`.
- **Evidence**: `patchMsgEdit` is imported but commented out. The HTML parser patch uses private-use characters as sentinels and globally replaces them during parse restore. `deleteWithDelay` and `safeDelete` sleep/delete without generation lifecycle tracking.
- **Root Cause**: Global monkey patches are applied without idempotence/version checks or collision-safe sentinel handling; one older hook remains in source but is disabled.
- **Impact**: Rare message text can be corrupted by sentinel restore, future teleproto parser changes can break globally, and maintainers may assume `patchMsgEdit()` is active when it is not.
- **Suggested Fix**: Remove dead `patchMsgEdit` or wire it explicitly with tests. Use collision-resistant tokenization for HTML entity protection, guard patches with idempotent symbols, and document every patched method in one startup hook.
- **Confidence**: 4
- **References**: `src/hook/types/telegram.d.ts:1-38` declares the patched methods.

## Telegram-Specific Notes

- `src/plugin/debug.ts` raw entity/message dumps are the primary access-hash leakage path; see FND-014.
- `src/utils/entityHelpers.ts` retries FloodWait and checks generation during delays, which is a good lifecycle pattern.
- `src/utils/safeGetMessages.ts` only guards one known teleproto crash string (`undefined.date`). Other getMessages failure shapes are rethrown by design.
- `src/hook/patches/telegram.patch.ts` monkey patches `HTMLParser.parse`, `deleteWithDelay`, and `safeDelete`; patch fragility is tracked in FND-032.
