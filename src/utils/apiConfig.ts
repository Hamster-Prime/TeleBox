import fs from "fs";
import path from "path";
import readline from "readline";

interface TelegramAPI {
  api_id?: number;
  api_hash?: string;
  session?: string;
  proxy?: any;
  connectionRetries?: number;
}

const CONFIG_PATH = path.join(process.cwd(), "config.json");
const PRIVATE_FILE_MODE = 0o600;

function hardenConfigPermissions(): void {
  if (process.platform === "win32" || !fs.existsSync(CONFIG_PATH)) return;
  try {
    const stat = fs.statSync(CONFIG_PATH);
    if ((stat.mode & 0o077) !== 0) {
      fs.chmodSync(CONFIG_PATH, PRIVATE_FILE_MODE);
      console.warn("⚠️ config.json permissions were too broad and have been changed to 0600.");
    }
  } catch (error) {
    console.warn("⚠️ 无法收紧 config.json 权限:", error);
  }
}

function ensureConfigFileExists(): void {
  if (!fs.existsSync(CONFIG_PATH) || fs.statSync(CONFIG_PATH).size === 0) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({}, null, 2), {
      encoding: "utf-8",
      mode: PRIVATE_FILE_MODE,
    });
  }
  hardenConfigPermissions();
}

function loadConfig(): TelegramAPI {
  ensureConfigFileExists();
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    return withEnvOverrides(JSON.parse(raw));
  } catch (e) {
    console.error("❌ 无法读取 config.json:", e);
    return withEnvOverrides({});
  }
}

function saveConfig(config: TelegramAPI): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), {
    encoding: "utf-8",
    mode: PRIVATE_FILE_MODE,
  });
  hardenConfigPermissions();
}

function promptInput(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

function storeStringSession(session: string): void {
  if (process.env.TB_SESSION || process.env.TELEBOX_SESSION) {
    console.warn("TB_SESSION/TELEBOX_SESSION is set; not writing session back to config.json.");
    return;
  }
  const config = loadConfig();
  config.session = session;
  saveConfig(config);
}

function withEnvOverrides(config: TelegramAPI): TelegramAPI {
  const apiId = process.env.TB_API_ID || process.env.TELEBOX_API_ID;
  const apiHash = process.env.TB_API_HASH || process.env.TELEBOX_API_HASH;
  const session = process.env.TB_SESSION || process.env.TELEBOX_SESSION;
  return {
    ...config,
    ...(apiId ? { api_id: Number(apiId) } : {}),
    ...(apiHash ? { api_hash: apiHash } : {}),
    ...(session ? { session } : {}),
  };
}

async function initConfig(): Promise<TelegramAPI> {
  const config = loadConfig();

  let { api_id, api_hash } = config;

  if (!api_id || !api_hash) {
    // 缺失时，提示输入
    if (!api_id) {
      let input: string;
      while (true) {
        input = await promptInput("请输入 API_ID: ");
        if (input) break; // 输入有效，跳出循环
        console.error("❌ API_ID 不能为空，请重新输入。");
      }
      api_id = parseInt(input);
    }

    if (!api_hash) {
      let input: string;
      while (true) {
        input = await promptInput("请输入 API_HASH: ");
        if (input) break; // 输入有效，跳出循环
        console.error("❌ API_HASH 不能为空，请重新输入。");
      }
      api_hash = input;
    }

    const newConfig: TelegramAPI = { api_id, api_hash };
    saveConfig(newConfig);
    return newConfig;
  }

  return config;
}

let configPromise: Promise<TelegramAPI> | null = null;

function getApiConfig(): Promise<TelegramAPI> {
  if (!configPromise) {
    configPromise = initConfig();
  }
  return configPromise;
}

export { getApiConfig, storeStringSession };
