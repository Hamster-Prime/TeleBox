import { Plugin } from "@utils/pluginBase";
import { getPrefixes } from "@utils/pluginManager";
import os from "os";
import path from "path";
import fs from "fs/promises";
import { SendLogDB } from "@utils/sendLogDB";
import { Api } from "teleproto";
import { createDirectoryInTemp } from "@utils/pathHelpers";
import { redactSecrets } from "@utils/security";

const prefixes = getPrefixes();
const mainPrefix = prefixes[0];
const MAX_LOG_TAIL_BYTES = 512 * 1024;


async function findLogFiles(): Promise<{
  outLog: string | null;
  errLog: string | null;
}> {
  const possiblePaths = [
    // PM2 默认路径
    path.join(os.homedir(), ".pm2/logs/telebox-out.log"),
    path.join(os.homedir(), ".pm2/logs/telebox-error.log"),
    path.join(os.homedir(), ".pm2/logs/telebox-err.log"),
    // 项目本地路径
    path.join(process.cwd(), "logs/out.log"),
    path.join(process.cwd(), "logs/error.log"),
    path.join(process.cwd(), "logs/telebox.log"),
    // 系统日志路径
    "/var/log/telebox/out.log",
    "/var/log/telebox/error.log",
    // 相对路径
    "./logs/out.log",
    "./logs/error.log",
  ];

  let outLog: string | null = null;
  let errLog: string | null = null;

  for (const logPath of possiblePaths) {
    try {
      await fs.access(logPath);
      const fileName = path.basename(logPath).toLowerCase();

      if (fileName.includes("out") && !outLog) {
        outLog = logPath;
      } else if (
        (fileName.includes("err") || fileName.includes("error")) &&
        !errLog
      ) {
        errLog = logPath;
      }
    } catch {
      // 文件不存在，继续检查下一个
    }
  }

  return { outLog, errLog };
}

function htmlEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function createRedactedTailFile(logPath: string, label: string): Promise<{ filePath: string; sizeKB: number }> {
  const stats = await fs.stat(logPath);
  const length = Math.min(stats.size, MAX_LOG_TAIL_BYTES);
  const offset = Math.max(0, stats.size - length);
  const handle = await fs.open(logPath, "r");
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, offset);
    const redacted = String(redactSecrets(buffer.toString("utf-8")));
    const tempDir = createDirectoryInTemp("sendlog");
    const filePath = path.join(tempDir, `${label}-${Date.now()}.log`);
    await fs.writeFile(filePath, redacted, { encoding: "utf-8", mode: 0o600 });
    const tailStats = await fs.stat(filePath);
    return { filePath, sizeKB: Math.round(tailStats.size / 1024) };
  } finally {
    await handle.close();
  }
}

