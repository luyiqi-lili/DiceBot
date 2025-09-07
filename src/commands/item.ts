// commands/item.ts
/**
 * item 命令处理器
 *
 * 支持：
 *  - item create    (回复一条消息并发送该命令，创建物品)
 *  - item list      (直接发送：查看自己的物品；回复某人消息发送：查看该人的物品)
 *  - item use 1     (使用并消费自己的第 1 个物品；支持 #1 格式)
 *  - item send 1    (回复某人消息并发送该命令：把自己的第 1 个物品送给对方)
 *
 * 存储：使用 env.NEWS_STORE，key = item:user:<uid>
 *
 * 注：风格、日志与 book.ts 保持一致，方便调试。
 */

import TgMessage, { ParsedUpdate, EnvLike } from "../lib/tgMessage";
import { deleteMarkup } from "../lib/util";

export type Env = EnvLike & {
  ITEM_STORE: KVNamespace;
};

function getUserKey(userId: number): string {
  return `item:user:${userId}`;
}

function makeMessageLink(chatId: number, messageId: number): string {
  // 与 book.ts 一致，处理 -100 前缀的私有 chat 链接
  const abs = String(chatId).startsWith("-100")
    ? String(chatId).slice(4)
    : String(Math.abs(chatId));
  return `https://t.me/c/${abs}/${messageId}`;
}

