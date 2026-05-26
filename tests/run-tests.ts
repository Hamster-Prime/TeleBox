import assert from "node:assert/strict";
import path from "node:path";
import {
  isAllowedRemotePluginUrl,
  safePluginFilePath,
  safeUploadedPluginFileName,
  validatePluginId,
} from "../src/utils/security";
import { assertCommandAllowedForInvocation } from "../src/utils/commandPolicy";
import { createGenerationContext } from "../src/utils/generationContext";
import { cronManager } from "../src/utils/cronManager";
import { clearChannelStateForTesting } from "../src/utils/channelGapBreaker";
import type { Plugin } from "../src/utils/pluginBase";
import "../src/hook/patches/telegram.patch";

const { HTMLParser } = require("teleproto/extensions/html");

async function testSecurityHelpers(): Promise<void> {
  assert.equal(validatePluginId("hello_world-1"), "hello_world-1");
  assert.throws(() => validatePluginId("../evil"));
  assert.throws(() => safeUploadedPluginFileName("../../evil.ts"));
  assert.deepEqual(safeUploadedPluginFileName("good-name.ts"), {
    pluginId: "good-name",
    fileName: "good-name.ts",
  });

  const pluginDir = path.join(process.cwd(), "plugins");
  assert.equal(safePluginFilePath(pluginDir, "good").startsWith(pluginDir), true);
  assert.throws(() => safePluginFilePath(pluginDir, "../bad"));

  assert.equal(
    isAllowedRemotePluginUrl("https://raw.githubusercontent.com/TeleBoxDev/TeleBox_Plugins/main/foo.ts"),
    true
  );
  assert.equal(
    isAllowedRemotePluginUrl("https://raw.githubusercontent.com/other/repo/main/foo.ts"),
    false
  );
}

async function testCommandPolicy(): Promise<void> {
  const plugin = {
    commandPolicies: {
      exec: { risk: "dangerous", delegation: "owner-only" },
      tpm: { blockedSubcommands: ["install", "i"] },
    },
  } as unknown as Plugin;

  assert.throws(() =>
    assertCommandAllowedForInvocation({
      cmd: "exec",
      messageText: ".exec id",
      plugin,
      trigger: {} as never,
    })
  );

  assert.throws(() =>
    assertCommandAllowedForInvocation({
      cmd: "tpm",
      messageText: ".tpm install demo",
      plugin,
      trigger: {} as never,
    })
  );

  assert.doesNotThrow(() =>
    assertCommandAllowedForInvocation({
      cmd: "tpm",
      messageText: ".tpm search demo",
      plugin,
      trigger: {} as never,
    })
  );
}

async function testGenerationDrainTimeout(): Promise<void> {
  const keepAlive = setInterval(() => undefined, 1000);
  const context = createGenerationContext(999);
  try {
    context.trackTask(new Promise(() => undefined), {
      label: "never-settles",
      kind: "promise",
    });
    context.abort("test");
    const first = await context.drain(5);
    assert.equal(first.timedOut, true);
    assert.equal(context.state, "disposed-with-residuals");

    const startedAt = Date.now();
    const second = await context.drain(500);
    assert.equal(second.pendingTasks, 1);
    assert.equal(Date.now() - startedAt < 100, true);
  } finally {
    clearInterval(keepAlive);
  }
}

async function testCronDisposeWaitsInFlight(): Promise<void> {
  let resolveHandler: (() => void) | null = null;
  let finished = false;
  const dispose = cronManager.set(
    "test-cron-drain",
    "* * * * * *",
    async () => {
      await new Promise<void>((resolve) => {
        resolveHandler = resolve;
      });
      finished = true;
    }
  );
  const raw = cronManager.ls(true) as Map<string, { job: { fireOnTick: () => void } | null }>;
  raw.get("test-cron-drain")?.job?.fireOnTick();
  assert.equal(finished, false);
  const disposePromise = Promise.resolve(dispose());
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(finished, false);
  resolveHandler?.();
  await disposePromise;
  assert.equal(finished, true);
}

async function testChannelGapBreakerAdapters(): Promise<void> {
  const legacyClient = {
    _channelPts: new Map([["123", 456]]),
    _pendingChannelUpdates: new Map([["123", []]]),
    _fetchingChannelDifference: new Set(["123"]),
  };
  const legacy = clearChannelStateForTesting(legacyClient, "123");
  assert.deepEqual(legacy, { cleared: true, oldPts: 456, layout: "legacy" });
  assert.equal(legacyClient._channelPts.has("123"), false);
  assert.equal(legacyClient._pendingChannelUpdates.has("123"), false);
  assert.equal(legacyClient._fetchingChannelDifference.has("123"), false);

  const updateManagerClient = {
    updateManager: {
      channels: new Map([
        [
          "456",
          {
            pts: {
              current: () => 789,
              clearSkippedUpdates: () => undefined,
              setRequesting: (_value: boolean) => undefined,
            },
            timer: setTimeout(() => undefined, 1000),
          },
        ],
      ]),
      channelFailRetryTimers: new Map([["456", setTimeout(() => undefined, 1000)]]),
      channelFailTimeoutS: new Set(["456"]),
    },
  };
  const modern = clearChannelStateForTesting(updateManagerClient, "456");
  assert.deepEqual(modern, { cleared: true, oldPts: 789, layout: "updateManager" });
  assert.equal(updateManagerClient.updateManager.channels.has("456"), false);
  assert.equal(updateManagerClient.updateManager.channelFailRetryTimers.has("456"), false);
  assert.equal(updateManagerClient.updateManager.channelFailTimeoutS.has("456"), false);
}

async function testHtmlPatchPreservesPrivateUseText(): Promise<void> {
  const privateUseChar = "\uE000";
  const [text] = HTMLParser.parse(`${privateUseChar} &lt;b&gt; &amp;lt;`);
  assert.equal(text, `${privateUseChar} <b> &lt;`);
}

async function main(): Promise<void> {
  await testSecurityHelpers();
  await testCommandPolicy();
  await testGenerationDrainTimeout();
  await testCronDisposeWaitsInFlight();
  await testChannelGapBreakerAdapters();
  await testHtmlPatchPreservesPrivateUseText();
  process.stdout.write("All tests passed.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
