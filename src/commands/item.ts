// commands/item.ts
/**
 * item 命令处理器（使用 Durable Object 存储）
 *
 * 支持：
 *  - item create    (管理员功能：回复一条消息并发送该命令，创建物品)
 *  - item list      (直接发送：查看自己的物品；回复某人消息发送：查看该人的物品)
 *  - item use 1     (使用并消费自己的第 1 个物品；支持 #1 格式)
 *  - item send 1    (回复某人消息并发送该命令：把自己的第 1 个物品送给对方)
 *  - item stats     (管理员功能：查看所有用户的物品统计)
 *
 * 存储：使用 env.ITEM_DO
 */

import TgMessage, { ParsedUpdate, EnvLike } from "../lib/tgMessage";
import { deleteMarkup } from "../lib/util";
import {
  getUserItems,
  addItemToUser,
  removeItemFromUser,
  transferItem,
  getAllItemsStats
} from "../lib/itemService";

// 管理员列表（应与 coin.ts 保持一致或从 liveConfig 导入）
const ADMIN_UIDS: number[] = [8080375150, 5621587953, 7804622477, 7476641553, 1019896885];

export type Env = EnvLike & {
  ITEM_DO: DurableObjectNamespace; // 从 KV 改为 DO
};

function makeMessageLink(chatId: number, messageId: number): string {
  const abs = String(chatId).startsWith("-100")
    ? String(chatId).slice(4)
    : String(Math.abs(chatId));
  return `https://t.me/c/${abs}/${messageId}`;
}

/**
 * 解析序号参数：接受 "1" 或 "#1" 或 "use#1" 等形式，返回 1-based 索引的数字或 null
 */
