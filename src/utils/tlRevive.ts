// 1. Telegram 的 fileReference 可能过期, 所以不存文件只存数据不靠谱. 媒体序列化和还原先放着
// 2. 只有 bot 才能 replyMarkup

import { Api } from "teleproto";

type JsonLike = unknown;
type JsonRecord = Record<string, unknown>;
type TlConstructor = new (args: JsonRecord) => unknown;

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null;
}

function isBufferLike(v: unknown): v is { type: "Buffer"; data: number[] } {
  return (
    isRecord(v) && v.type === "Buffer" && Array.isArray(v.data)
  );
}

function resolveCtor(className: string): TlConstructor | undefined {
  // Supports names like "MessageEntityBold" or namespaced "messages.SendMessage"
  const parts = className.split(".");
  let cur: unknown = Api;
  for (const p of parts) {
    cur = isRecord(cur) ? cur[p] : undefined;
    if (!cur) return undefined;
  }
  return typeof cur === "function" ? (cur as TlConstructor) : undefined;
}

export function reviveTl<T = unknown>(input: JsonLike): T {
  // Arrays
  if (Array.isArray(input)) {
    return input.map((i) => reviveTl(i)) as T;
  }
  // Buffers serialized by JSON
  if (isBufferLike(input)) {
    return Buffer.from(input.data) as T;
  }
  // Primitive
  if (!isRecord(input)) {
    return input as T;
  }

  // If it looks like a TL JSON object with className/_ markers
  const className: string | undefined =
    typeof input.className === "string"
      ? input.className
      : typeof input._ === "string"
      ? input._
      : undefined;

  // Recurse into properties first to revive nested children
  const revivedArgs: JsonRecord = {};
  for (const [k, v] of Object.entries(input)) {
    if (k === "className" || k === "_") continue;
    revivedArgs[k] = reviveTl(v);
  }

  if (className) {
    const Ctor = resolveCtor(className);
    if (typeof Ctor === "function") {
      return new Ctor(revivedArgs) as T;
    }
    // If we cannot resolve, fall through and return plain object
  }

  return revivedArgs as T;
}

export function reviveEntities(
  jsonEntities: JsonLike
): Api.TypeMessageEntity[] | undefined {
  if (!jsonEntities) return undefined;
  const entities = reviveTl<Api.TypeMessageEntity[]>(jsonEntities);
  return entities;
}

export function reviveMedia(
  jsonMedia: JsonLike
): Api.TypeMessageMedia | undefined {
  if (!jsonMedia) return undefined;
  const media = reviveTl<Api.TypeMessageMedia>(jsonMedia);
  // Filter out media types that cannot be resent via sendFile
  if (
    media instanceof Api.MessageMediaWebPage ||
    media instanceof Api.MessageMediaEmpty ||
    media instanceof Api.MessageMediaUnsupported
  ) {
    return undefined;
  }
  return media;
}
