// commands/book.ts
import { Env } from "../types"; // Env 应包含 BOOK_STORE: KVNamespace, TOKEN: string
import { TelegramBotPayload } from "../utils"; // 通用 Telegram payload 类型

/**
 * 生成 KV 存储 key，按用户聚合所有书签
 */
function getUserKey(userId: number): string {
  return `book:user:${userId}`;
}

/**
 * 根据 chatId 和 messageId 构造 Telegram 可点击跳转的链接
 */
function makeMessageLink(chatId: number, messageId: number): string {
  const abs = String(chatId).startsWith("-100")
    ? String(chatId).slice(4)
    : String(Math.abs(chatId));
  return `https://t.me/c/${abs}/${messageId}`;
}

/**
 * 调用 Telegram API 获取某用户在本群的 first_name 和 username
 */
async function fetchChatMember(env: Env, chatId: number, userId: number) {
  const res = await fetch(
    `https://api.telegram.org/bot${env.TOKEN}/getChatMember`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, user_id: userId })
    }
  );
  const data = await res.json();
  if (data.ok && data.result && data.result.user) {
    const u = data.result.user;
    return {
      first_name: u.first_name || `用户${userId}`,
      username: u.username || ""
    };
  }
  return { first_name: `用户${userId}`, username: "" };
}

