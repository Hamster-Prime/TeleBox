import path from "path";
import util from "util";

const SECRET_KEY_RE =
  /(session|api[_-]?hash|auth[_-]?key|access[_-]?hash|token|password|secret|cookie)/i;
const SECRET_VALUE_RE =
  /(1[A-Za-z0-9_-]{80,}|[A-Fa-f0-9]{32,}|Bearer\s+[A-Za-z0-9._-]+)/g;

function isSensitiveKey(key: string): boolean {
  return SECRET_KEY_RE.test(key);
}

function redactString(value: string): string {
  return value.replace(SECRET_VALUE_RE, "[REDACTED]");
}

function redactSecrets(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") {
    return redactString(value);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  if (value instanceof Error) {
    const copy = new Error(redactString(value.message));
    copy.name = value.name;
    copy.stack = value.stack ? redactString(value.stack) : undefined;
    return copy;
  }
  if (Buffer.isBuffer(value)) {
    return `[Buffer ${value.length} bytes]`;
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, seen));
  }

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    output[key] = isSensitiveKey(key) ? "[REDACTED]" : redactSecrets(nested, seen);
  }
  return output;
}

function inspectRedacted(value: unknown): string {
  if (value instanceof Error) {
    const redacted = redactSecrets(value) as Error;
    return redacted.stack || redacted.message;
  }
  if (typeof value === "object" && value !== null) {
    return util.inspect(redactSecrets(value), {
      colors: true,
      depth: null,
      breakLength: Infinity,
    });
  }
  return String(redactSecrets(value));
}

function validatePluginId(input: string): string {
  const id = input.trim();
  if (!/^[a-z0-9_-]{1,64}$/i.test(id)) {
    throw new Error(`Invalid plugin name: ${input}`);
  }
  if (id === "." || id === ".." || id.includes(path.sep) || id.includes(path.posix.sep)) {
    throw new Error(`Invalid plugin name: ${input}`);
  }
  return id;
}

function resolveContainedFile(baseDir: string, fileName: string): string {
  const resolvedBase = path.resolve(baseDir);
  const resolvedFile = path.resolve(resolvedBase, fileName);
  if (resolvedFile !== resolvedBase && resolvedFile.startsWith(resolvedBase + path.sep)) {
    return resolvedFile;
  }
  throw new Error(`Path escapes target directory: ${fileName}`);
}

function safePluginFilePath(baseDir: string, pluginId: string): string {
  const id = validatePluginId(pluginId);
  return resolveContainedFile(baseDir, `${id}.ts`);
}

function safeUploadedPluginFileName(fileName: string): { pluginId: string; fileName: string } {
  const base = path.basename(fileName);
  if (base !== fileName || !base.endsWith(".ts")) {
    throw new Error("Invalid plugin file name");
  }
  const pluginId = validatePluginId(base.replace(/\.ts$/, ""));
  return { pluginId, fileName: `${pluginId}.ts` };
}

function isAllowedRemotePluginUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (parsed.hostname !== "raw.githubusercontent.com") return false;
    const parts = parsed.pathname.split("/").filter(Boolean);
    return (
      parts.length >= 4 &&
      parts[0] === "TeleBoxDev" &&
      parts[1] === "TeleBox_Plugins" &&
      parts[2] === "main"
    );
  } catch {
    return false;
  }
}

function isLikelySupervisedProcess(): boolean {
  return Boolean(
    process.env.pm_id ||
      process.env.PM2_HOME ||
      process.env.SYSTEMD_EXEC_PID ||
      process.env.INVOCATION_ID ||
      process.env.TELEBOX_SUPERVISED === "1"
  );
}

export {
  htmlEscape,
  codeTag,
} from "./html";
export {
  inspectRedacted,
  isAllowedRemotePluginUrl,
  isLikelySupervisedProcess,
  redactSecrets,
  resolveContainedFile,
  safePluginFilePath,
  safeUploadedPluginFileName,
  validatePluginId,
};