function parseIndexToken(token: string | undefined): number | null {
  if (!token) return null;
  const m = token.match(/#?(\d+)/);
  if (!m) return null;
  const idx = parseInt(m[1], 10);
  if (Number.isNaN(idx) || idx < 1) return null;
  return idx;
}

/**
 * 检查是否是管理员
 */
function isAdmin(userId: number): boolean {
  return ADMIN_UIDS.includes(userId);
}

/**
 * handleItem 主入口
 */
export async function handleItem(parsed: ParsedUpdate, env: Env) {
  console.log("[Item] handleItem invoked", {
    command: parsed.command,
    args: parsed.args,
    isReply: parsed.isReply,
    fromId: parsed.from?.id
  });

  const chatId = parsed.chatId!;
  const threadId = parsed.threadId;
  const fromId = parsed.from?.id;
  const fromName = parsed.from?.first_name || `用户${fromId}`;
  const reply = parsed.replyToMessage;

  // 确保用户已登录
  if (!fromId) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: "❌ 无法识别用户身份",
      message_thread_id: threadId,
      reply_markup: deleteMarkup
    });
    return;
  }

  const args = parsed.args || [];
  const sub = args[0]?.toLowerCase() || "";
  const rest = args.slice(1);

  // 1) item create —— 管理员功能
  if (sub === "create") {
    if (!isAdmin(fromId)) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: "❌ 此功能仅限管理员使用",
        message_thread_id: threadId,
        reply_markup: deleteMarkup
      });
      return;
    }

    if (!parsed.isReply || !reply) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: "⚠️ 请回复一条消息以创建物品，格式：/item create [备注]",
        message_thread_id: threadId,
        reply_markup: deleteMarkup
      });
      return;
    }

    // 获取物品内容
    let content = reply.text ?? reply.caption ?? "";
    if (!content) {
      if (reply.photo) content = "[图片]";
      else if (reply.video) content = "[视频]";
      else if (reply.document) content = `[文件 ${reply.document.file_name || ""}]`;
      else if (reply.sticker) content = `[贴纸 ${reply.sticker.emoji || ""}]`;
      else content = "[多媒体内容]";
    }

    const remark = rest.join(" ").trim() || "物品";
    const link = makeMessageLink(chatId, reply.message_id);
    
    // 确定物品所有者：如果回复了他人消息，则物品属于被回复者；否则属于消息发送者
    const targetUserId = reply.from?.id || fromId;
    const targetUserName = reply.from?.first_name || `用户${targetUserId}`;

    const item = {
      remark,
      content: content.slice(0, 500), // 限制内容长度
      link,
      timestamp: new Date().toISOString(),
      createdBy: fromId, // 记录创建者
      originalMessageId: reply.message_id
    };

    // 使用 itemService 添加物品
    const result = await addItemToUser(env.ITEM_DO, targetUserId, item);
    
    if (!result.ok) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ 创建物品失败：${result.error || "未知错误"}`,
        message_thread_id: threadId,
        reply_markup: deleteMarkup
      });
      return;
    }

    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `✅ 已为 ${targetUserName} 创建物品：<a href="${link}">${remark}</a>（共 ${result.count} 件）`,
      parse_mode: "HTML",
      message_thread_id: threadId,
      reply_markup: deleteMarkup
    });
    return;
  }

  // 2) item stats —— 管理员功能：查看统计
  if (sub === "stats") {
    if (!isAdmin(fromId)) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: "❌ 此功能仅限管理员使用",
        message_thread_id: threadId,
        reply_markup: deleteMarkup
      });
      return;
    }

    const start = rest[0]; // 使用 start 而不是 cursor
    const result = await getAllItemsStats(env.ITEM_DO, 20, start);
    
    if (result.items.length === 0) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: "📭 暂无物品数据",
        message_thread_id: threadId,
        reply_markup: deleteMarkup
      });
      return;
    }

    let text = `📊 物品系统统计（显示前${result.items.length}位用户）\n\n`;
    
    for (const stat of result.items) {
      // 尝试获取用户名
      let userName = `用户${stat.userId}`;
      try {
        const member = await TgMessage.fetchChatMember(env, chatId, parseInt(stat.userId));
        userName = member.first_name;
      } catch (e) {
        // 保持默认用户名
      }
      
      text += `• ${userName}：${stat.count} 件物品\n`;
      
      // 显示前几个物品的简要信息
      if (stat.items && stat.items.length > 0) {
        stat.items.slice(0, 3).forEach((item, idx) => {
          text += `  ${idx + 1}. ${item.remark?.slice(0, 20)}${item.remark?.length > 20 ? '...' : ''}\n`;
        });
      }
      
      text += "\n";
    }

    // 添加分页信息 - 使用 nextStart 而不是 cursor
    const replyMarkup = result.nextStart ? {
      inline_keyboard: [[
        { 
          text: "下一页", 
          callback_data: JSON.stringify({ 
            type: "item_stats", 
            start: result.nextStart 
          }) 
        }
      ]]
    } : deleteMarkup;

    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: text,
      parse_mode: "HTML",
      message_thread_id: threadId,
      reply_markup: replyMarkup
    });
    return;
  }

  // 3) item list —— 查看物品列表
  if (sub === "list" || sub === "") {
    // 确定查看的目标用户
    let targetUserId = fromId;
    let viewingName = fromName;
    
    if (parsed.isReply && reply && reply.from && reply.from.id) {
      targetUserId = reply.from.id;
      viewingName = reply.from.first_name || `用户${targetUserId}`;
    }

    const items = await getUserItems(env.ITEM_DO, targetUserId);
    
    if (items.length === 0) {
      const text = (targetUserId === fromId)
        ? `📭 ${fromName}，你还没有任何物品`
        : `📭 ${viewingName} 暂无物品`;
      
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text,
        message_thread_id: threadId,
        reply_markup: deleteMarkup
      });
      return;
    }

    let body = "";
    items.forEach((item, i) => {
      const remark = item.remark || "物品";
      const preview = item.content?.slice(0, 30) || "";
      body += `${i + 1}. <a href="${item.link}">${remark}</a> - ${preview}${preview.length === 30 ? '...' : ''}\n`;
    });

    const text = (targetUserId === fromId)
      ? `🎒 ${fromName} 的物品（共 ${items.length} 件）：\n<blockquote expandable>${body}</blockquote>`
      : `🎁 ${viewingName} 的物品（共 ${items.length} 件）：\n<blockquote expandable>${body}</blockquote>`;

    await TgMessage.sendText(env, {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      message_thread_id: threadId,
      reply_markup: deleteMarkup
    });
    return;
  }

  // 4) item use —— 使用物品
  if (sub === "use" || /^use#?\d+$/i.test(sub)) {
    let idx: number | null = null;
    
    if (/^use#?\d+$/i.test(sub)) {
      idx = parseIndexToken(sub.replace(/^use/i, ""));
    } else {
      idx = parseIndexToken(rest[0]);
    }
    
    if (!idx) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: "⚠️ 请指定要使用的物品序号，例如：/item use 1 或 /item use #1",
        message_thread_id: threadId,
        reply_markup: deleteMarkup
      });
      return;
    }

    // 使用 itemService 移除物品（索引从0开始）
    const result = await removeItemFromUser(env.ITEM_DO, fromId, idx - 1);
    
    if (!result.ok) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ 使用物品失败：${result.error || "未知错误"}`,
        message_thread_id: threadId,
        reply_markup: deleteMarkup
      });
      return;
    }

    // 显示物品内容
    const item = result.removedItem;
    const useText = `✨ ${fromName} 使用了物品：<a href="${item.link}">${item.remark || "物品"}</a>\n\n${item.content}`;
    
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: useText,
      parse_mode: "HTML",
      message_thread_id: threadId,
      reply_markup: deleteMarkup
    });
    return;
  }

  // 5) item send —— 赠送物品
  if (sub === "send" || /^send#?\d+$/i.test(sub)) {
    if (!parsed.isReply || !reply || !reply.from || !reply.from.id) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: "⚠️ 请回复目标用户的消息来赠送物品，例如：/item send 1",
        message_thread_id: threadId,
        reply_markup: deleteMarkup
      });
      return;
    }

    // 解析序号
    let idx: number | null = null;
    if (/^send#?\d+$/i.test(sub)) {
      idx = parseIndexToken(sub.replace(/^send/i, ""));
    } else {
      idx = parseIndexToken(rest[0]);
    }
    
    if (!idx) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: "⚠️ 请指定要赠送的物品序号，例如：/item send 1 或 /item send #1",
        message_thread_id: threadId,
        reply_markup: deleteMarkup
      });
      return;
    }

    const targetUserId = reply.from.id;
    const targetName = reply.from.first_name || `用户${targetUserId}`;

    // 不能赠送给自己
    if (targetUserId === fromId) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: "⚠️ 不能赠送物品给自己，请使用 /item use 来使用物品",
        message_thread_id: threadId,
        reply_markup: deleteMarkup
      });
      return;
    }

    // 使用 itemService 转移物品
    const result = await transferItem(env, env.ITEM_DO, fromId, targetUserId, idx - 1);
    
    if (!result.ok) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ 赠送物品失败：${result.error || "未知错误"}`,
        message_thread_id: threadId,
        reply_markup: deleteMarkup
      });
      return;
    }

    // 获取赠送后的物品数量（可选）
    const senderItems = await getUserItems(env.ITEM_DO, fromId);
    const receiverItems = await getUserItems(env.ITEM_DO, targetUserId);

    const text = `🎁 ${fromName} 已将一件物品赠送给 ${targetName}\n` +
                 `📦 发送者剩余：${senderItems.length} 件\n` +
                 `📦 接收者现有：${receiverItems.length} 件`;

    await TgMessage.sendText(env, {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      message_thread_id: threadId,
      reply_markup: deleteMarkup
    });
    return;
  }

  // 6) item help —— 帮助信息
  if (sub === "help") {
    let helpText = `📦 <b>物品系统使用指南</b>\n\n`;
    
    if (isAdmin(fromId)) {
      helpText += `👑 <b>管理员命令：</b>\n` +
                 `/item create - 回复消息创建物品（可加备注）\n` +
                 `/item stats - 查看所有用户物品统计\n\n`;
    }
    
    helpText += `👤 <b>用户命令：</b>\n` +
               `/item - 查看自己的物品列表\n` +
               `/item list - 同上\n` +
               `/item use <序号> - 使用物品\n` +
               `/item send <序号> - 回复他人消息赠送物品\n\n` +
               `📝 <b>使用示例：</b>\n` +
               `• /item use 1（使用第1件物品）\n` +
               `• /item use #1（同上）\n` +
               `• /item send 2（赠送第2件物品给被回复者）`;

    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: helpText,
      parse_mode: "HTML",
      message_thread_id: threadId,
      reply_markup: deleteMarkup
    });
    return;
  }

  // 7) item search —— 搜索物品（可选功能）
  if (sub === "search") {
    const keyword = rest.join(" ");
    if (!keyword) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: "⚠️ 请输入搜索关键词，例如：/item search 重要",
        message_thread_id: threadId,
        reply_markup: deleteMarkup
      });
      return;
    }

    const items = await getUserItems(env.ITEM_DO, fromId);
    const filtered = items.filter(item => 
      (item.remark && item.remark.includes(keyword)) ||
      (item.content && item.content.includes(keyword))
    );

    if (filtered.length === 0) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `🔍 未找到包含"${keyword}"的物品`,
        message_thread_id: threadId,
        reply_markup: deleteMarkup
      });
      return;
    }

    let body = "";
    filtered.forEach((item, i) => {
      const remark = item.remark || "物品";
      const preview = item.content?.slice(0, 30) || "";
      body += `${i + 1}. <a href="${item.link}">${remark}</a> - ${preview}${preview.length === 30 ? '...' : ''}\n`;
    });

    const text = `🔍 ${fromName} 的搜索"${keyword}"结果（共 ${filtered.length} 件）：\n<blockquote expandable>${body}</blockquote>`;

    await TgMessage.sendText(env, {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      message_thread_id: threadId,
      reply_markup: deleteMarkup
    });
    return;
  }

  // 未知命令，显示帮助
  const unknownText = `❓ 未知命令，请输入以下命令之一：\n` +
                     `/item - 查看自己的物品\n` +
                     `/item help - 显示完整帮助\n` +
                     `/item search <关键词> - 搜索物品\n` +
                     (isAdmin(fromId) ? `/item create - 创建物品（管理员）\n` : "");

  await TgMessage.sendText(env, {
    chat_id: chatId,
    text: unknownText,
    message_thread_id: threadId,
    reply_markup: deleteMarkup
  });
}

export default handleItem;