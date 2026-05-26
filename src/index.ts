import "dotenv/config";
import { logger } from "@utils/logger"; // 引入 logger 以便尽早初始化
import { shutdownRuntime, startRuntime } from "@utils/runtimeManager";
import "./hook/patches/telegram.patch";

async function fatalShutdown(exitCode: number): Promise<void> {
  if (process.env.NODE_ENV === "development" || process.env.TB_UNHANDLED_REJECTION === "warn") {
    return;
  }
  const timer = setTimeout(() => process.exit(exitCode), 10_000);
  try {
    await shutdownRuntime();
  } catch (error) {
    console.error("[FATAL] Graceful shutdown failed:", error);
  } finally {
    clearTimeout(timer);
    process.exit(exitCode);
  }
}

process.on("unhandledRejection", (reason: unknown) => {
  const message = reason instanceof Error ? reason.stack || reason.message : String(reason);
  console.error(`[FATAL] Unhandled promise rejection: ${message}`);
  void fatalShutdown(1);
});

process.on("uncaughtException", (error: Error) => {
  console.error(`[FATAL] Uncaught exception: ${error.stack || error.message}`);
  // Exit after logging so PM2 can restart cleanly
  process.exit(1);
});

async function run() {
  await startRuntime();
}

run();