const fn = async (msg: Api.Message) => {
  console.log("SendLog plugin triggered");

  const parts = msg.message.trim().split(/\s+/);
  if (parts.length >= 2 && parts[0].startsWith(".") && parts[1] === "set") {
    const target = parts[2];
    if (!target) {
      await msg.edit({ text: `用法: ${mainPrefix}sendlog set &lt;chatId|me&gt;` });
      return;
    }
    const db = new SendLogDB();
    db.setTarget(target);
    db.close();
    // 不暴露具体目标
    await msg.edit({ text: `✅ 已设置日志发送目标` });
    return;
  }

  if (parts.length >= 2 && parts[0].startsWith(".") && parts[1] === "clean") {
    await msg.edit({ text: `🔍 正在搜索日志文件...` });

    const { outLog, errLog } = await findLogFiles();
    console.log("Found logs for cleaning:", { outLog, errLog });

    if (!outLog && !errLog) {
      await msg.edit({
        text: "❌ 未找到日志文件\n\n已检查路径:\n• ~/.pm2/logs/telebox-*.log\n• ./logs/*.log\n• /var/log/telebox/*.log",
      });
      return;
    }

    const results: string[] = [];
    let cleanedCount = 0;

    if (outLog) {
      try {
        const stats = await fs.stat(outLog);
        const sizeKB = Math.round(stats.size / 1024);
        await fs.unlink(outLog);
        results.push(`✅ 已删除输出日志 (${sizeKB}KB)`);
        cleanedCount++;
      } catch (error: any) {
        results.push(`❌ 删除输出日志失败: ${error.message?.substring(0, 50) || "未知错误"}`);
      }
    }

    if (errLog) {
      try {
        const stats = await fs.stat(errLog);
        const sizeKB = Math.round(stats.size / 1024);
        await fs.unlink(errLog);
        results.push(`✅ 已删除错误日志 (${sizeKB}KB)`);
        cleanedCount++;
      } catch (error: any) {
        results.push(`❌ 删除错误日志失败: ${error.message?.substring(0, 50) || "未知错误"}`);
      }
    }

    const summaryText = [
      cleanedCount > 0 ? "🗑️ 日志清理完成" : "⚠️ 日志清理失败",
      "",
      ...results,
      "",
      cleanedCount > 0 ? `📊 已清理 ${cleanedCount} 个日志文件` : "💡 建议检查日志文件路径和权限",
    ].join("\n");

    await msg.edit({ text: summaryText });
    return;
  }

  const confirmed = parts.includes("--yes") || parts.includes("confirm");
  let target: string | number = "me";
  const db = new SendLogDB();
  target = db.getTarget();
  db.close();

  try {
    // 初始响应不显示目标
    await msg.edit({ text: `🔍 正在搜索日志文件...` });

    const { outLog, errLog } = await findLogFiles();
    console.log("Found logs:", { outLog, errLog });

    if (!outLog && !errLog) {
      await msg.edit({
        text: "❌ 未找到日志文件\n\n已检查路径:\n• ~/.pm2/logs/telebox-*.log\n• ./logs/*.log\n• /var/log/telebox/*.log\n\n建议:\n• 检查PM2进程状态\n• 确认日志文件路径",
      });
      return;
    }

    if (!confirmed) {
      const rows: string[] = [];
      for (const [label, logPath] of [
        ["输出日志", outLog],
        ["错误日志", errLog],
      ] as const) {
        if (!logPath) continue;
        const stats = await fs.stat(logPath);
        rows.push(`• ${label}: ${Math.round(stats.size / 1024)}KB`);
      }
      await msg.edit({
        text:
          `📋 找到日志文件\n\n${rows.join("\n")}\n\n` +
          `为避免泄漏 session/token，默认不会发送原始日志。\n` +
          `确认发送脱敏后的最近 ${(MAX_LOG_TAIL_BYTES / 1024).toFixed(0)}KB 内容: ${mainPrefix}sendlog --yes`,
      });
      return;
    }

    let sentCount = 0;
    const results: string[] = [];

    // 发送输出日志
    if (outLog) {
      try {
        const stats = await fs.stat(outLog);
        const sizeKB = Math.round(stats.size / 1024);
        console.log(`Sending redacted output log tail: ${outLog} (${sizeKB}KB) to ${target}`);

        if (stats.size > 50 * 1024 * 1024) {
          results.push(`⚠️ 输出日志过大 (${sizeKB}KB)，已跳过`);
        } else {
          const tail = await createRedactedTailFile(outLog, "telebox-out");
          await msg.client?.sendFile(target, {
            file: tail.filePath,
            caption: `📄 输出日志脱敏片段 (${tail.sizeKB}KB)\n📁 ${outLog}`,
          });
          await fs.unlink(tail.filePath).catch(() => undefined);
          results.push(`✅ 输出日志脱敏片段已发送 (${tail.sizeKB}KB)`);
          sentCount++;
        }
      } catch (error: any) {
        console.error("Error sending output log:", error);
        results.push(
          `❌ 输出日志发送失败: ${
            error.message?.substring(0, 50) || "未知错误"
          }`
        );
      }
    }

    // 发送错误日志
    if (errLog) {
      try {
        const stats = await fs.stat(errLog);
        const sizeKB = Math.round(stats.size / 1024);
        console.log(`Sending redacted error log tail: ${errLog} (${sizeKB}KB) to ${target}`);

        if (stats.size > 50 * 1024 * 1024) {
          results.push(`⚠️ 错误日志过大 (${sizeKB}KB)，已跳过`);
        } else {
          const tail = await createRedactedTailFile(errLog, "telebox-error");
          await msg.client?.sendFile(target, {
            file: tail.filePath,
            caption: `🚨 错误日志脱敏片段 (${tail.sizeKB}KB)\n📁 ${errLog}`,
          });
          await fs.unlink(tail.filePath).catch(() => undefined);
          results.push(`✅ 错误日志脱敏片段已发送 (${tail.sizeKB}KB)`);
          sentCount++;
        }
      } catch (error: any) {
        console.error("Error sending error log:", error);
        results.push(
          `❌ 错误日志发送失败: ${
            error.message?.substring(0, 50) || "未知错误"
          }`
        );
      }
    }

    const summaryText = [
      sentCount > 0 ? "📋 日志发送完成" : "⚠️ 日志发送失败",
      "",
      ...results,
      "",
      sentCount > 0 ? `📱 日志文件已发送` : "💡 建议检查日志文件路径和权限",
    ].join("\n");

    await msg.edit({ text: summaryText });
  } catch (error: any) {
    console.error("SendLog plugin error:", error);
    const errorMsg =
      error.message?.length > 100
        ? error.message.substring(0, 100) + "..."
        : error.message;
    await msg.edit({
      text: `❌ 日志发送失败\n\n错误信息: ${
        errorMsg || "未知错误"
      }\n\n可能的解决方案:\n• 检查文件权限\n• 确认PM2进程状态\n• 重启telebox服务`,
    });
  }
};

class SendLogPlugin extends Plugin {

  description: string = `发送日志文件到收藏夹或自定义目标\n.sendlog set &lt;对话 ID|@用户名|me&gt; 设置发送目标 (默认 me)\n.sendlog clean 清理日志文件`;
  commandPolicies = {
    sendlog: {
      risk: "dangerous" as const,
      delegation: "owner-only" as const,
      reason: ".sendlog can transfer sensitive log files and is restricted to the account owner.",
    },
    logs: {
      risk: "dangerous" as const,
      delegation: "owner-only" as const,
      reason: ".logs can transfer sensitive log files and is restricted to the account owner.",
    },
    log: {
      risk: "dangerous" as const,
      delegation: "owner-only" as const,
      reason: ".log can transfer sensitive log files and is restricted to the account owner.",
    },
  };
  cmdHandlers: Record<string, (msg: Api.Message) => Promise<void>> = {
    sendlog: fn,
    logs: fn,
    log: fn,
  };
}

export default new SendLogPlugin();