async function loadList(env: Env, uid: number) {
  const raw = await env.ITEM_STORE.get(getUserKey(uid));
  const list = raw ? (JSON.parse(raw) as Array<any>) : [];
  console.log(`[Item] loadList ${uid}, count=${list.length}`);
  return list;
}
async function saveList(env: Env, uid: number, list: any[]) {
  await env.ITEM_STORE.put(getUserKey(uid), JSON.stringify(list));
  console.log(`[Item] saveList ${uid}, new count=${list.length}`);
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
 * handleItem 主入口
 */
export async function handleItem(parsed: ParsedUpdate, env: Env) {
  console.log("[Item] handleItem invoked, command:", parsed.command, "args:", parsed.args, "isReply:", parsed.isReply);

  const chatId = parsed.chatId!;
  const threadId = parsed.threadId;
  const fromId = parsed.from?.id;
  const fromName = parsed.from?.first_name || `用户${fromId}`;
  const reply = parsed.replyToMessage;

  // 参数解析： parsed.args 的第一个为子命令（create/list/use/send），其余为参数
  const sub = (parsed.args && parsed.args.length > 0) ? parsed.args[0] : "";
  const rest = (parsed.args && parsed.args.length > 1) ? parsed.args.slice(1) : [];
  console.log("[Item] subcommand:", sub, "rest:", rest);

  // 1) item create —— 必须回复一条消息（最好是自己的消息，按需求这里要求回复自己的消息）
  if (sub === "create") {
    console.log("[Item] create invoked, isReply:", parsed.isReply);

    if (!parsed.isReply || !reply) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `⚠️ 请以回复的方式对一条消息发送 /item create 来创建物品（只能回复自己的消息）。`,
        message_thread_id: threadId,
        reply_markup: deleteMarkup
      });
      return;
    }

    // 要求回复的是自己的消息（reply.from.id === fromId）
    if (reply.from?.id !== fromId) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `⚠️ 创建物品需要回复你自己的消息以作为物品内容。`,
        message_thread_id: threadId,
        reply_markup: deleteMarkup
      });
      return;
    }

    // 取内容：优先 text -> caption -> 来自媒体的简单标记
    let content = reply.text ?? reply.caption ??rest[0] ??"";
    if (!content) {
      // 简单媒体描述
      if (reply.photo) content = "[图片]";
      else if (reply.video) content = "[视频]";
      else if (reply.document) content = `[文件 ${reply.document.file_name || ""}]`;
      else content = "[未识别内容]";
    }

    const remark = rest.join(" ").trim() || "物品";
    const link = makeMessageLink(chatId, reply.message_id);
    const list = await loadList(env, fromId);
    // 限制每人最多 200 件物品，超出则删除最早一条
    if (list.length >= 200) {
      list.shift();
      console.log("[Item] 达到上限，删除最旧条目");
    }
    list.push({ remark, content, link, timestamp: new Date().toISOString() });
    await saveList(env, fromId, list);

    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `✅ 已创建物品：<a href="${link}">${remark}</a>（共 ${list.length} 件）`,
      parse_mode: "HTML",
      message_thread_id: threadId,
      reply_markup: deleteMarkup
    });
    return;
  }

  // 2) item list —— 直接查看自己的；回复某人则查看该人的物品
  if (sub === "list" || sub === "") {
    // If user only typed "/item" or "/item list" both handled here.
    // If user replied to someone,查看被回复人的物品；否则查看自己的物品
    let targetId = fromId;
    let viewingName = fromName;
    if (parsed.isReply && reply && reply.from && reply.from.id) {
      targetId = reply.from.id;
      viewingName = reply.from.first_name || `用户${targetId}`;
    }

    console.log(`[Item] list for user ${targetId} (viewer: ${fromId})`);
    const list = await loadList(env, targetId);
    if (list.length === 0) {
      const text = (targetId === fromId)
        ? `📭 ${fromName}，你还没有任何物品，回复一条消息并发送 /item create 即可创建物品～`
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
    list.forEach((e, i) => {
      const remark = e.remark || "物品";
      body += `${i + 1}. <a href="${e.link}">${remark}</a>\n`;
    });

    const text = (targetId === fromId)
      ? `🎒 ${fromName} 的物品：<blockquote expandable>${body}</blockquote>`
      : `🎁 ${viewingName} 的物品：<blockquote expandable>${body}</blockquote>`;

    await TgMessage.sendText(env, {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      message_thread_id: threadId,
      reply_markup: deleteMarkup
    });
    return;
  }

  // 3) item use <idx> 或 item use#<idx>
  if (sub === "use" || /^use#?\d+$/i.test(sub)) {
    // 可能形式：
    // /item use 1
    // /item use #1
    // /item use#1 （当 parse 将全部当作一个 token 时）
    // /item use  （缺参数）
    let idx = null;
    if (/^use#?\d+$/i.test(sub)) {
      // sub itself 包含序号
      idx = parseIndexToken(sub.replace(/^use/i, ""));
    } else {
      idx = parseIndexToken(rest[0]);
    }
    if (!idx) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `⚠️ 请指定要使用的物品序号，例如：/item use 1 或 /item use #1`,
        message_thread_id: threadId,
        reply_markup: deleteMarkup
      });
      return;
    }

    const list = await loadList(env, fromId);
    if (idx < 1 || idx > list.length) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `⚠️ 无效序号：${idx}（当前共 ${list.length} 件）`,
        message_thread_id: threadId,
        reply_markup: deleteMarkup
      });
      return;
    }

    const item = list.splice(idx - 1, 1)[0];
    await saveList(env, fromId, list);

    // 使用效果：在当前线程发送该物品的内容，并注明来源
    const useText = `✅ ${fromName} 使用了物品：<a href="${item.link}">${item.remark || "物品"}</a>\n\n${item.content}`;
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: useText,
      parse_mode: "HTML",
      message_thread_id: threadId,
      reply_markup: deleteMarkup
    });
    return;
  }

  // 4) item send <idx> —— 必须回复要送达的目标用户的消息
  if (sub === "send" || /^send#?\d+$/i.test(sub)) {
    if (!parsed.isReply || !reply || !reply.from || !reply.from.id) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `⚠️ 请以回复目标用户的消息的方式发送 /item send <序号> 来赠送物品。`,
        message_thread_id: threadId,
        reply_markup: deleteMarkup
      });
      return;
    }

    // parse index
    let idx = null;
    if (/^send#?\d+$/i.test(sub)) {
      idx = parseIndexToken(sub.replace(/^send/i, ""));
    } else {
      idx = parseIndexToken(rest[0]);
    }
    if (!idx) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `⚠️ 请指定要赠送的物品序号，例如：/item send 1 或 /item send #1`,
        message_thread_id: threadId,
        reply_markup: deleteMarkup
      });
      return;
    }

    const targetId = reply.from.id;
    const targetName = reply.from.first_name || `用户${targetId}`;

    // 不能把物品送给自己（建议）
    if (targetId === fromId) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `⚠️ 无需将物品赠送给自己，直接使用 /item use ${idx} 即可。`,
        message_thread_id: threadId,
        reply_markup: deleteMarkup
      });
      return;
    }

    const list = await loadList(env, fromId);
    if (idx < 1 || idx > list.length) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `⚠️ 无效序号：${idx}（你当前共 ${list.length} 件）`,
        message_thread_id: threadId,
        reply_markup: deleteMarkup
      });
      return;
    }

    const item = list.splice(idx - 1, 1)[0];
    await saveList(env, fromId, list);

    // 将物品加入目标用户列表（append）
    const targetList = await loadList(env, targetId);
    if (targetList.length >= 200) targetList.shift();
    targetList.push(item);
    await saveList(env, targetId, targetList);

    // 通知群组：赠送成功
    const text = `🎁 ${fromName} 已将物品 <a href="${item.link}">${item.remark || "物品"}</a> 赠送给 ${targetName}（${targetList.length} 件）`;
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      message_thread_id: threadId,
      reply_markup: deleteMarkup
    });

    // 私信（可选）给接收者：提示（尝试 fetchChatMember 以显示名字）
    try {
      const member = await TgMessage.fetchChatMember(env, chatId, targetId);
      // 给接收者在当前群组线程发送一条提示（也可以选择私聊，但这里不做私聊）
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `📬 ${member.first_name}，你收到来自 ${fromName} 的物品：<a href="${item.link}">${item.remark || "物品"}</a>（共 ${targetList.length} 件）`,
        parse_mode: "HTML",
        message_thread_id: threadId,
        reply_markup: deleteMarkup
      });
    } catch (e) {
      console.log("[Item] fetchChatMember 或 通知接收者 失败", e);
    }

    return;
  }

  // 未知子命令，返回帮助提示
  const helpText = [
    `物品命令用法：`,
    `/item create （回复自己的消息） - 将被回复消息保存为物品；可附带备注，如 /item create 备用`,
    `/item list - 查看自己的物品；回复某人消息并发送 /item list 则查看该人的物品`,
    `/item use <序号> - 使用并消费自己的某个物品，例如 /item use 1`,
    `/item send <序号> （回复目标用户的消息）- 把自己的物品送给对方，例如 /item send 1`
  ].join("\n");

  await TgMessage.sendText(env, {
    chat_id: chatId,
    text: helpText,
    message_thread_id: threadId,
    reply_markup: deleteMarkup
  });
}
