import { Plugin } from "@utils/pluginBase";
import { getGlobalClient } from "@utils/globalClient";
import { Api, TelegramClient } from "teleproto";
import type { EntityLike } from "teleproto/define";
import { safeGetMessages, safeGetReplyMessage } from "@utils/safeGetMessages";
import { getPrefixes } from "@utils/pluginManager";
import { CustomFile } from "teleproto/client/uploads";
import { createDirectoryInTemp } from "@utils/pathHelpers";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { safeGetMe } from "../utils/authGuards";
import { htmlEscape } from "@utils/html";
import { redactSecrets } from "@utils/security";
const prefixes = getPrefixes();
const mainPrefix = prefixes[0];

type DebugEntity = {
  className?: string;
  id?: unknown;
  firstName?: string;
  lastName?: string;
  username?: string;
  title?: string;
  bot?: boolean;
  verified?: boolean;
  premium?: boolean;
  broadcast?: boolean;
  participantsCount?: number;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function sendDebugDump(
  msg: Api.Message,
  trigger: Api.Message | undefined,
  filename: string,
  text: string
): Promise<void> {
  const escaped = `<blockquote expandable>${htmlEscape(text)}</blockquote>`;
  if (escaped.length <= 3500) {
    await msg.client?.sendMessage("me", {
      message: escaped,
      parseMode: "html",
    });
  } else {
    const buffer = Buffer.from(text, "utf-8");
    const dir = createDirectoryInTemp("debug");
    const safeName = filename.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const filePath = path.join(dir, safeName);
    fs.writeFileSync(filePath, buffer, { mode: 0o600 });
    const size = fs.statSync(filePath).size;
    await msg.client?.sendFile("me", {
      file: new CustomFile(safeName, size, filePath),
    });
    fs.unlinkSync(filePath);
  }
  await (trigger || msg).edit({
    text: "✅ 调试信息已脱敏并发送到 Saved Messages。",
  }).catch(async () => {
    await msg.client?.sendMessage(msg.peerId, {
      message: "✅ 调试信息已脱敏并发送到 Saved Messages。",
    });
  });
}

class DebugPlugin extends Plugin {

  description: string = `<code>${mainPrefix}id 回复一条消息 或 留空查看当前对话 或 消息链接 或 用户名 或 群组ID</code> - 获取详细的用户、群组或频道信息
<code>${mainPrefix}entity [id/@name] 或 回复一条消息 或 留空查看当前对话</code> - 获取 entity 信息
<code>${mainPrefix}msg 回复一条消息</code> - 获取 msg 信息
<code>${mainPrefix}echo 回复一条消息</code> - 尝试以原样回复
`;
  cmdHandlers: Record<
    string,
    (msg: Api.Message, trigger?: Api.Message) => Promise<void>
  > = {
    id: async (msg) => {
      const client = await getGlobalClient();
      let targetInfo = "";

      try {
        const [cmd, ...args] = msg.message.trim().split(/\s+/);
        const messageLink = args.join(" ");

        // 检查是否提供了参数（链接、用户名或群组ID）
        if (messageLink) {
          let parseResult: ParseResult | null = null;

          // 优先尝试解析Telegram链接
          if (messageLink.includes("t.me/")) {
            parseResult = await parseTelegramLink(client, messageLink);
          } 
          // 检查是否为群组ID（数字格式）
          else if (/^-?\d+$/.test(messageLink)) {
            const parsedInfo = await parseGroupId(client, messageLink);
            targetInfo = parsedInfo;
          } 
          else {
            // 直接输入用户名，尝试解析实体
            try {
              const username = messageLink.startsWith("@")
                ? messageLink
                : `@${messageLink}`;
              const entity = await client.getEntity(username);
              parseResult = {
                type: "entity",
                data: entity,
                info: `解析用户名成功 - ${username}`,
              };
            } catch (error: unknown) {
              parseResult = {
                type: "entity",
                data: null,
                info: `解析用户名失败: ${errorMessage(error)}`,
              };
            }
          }

          // 只有非群组ID的情况才处理parseResult
          if (!/^-?\d+$/.test(messageLink)) {
            if (parseResult && parseResult.data) {
              if (parseResult.type === "message") {
                // 消息链接解析结果
                const parsedMsg = parseResult.data as Api.Message;
                targetInfo += `🔗 ${parseResult.info}\n\n`;

                if (parsedMsg.senderId) {
                  targetInfo += await formatUserInfo(
                    client,
                    parsedMsg.senderId,
                    "LINK MESSAGE SENDER",
                    true
                  );
                  targetInfo += "\n";
                }
                targetInfo += await formatMessageInfo(parsedMsg);
                targetInfo += "\n";
                targetInfo += await formatChatInfo(client, parsedMsg);
              } else if (parseResult.type === "entity") {
                // 实体链接解析结果
                const entity = parseResult.data;
                targetInfo += `🔗 ${parseResult.info}\n\n`;
                targetInfo += await formatEntityInfo(entity);
              }
            } else {
              targetInfo = `❌ ${parseResult?.info || "无法解析链接或用户名"}`;
            }
          }
        } else {
          // 原有逻辑：如果有回复消息，优先显示回复信息
          if (msg.replyTo) {
            const repliedMsg = await safeGetReplyMessage(msg);
            if (repliedMsg?.senderId) {
              targetInfo += await formatUserInfo(
                client,
                repliedMsg.senderId,
                "REPLIED USER",
                true
              );
              targetInfo += "\n";
            }
          }

          // 显示消息详细信息
          targetInfo += await formatMessageInfo(msg);
          targetInfo += "\n";

          if (!msg.replyTo) {
            // 没有回复消息时，显示自己的信息
            targetInfo += await formatSelfInfo(client);
            targetInfo += "\n";
          }

          // 显示聊天信息
          targetInfo += await formatChatInfo(client, msg);
        }

        await msg.edit({
          text: targetInfo,
          parseMode: "html",
        });
      } catch (error: unknown) {
        await msg.edit({
          text: `获取信息时出错: ${errorMessage(error)}`,
        });
      }
    },

    entity: async (msg, trigger) => {
      const [cmd, ...args] = msg.message.trim().split(/\s+/);
      const input = args.join("");
      const reply = await safeGetReplyMessage(msg);
      const entity = await msg.client?.getEntity(
        input || reply?.senderId || msg.peerId
      );

      const txt = JSON.stringify(redactSecrets(entity), null, 2);
      console.log(txt);

      await sendDebugDump(msg, trigger, `entity_${entity?.id || "unknown"}.json`, txt);
    },
    msg: async (msg, trigger) => {
      const reply = await safeGetReplyMessage(msg);
      if (!reply) {
        await msg.edit({
          text: `请回复一条消息以获取详细信息。`,
        });
        return;
      }
      const txt = JSON.stringify(redactSecrets(reply), null, 2);
      console.log(txt);
      // if (reply.media) {
      //   console.log("media", JSON.stringify(reply.media, null, 2));
      // }

      await sendDebugDump(msg, trigger, `msg_${reply.id}.json`, txt);
    },


    echo: async (msg, trigger) => {
      const reply = await safeGetReplyMessage(msg);
      if (!reply) {
        await msg.edit({
          text: `请回复一条消息以尝试原样发出`,
        });
        return;
      }
      const txt = JSON.stringify(redactSecrets(reply), null, 2);
      console.log(txt);

      // gramjs 支持不全...
      // await (trigger || msg).reply({
      //   message: reply,
      //   formattingEntities: reply.entities,
      // });

      // 将消息中的媒体转换为可发送的 InputMedia（仅处理常见的照片/文件）
      const toInputMedia = (
        media: Api.TypeMessageMedia
      ): Api.TypeInputMedia | undefined => {
        try {
          if (media instanceof Api.MessageMediaPhoto && media.photo) {
            if (media.photo instanceof Api.Photo) {
              const inputPhoto = new Api.InputPhoto({
                id: media.photo.id,
                accessHash: media.photo.accessHash,
                fileReference: media.photo.fileReference,
              });
              return new Api.InputMediaPhoto({
                id: inputPhoto,
                ...(media.spoiler ? { spoiler: true } : {}),
                ...(media.ttlSeconds ? { ttlSeconds: media.ttlSeconds } : {}),
              });
            }
          }
          if (
            media instanceof Api.MessageMediaDocument &&
            media.document &&
            media.document instanceof Api.Document
          ) {
            const inputDoc = new Api.InputDocument({
              id: media.document.id,
              accessHash: media.document.accessHash,
              fileReference: media.document.fileReference,
            });
            return new Api.InputMediaDocument({
              id: inputDoc,
              ...(media.spoiler ? { spoiler: true } : {}),
              ...(media.ttlSeconds ? { ttlSeconds: media.ttlSeconds } : {}),
            });
          }
        } catch (e) {
          console.warn("[debug.echo] 构造 InputMedia 失败", e);
        }
        return undefined;
      };

      const inputMedia = reply.media ? toInputMedia(reply.media) : undefined;

      if (inputMedia) {
        await msg.client?.invoke(
          new Api.messages.SendMedia({
            peer: reply.chatId,
            message: reply.message || "",
            media: inputMedia,
            entities: reply.entities,
            ...(reply.replyTo
              ? {
                  replyTo: new Api.InputReplyToMessage({
                    replyToMsgId: reply.replyTo.replyToMsgId!,
                    quoteText: reply.replyTo.quoteText,
                    quoteEntities: reply.replyTo.quoteEntities,
                    quoteOffset: reply.replyTo.quoteOffset,
                    topMsgId: reply.replyTo.replyToTopId,
                  }),
                }
              : {}),
          })
        );
      } else {
        await msg.client?.invoke(
          new Api.messages.SendMessage({
            peer: reply.chatId,
            message: reply.message,
            entities: reply.entities,
            ...(reply.replyTo
              ? {
                  replyTo: new Api.InputReplyToMessage({
                    replyToMsgId: reply.replyTo.replyToMsgId!,
                    quoteText: reply.replyTo.quoteText,
                    quoteEntities: reply.replyTo.quoteEntities,
                    quoteOffset: reply.replyTo.quoteOffset,
                    topMsgId: reply.replyTo.replyToTopId,
                  }),
                }
              : {}),
          })
        );
      }
      await msg.delete();
    },
  };
}

// 解析结果接口
interface ParseResult {
  type: "message" | "entity";
  data: Api.Message | unknown;
  info?: string;
}

// 深度解析Telegram链接（支持消息链接和实体链接）
async function parseTelegramLink(
  client: TelegramClient,
  link: string
): Promise<ParseResult | null> {
  try {
    const cleanLink = link.trim();

    // 消息链接格式: https://t.me/username/123 或 https://t.me/c/123456/789
    const messageRegex =
      /https?:\/\/t\.me\/(?:c\/)?([^\/]+)\/(\d+)(?:\?[^#]*)?(?:#.*)?$/;
    const messageMatch = cleanLink.match(messageRegex);

    if (messageMatch) {
      const [, chatIdentifier, messageId] = messageMatch;
      let chatId: string;

      if (cleanLink.includes("/c/")) {
        // 私有群组/频道链接: https://t.me/c/1272003941/940776
        // chatIdentifier = "1272003941", 需要加上 -100 前缀
        chatId = `-100${chatIdentifier}`;
      } else {
        // 公开频道/群组链接: https://t.me/username/123
        // 确保用户名以 @ 开头
        chatId = chatIdentifier.startsWith("@")
          ? chatIdentifier
          : `@${chatIdentifier}`;
      }

      const messages = await safeGetMessages(client, chatId, {
        ids: [parseInt(messageId)],
      });

      if (messages.length > 0) {
        return {
          type: "message",
          data: messages[0],
          info: `解析消息链接成功 - Chat: ${chatId}, Message: ${messageId}`,
        };
      }
    }

    // 实体链接格式: https://t.me/username 或 https://t.me/joinchat/xxx
    const entityRegex = /https?:\/\/t\.me\/([^\/\?#]+)(?:\?[^#]*)?(?:#.*)?$/;
    const entityMatch = cleanLink.match(entityRegex);

    if (entityMatch) {
      const [, identifier] = entityMatch;

      // 处理 joinchat 链接
      if (identifier.startsWith("joinchat/")) {
        return {
          type: "entity",
          data: null,
          info: `暂不支持 joinchat 链接解析`,
        };
      }

      // 解析用户名或频道
      const username = identifier.startsWith("@")
        ? identifier
        : `@${identifier}`;
      const entity = await client.getEntity(username);

      return {
        type: "entity",
        data: entity,
        info: `解析实体链接成功 - ${username}`,
      };
    }

    return null;
  } catch (error: unknown) {
    console.error("解析链接失败:", error);
    return {
      type: "entity",
      data: null,
      info: `解析失败: ${errorMessage(error)}`,
    };
  }
}

// 格式化实体信息
async function formatEntityInfo(entity: unknown): Promise<string> {
  try {
    const entityData = entity as DebugEntity;
    let info = "";

    if (entityData.className === "User") {
      info += `<b>USER</b>\n`;
      info +=
        `· Name: ${entityData.firstName || ""} ${entityData.lastName || ""}`.trim() +
        "\n";
      info += `· Username: ${
        entityData.username ? "@" + entityData.username : "N/A"
      }\n`;
      info += `· ID: <code>${entityData.id}</code>\n`;
      if (entityData.bot) info += `· Type: Bot\n`;
      if (entityData.verified) info += `· Verified\n`;
      if (entityData.premium) info += `· Premium\n`;
    } else if (entityData.className === "Channel") {
      const isChannel = entityData.broadcast;
      info += `<b>${isChannel ? "CHANNEL" : "SUPERGROUP"}</b>\n`;
      info += `· Title: ${entityData.title}\n`;
      info += `· Username: ${
        entityData.username ? "@" + entityData.username : "N/A"
      }\n`;
      const entityId = String(entityData.id);
      const fullId = entityId.startsWith("-100") ? entityId : `-100${entityId}`;
      info += `· ID: <code>${fullId}</code>\n`;
      if (entityData.verified) info += `· Verified\n`;
      if (entityData.participantsCount)
        info += `· Members: ${entityData.participantsCount}\n`;
    } else if (entityData.className === "Chat") {
      info += `<b>GROUP</b>\n`;
      info += `· Title: ${entityData.title}\n`;
      const groupId = String(entityData.id);
      const fullGroupId = groupId.startsWith("-") ? groupId : `-${groupId}`;
      info += `· ID: <code>${fullGroupId}</code>\n`;
      if (entityData.participantsCount)
        info += `· Members: ${entityData.participantsCount}\n`;
    } else {
      info += `<b>ENTITY</b>\n`;
      info += `· Type: ${entityData.className || "unknown"}\n`;
      info += `· ID: <code>${entityData.id || "N/A"}</code>\n`;
    }

    return info;
  } catch (error: unknown) {
    return `❌ 格式化实体信息失败: ${errorMessage(error)}`;
  }
}

// 格式化消息信息
async function formatMessageInfo(msg: Api.Message): Promise<string> {
  try {
    let info = `<b>MESSAGE</b>\n`;

    if (msg.replyTo?.replyToMsgId) {
      info += `· Reply to: <code>${msg.replyTo.replyToMsgId}</code>\n`;
    }

    info += `· ID: <code>${msg.id}</code>\n`;
    info += `· Sender: <code>${msg.senderId || "N/A"}</code>\n`;
    info += `· Chat: <code>${msg.chatId || "N/A"}</code>\n`;

    if (msg.date) {
      info += `· Time: ${new Date(msg.date * 1000).toLocaleString("zh-CN")}\n`;
    }

    // 增强转发消息信息显示
    if (msg.fwdFrom) {
      info += `\n<b>FORWARD INFO</b>\n`;
      
      // 原始发送者信息
      if (msg.fwdFrom.fromId) {
        const fromIdStr = msg.fwdFrom.fromId.toString();
        info += `· Original Sender: <code>${fromIdStr}</code>\n`;
        
        // 尝试获取原始发送者详细信息
        try {
          const client = await getGlobalClient();
          if (client) {
            const originalSender = await client.getEntity(msg.fwdFrom.fromId);
            if (originalSender.className === "User") {
              const user = originalSender as Api.User;
              const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "N/A";
              info += `· Original Name: ${fullName}\n`;
              if (user.username) {
                info += `· Original Username: @${user.username}\n`;
              }
            } else if (originalSender.className === "Channel") {
              const channel = originalSender as Api.Channel;
              info += `· Original Channel: ${channel.title}\n`;
              if (channel.username) {
                info += `· Original Username: @${channel.username}\n`;
              }
              // 显示完整的频道/群组ID
              const channelId = channel.id.toString();
              const fullChannelId = channelId.startsWith("-100") ? channelId : `-100${channelId}`;
              info += `· Original Chat ID: <code>${fullChannelId}</code>\n`;
            } else if (originalSender.className === "Chat") {
              const chat = originalSender as Api.Chat;
              info += `· Original Group: ${chat.title}\n`;
              const groupId = chat.id.toString();
              const fullGroupId = groupId.startsWith("-") ? groupId : `-${groupId}`;
              info += `· Original Chat ID: <code>${fullGroupId}</code>\n`;
            }
          }
        } catch (error) {
          // 如果无法获取详细信息，保持原有显示
        }
      }
      
      // 原始消息ID（用于频道消息）
      if (msg.fwdFrom.channelPost) {
        info += `· Original Message ID: <code>${msg.fwdFrom.channelPost}</code>\n`;
      }
      
      // 转发时间
      if (msg.fwdFrom.date) {
        info += `· Forward Time: ${new Date(msg.fwdFrom.date * 1000).toLocaleString("zh-CN")}\n`;
      }
      
      // 如果有签名
      if (msg.fwdFrom.postAuthor) {
        info += `· Post Author: ${msg.fwdFrom.postAuthor}\n`;
      }
      
      // 如果是从私聊转发的消息，显示隐藏用户信息
      if (msg.fwdFrom.fromName && !msg.fwdFrom.fromId) {
        info += `· Hidden User: ${msg.fwdFrom.fromName}\n`;
      }
    }

    return info;
  } catch (error: unknown) {
    return `<b>MESSAGE</b>\nError: ${errorMessage(error)}\n`;
  }
}

// 格式化用户信息
async function formatUserInfo(
  client: TelegramClient,
  userId: EntityLike,
  title: string = "USER",
  showCommonGroups: boolean = true
): Promise<string> {
  try {
    const user = await client.getEntity(userId);
    let info = `<b>${title}</b>\n`;

    if (user.className === "User") {
      const userEntity = user as Api.User;
      const fullName =
        [userEntity.firstName, userEntity.lastName].filter(Boolean).join(" ") ||
        "N/A";

      info += `· Name: ${fullName}\n`;
      info += `· Username: ${
        userEntity.username ? "@" + userEntity.username : "N/A"
      }\n`;
      info += `· ID: <code>${userEntity.id}</code>\n`;

      if (userEntity.bot) info += `· Type: Bot\n`;
      if (userEntity.verified) info += `· Verified\n`;
      if (userEntity.premium) info += `· Premium\n`;
    } else {
      info += `· ID: <code>${user.id}</code>\n`;
      info += `· Type: ${user.className}\n`;
    }

    return info;
  } catch (error: unknown) {
    return `<b>${title}</b>\nError: ${errorMessage(error)}\n`;
  }
}

// 格式化自己的信息
async function formatSelfInfo(client: TelegramClient): Promise<string> {
  try {
    const me = await safeGetMe(client);
    if (!me) return "";
    return await formatUserInfo(client, me.id, "SELF", false);
  } catch (error: unknown) {
    return `<b>SELF</b>\nError: ${errorMessage(error)}\n`;
  }
}

// 格式化聊天信息
async function formatChatInfo(
  client: TelegramClient,
  msg: Api.Message
): Promise<string> {
  try {
    if (!msg.chatId) {
      return `<b>CHAT</b>\nError: No chat ID\n`;
    }

    const chat = await client.getEntity(msg.chatId);
    let info = "";

    if (chat.className === "User") {
      info += await formatUserInfo(client, chat.id, "PRIVATE", false);
    } else if (
      chat.className === "Chat" ||
      chat.className === "ChatForbidden"
    ) {
      const chatEntity = chat as Api.Chat;
      info += `<b>GROUP</b>\n`;
      info += `· Title: ${chatEntity.title}\n`;
      const groupId = chatEntity.id.toString();
      const fullGroupId = groupId.startsWith("-") ? groupId : `-${groupId}`;
      info += `· ID: <code>${fullGroupId}</code>\n`;
    } else if (chat.className === "Channel") {
      const channelEntity = chat as Api.Channel;
      const isChannel = channelEntity.broadcast;
      info += `<b>${isChannel ? "CHANNEL" : "GROUP"}</b>\n`;
      info += `· Title: ${channelEntity.title}\n`;
      info += `· Username: ${
        channelEntity.username ? "@" + channelEntity.username : "N/A"
      }\n`;
      const chatId = channelEntity.id.toString();
      const fullChatId = chatId.startsWith("-100") ? chatId : `-100${chatId}`;
      info += `· ID: <code>${fullChatId}</code>\n`;

      if (channelEntity.verified) {
        info += `· Verified\n`;
      }
    }

    return info;
  } catch (error: unknown) {
    return `<b>CHAT</b>\nError: ${errorMessage(error)}\n`;
  }
}

// 解析群组ID功能
async function parseGroupId(client: TelegramClient, chatId: string): Promise<string> {
  try {
    let info = `🆔 <b>群组ID解析结果</b>\n\n`;
    info += `· 输入ID: <code>${chatId}</code>\n`;

    // 尝试获取群组信息
    let entity: DebugEntity | null = null;
    let entityFound = false;
    
    try {
      entity = (await client.getEntity(chatId)) as DebugEntity;
      entityFound = true;
    } catch (error: unknown) {
      info += `· 状态: ❌ 无法访问此群组\n`;
      info += `· 错误: ${errorMessage(error)}\n\n`;
    }

    if (entityFound && entity) {
      info += `· 状态: ✅ 群组信息获取成功\n\n`;
      
      // 群组基本信息
      info += `<b>📋 群组信息</b>\n`;
      
      if (entity.className === "Channel") {
        const channel = entity as Api.Channel;
        const isChannel = channel.broadcast;
        info += `· 类型: ${isChannel ? "频道" : "超级群组"}\n`;
        info += `· 名称: ${channel.title}\n`;
        
        if (channel.username) {
          info += `· 用户名: @${channel.username}\n`;
          info += `· 公开链接: https://t.me/${channel.username}\n`;
        } else {
          info += `· 用户名: 无（私有群组）\n`;
        }
        
        // 生成跳转链接
        const numericId = channel.id.toString().replace("-100", "");
        info += `· 私有链接: https://t.me/c/${numericId}/1\n`;
        
        if (channel.participantsCount) {
          info += `· 成员数: ${channel.participantsCount}\n`;
        }
        
        if (channel.verified) {
          info += `· 已验证: ✅\n`;
        }
        
      } else if (entity.className === "Chat") {
        const chat = entity as Api.Chat;
        info += `· 类型: 普通群组\n`;
        info += `· 名称: ${chat.title}\n`;
        info += `· 用户名: 无（普通群组无用户名）\n`;
        
        if (chat.participantsCount) {
          info += `· 成员数: ${chat.participantsCount}\n`;
        }
        
      } else {
        info += `· 类型: ${entity.className}\n`;
        if (entity.title) {
          info += `· 名称: ${entity.title}\n`;
        }
      }
      
    } else {
      // 即使无法访问，也提供一些基本的ID解析信息
      info += `<b>📋 ID格式分析</b>\n`;
      
      if (chatId.startsWith("-100")) {
        const numericId = chatId.replace("-100", "");
        info += `· 类型: 超级群组/频道ID\n`;
        info += `· 数字ID: ${numericId}\n`;
        info += `· 私有链接: https://t.me/c/${numericId}/1\n`;
      } else if (chatId.startsWith("-")) {
        info += `· 类型: 普通群组ID\n`;
      } else {
        info += `· 类型: 用户ID或其他\n`;
      }
    }

    info += `\n<b>🔗 可用链接格式</b>\n`;
    if (entityFound && entity && entity.username) {
      info += `· 公开链接: https://t.me/${entity.username}\n`;
    }
    
    if (chatId.startsWith("-100")) {
      const numericId = chatId.replace("-100", "");
      info += `· 私有链接: https://t.me/c/${numericId}/1\n`;
      info += `· 邀请链接: 需要管理员权限生成\n`;
    }

    return info;
    
  } catch (error: unknown) {
    return `❌ 解析群组ID时发生错误: ${errorMessage(error)}`;
  }
}

export default new DebugPlugin();