export async function handleBook(
  msg: any,
  env: Env
): Promise<TelegramBotPayload> {
  console.log("[Book] 收到 /book 调用, msg.text:", msg.text);

  const text: string = msg.text || "";
  const fromId = msg.from.id;
  const fromName = msg.from.first_name;
  const chatId = msg.chat.id;
  const threadId: number | undefined = msg.message_thread_id;
  const reply = msg.reply_to_message;

  // 提取 /book 后的参数
  const match = text.match(/\/book(?:\s+(.+))?/);
  const param = match && match[1] ? match[1].trim() : "";
  console.log("[Book] 提取 param:", param);

  // 判断是否要走“添加书签”流程
  const hasBookCmd = /\/book\b/.test(text);
  const isReplyOwn = !!reply && reply.from?.id === fromId;
  const isExplicitAdd =
    hasBookCmd &&
    isReplyOwn &&
    param !== "del" &&
    param !== "all" &&
    !param.startsWith("@");
  console.log(
    "[Book] hasBookCmd:", hasBookCmd,
    "isReplyOwn:", isReplyOwn,
    "isExplicitAdd:", isExplicitAdd,
    "reply_to_message_id:", reply?.message_id
  );

  // Helpers: load & save
  async function loadList(uid: number) {
    const raw = await env.BOOK_STORE.get(getUserKey(uid));
    const list = raw
      ? JSON.parse(raw) as Array<{ remark: string; link: string; timestamp: string }>
      : [];
    console.log(`[Book] loadList ${uid}, count=${list.length}`);
    return list;
  }
  async function saveList(uid: number, list: any[]) {
    await env.BOOK_STORE.put(getUserKey(uid), JSON.stringify(list));
    console.log(`[Book] saveList ${uid}, new count=${list.length}`);
  }

  // 1. 添加书签
  if (isExplicitAdd) {
    const remark = param;
    const link = makeMessageLink(chatId, reply!.message_id);
    console.log("[Book] 添加书签 remark:", remark, "link:", link);

    const list = await loadList(fromId);
    if (list.length >= 100) {
      list.shift();
      console.log("[Book] 达到上限，删除最旧条目");
    }
    list.push({ remark, link, timestamp: new Date().toISOString() });
    await saveList(fromId, list);

    const payload: TelegramBotPayload = {
      chat_id: chatId,
      text: `✅ 已添加书签：[${remark || "原文"}](${link}) （共 ${list.length} 条）`,
      parse_mode: "Markdown",
      reply_to_message_id: reply!.message_id,
    };
    if (threadId !== undefined) payload.message_thread_id = threadId;
    return payload;
  }

  // 2. 删除书签
  if (/^del\s+#?(\d+)/.test(param)) {
    const idx = parseInt(param.match(/^del\s+#?(\d+)/)![1], 10);
    console.log("[Book] 删除书签 idx:", idx);

    const list = await loadList(fromId);
    if (idx < 1 || idx > list.length) {
      return {
        chat_id: chatId,
        text: `⚠️ 无效序号：${idx}（当前 ${list.length} 条）`,
        parse_mode: "Markdown",
        reply_to_message_id: msg.message_id,
      };
    }
    list.splice(idx - 1, 1);
    await saveList(fromId, list);

    const payload: TelegramBotPayload = {
      chat_id: chatId,
      text: `✅ 已删除第 ${idx} 条书签，剩余 ${list.length} 条`,
      parse_mode: "Markdown",
      reply_to_message_id: msg.message_id,
    };
    if (threadId !== undefined) payload.message_thread_id = threadId;
    return payload;
  }

  // 3. 查看全部用户书签
  if (param === "all") {
    console.log("[Book] 查看 all");
    const listRes = await env.BOOK_STORE.list({ prefix: "book:user:" });
    let body = "";
    for (const { name } of listRes.keys) {
      const uid = parseInt(name.split(":")[2], 10);
      const list = await loadList(uid);
      if (list.length === 0) continue;
      const member = await fetchChatMember(env, chatId, uid);
      body += `<b>${member.first_name}：</b>\n`;
      list.forEach((e, i) => {
        body += `${i + 1}. <a href="${e.link}">${e.remark || "原文"}</a>\n`;
      });
      body += `\n`;
    }
    if (!body) {
      return { chat_id: chatId, text: `📭 当前暂无任何书签`, reply_to_message_id: msg.message_id };
    }
    const payload: TelegramBotPayload = {
      chat_id: chatId,
      text: `📰 全部书签 <blockquote expandable>${body}</blockquote>`,
      parse_mode: "HTML",
      reply_to_message_id: msg.message_id,
    };
    if (threadId !== undefined) payload.message_thread_id = threadId;
    return payload;
  }

  // 4. 查看指定用户书签
  if (param.startsWith("@")) {
    console.log("[Book] 查看他人书签 param:", param);
    const targetUsername = param.slice(1).toLowerCase();

    // 在所有存储的 userId 中查找匹配 username
    const listRes = await env.BOOK_STORE.list({ prefix: "book:user:" });
    let targetId: number | null = null;
    for (const { name } of listRes.keys) {
      const uid = parseInt(name.split(":")[2], 10);
      const member = await fetchChatMember(env, chatId, uid);
      if (member.username.toLowerCase() === targetUsername) {
        targetId = uid;
        break;
      }
    }
    if (targetId === null) {
      return {
        chat_id: chatId,
        text: `⚠️ 未找到用户名为 "${param}" 的用户书签`,
        reply_to_message_id: msg.message_id,
      };
    }

    const list = await loadList(targetId);
    if (list.length === 0) {
      return {
        chat_id: chatId,
        text: `📭 用户 ${param} 暂无书签`,
        reply_to_message_id: msg.message_id,
      };
    }
    const member = await fetchChatMember(env, chatId, targetId);
    let body = "";
    list.forEach((e, i) => {
      body += `${i + 1}. <a href="${e.link}">${e.remark || "原文"}</a>\n`;
    });
    const payload: TelegramBotPayload = {
      chat_id: chatId,
      text: `📰 ${member.first_name} 的书签：<blockquote expandable>${body}</blockquote>`,
      parse_mode: "HTML",
      reply_to_message_id: msg.message_id,
    };
    if (threadId !== undefined) payload.message_thread_id = threadId;
    return payload;
  }

  // 5. 查看自己的书签（默认）
  console.log("[Book] 查看", fromName, "的书签");
  const list = await loadList(fromId);
  if (list.length === 0) {
    return {
      chat_id: chatId,
      text: `📭 ${fromName}，你还没有任何书签，回复一条消息并发送 /book 即可添加～`,
      reply_to_message_id: msg.message_id,
    };
  }
  let body = "";
  list.forEach((e, i) => {
    body += `${i + 1}. <a href="${e.link}">${e.remark || "原文"}</a>\n`;
  });
  const payload: TelegramBotPayload = {
    chat_id: chatId,
    text: `📰 ${fromName} 的书签：<blockquote expandable>${body}</blockquote>`,
    parse_mode: "HTML",
    reply_to_message_id: msg.message_id,
  };
  if (threadId !== undefined) payload.message_thread_id = threadId;
  return payload;
}
