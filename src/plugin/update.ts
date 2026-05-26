import { Plugin } from "@utils/pluginBase";
import { getPrefixes } from "@utils/pluginManager";
import { execFile } from "child_process";
import { promisify } from "util";
import { Api } from "teleproto";
import { npm_install_project_dependencies } from "@utils/npm_install";
import { getGlobalClient } from "@utils/globalClient";
import { isLikelySupervisedProcess } from "@utils/security";

const prefixes = getPrefixes();
const mainPrefix = prefixes[0];

const execFileAsync = promisify(execFile);

async function git(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: process.cwd(),
    timeout: 120_000,
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024,
  });
  return stdout;
}

function validateGitName(value: string, label: string): string {
  if (!/^[A-Za-z0-9._/-]{1,128}$/.test(value) || value.includes("..") || value.startsWith("-")) {
    throw new Error(`Invalid git ${label}: ${value}`);
  }
  return value;
}

async function getRemotes(): Promise<string[]> {
  try {
    const stdout = await git(["remote"]);
    return stdout.trim().split("\n").filter((r) => r.trim());
  } catch {
    return [];
  }
}

async function getBranches(): Promise<string[]> {
  try {
    const stdout = await git(["branch", "-r"]);
    const branches = stdout
      .trim()
      .split("\n")
      .map((b) => b.trim().replace(/^\*/, "").trim())
      .filter((b) => b && !b.includes("->"));
    return branches;
  } catch {
    return [];
  }
}

async function findMainBranch(): Promise<{ remote: string; branch: string } | null> {
  const branches = await getBranches();
  const allRemotes = await getRemotes();
  const mainBranchNames = ["main", "master"];

  const remotes = allRemotes.includes("origin")
    ? ["origin", ...allRemotes.filter((r) => r !== "origin")]
    : allRemotes;

  for (const branchName of mainBranchNames) {
    for (const remote of remotes) {
      const fullBranch = `${remote}/${branchName}`;
      if (branches.includes(fullBranch)) {
        return { remote, branch: branchName };
      }
      if (branches.includes(branchName)) {
        return { remote, branch: branchName };
      }
    }
  }

  return null;
}

async function update(force = false, msg: Api.Message) {
  await msg.edit({ text: "🚀 正在更新项目..." });
  console.clear();
  console.log("🚀 开始更新项目...\n");

  try {
    const branchInfo = await findMainBranch();
    if (!branchInfo) {
      throw new Error("未找到可用的远程分支 (main/master)。请确保已配置 git remote。");
    }

    const remote = validateGitName(branchInfo.remote, "remote");
    const branch = validateGitName(branchInfo.branch, "branch");
    const fullBranch = `${remote}/${branch}`;

    await git(["fetch", "--all"]);
    await msg.edit({ text: "🔄 正在拉取最新代码..." });

    if (force) {
      console.log(`⚠️ 强制回滚到 ${fullBranch}...`);
      await git(["reset", "--hard", fullBranch]);
      await msg.edit({ text: "🔄 强制更新中..." });
    }

    await git(["pull", remote, branch, "--no-rebase"]);
    await msg.edit({ text: "🔄 正在合并最新代码..." });

    console.log("\n📦 安装依赖...");
    await msg.edit({ text: "📦 正在安装依赖..." });
    npm_install_project_dependencies();

    console.log("✅ 更新完成。");
    if (isLikelySupervisedProcess()) {
      await msg.edit({ text: "✅ 更新完成。依赖或原生模块可能已变化，正在重启进程..." });
      const timer = setTimeout(() => process.exit(0), 800);
      if (typeof timer.unref === "function") timer.unref();
      return;
    }
    await msg.edit({
      text:
        "✅ 更新完成。\n\n" +
        "依赖或原生模块可能已变化，当前未检测到 PM2/systemd 等 supervisor。请手动重启 TeleBox 后再继续使用。",
    });
  } catch (error: any) {
    console.error("❌ 更新失败:", error);

    // 构建安全的错误信息 —— exec 错误有 .cmd/.stderr，
    // 其他错误（含 reloadRuntime 失败）只有 .message
    const errCmd = error.cmd || "";
    const errDetail = error.stderr || error.message || String(error);

    const errorText =
      `❌ 更新失败\n` +
      (errCmd ? `失败命令行：${errCmd}\n` : "") +
      `失败原因：${errDetail}\n\n` +
      "如果是 Git 冲突，请手动解决后再更新，或使用 .update -f 强制更新（会丢弃本地改动）";

    // msg.edit() 可能因 reloadRuntime 销毁旧 client 而失败，需安全兜底
    try {
      await msg.edit({ text: errorText });
    } catch (editError) {
      console.error("Failed to send error message after update failure:", editError);
      // 最后尝试通过新 client 发送
      try {
        const client = await getGlobalClient();
        const targetChat = msg.chatId || msg.peerId;
        if (client && targetChat) {
          await client.sendMessage(targetChat, { message: errorText });
        }
      } catch (sendError) {
        console.error("Failed to send error via fallback client:", sendError);
      }
    }
  }
}

class UpdatePlugin extends Plugin {
  description: string = `更新项目：拉取最新代码并安装依赖\n<code>${mainPrefix}update -f/-force</code> 强制更新`;
  commandPolicies = {
    update: {
      risk: "dangerous" as const,
      delegation: "owner-only" as const,
      reason: ".update changes the working tree and dependencies and is restricted to the account owner.",
    },
  };
  cmdHandlers: Record<string, (msg: Api.Message) => Promise<void>> = {
    update: async (msg) => {
      const args = msg.message.slice(1).split(" ").slice(1);
      const force = args.includes("--force") || args.includes("-f");
      await update(force, msg);
    },
  };
}

export default new UpdatePlugin();
