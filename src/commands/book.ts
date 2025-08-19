// commands/book.ts
import TgMessage, { ParsedUpdate } from "../lib/tgMessage";
import { Env } from "../types"; // Env 应包含 BOOK_STORE: KVNamespace, TOKEN: string, BOT_USERNAME?: string

function getUserKey(userId: number): string {
  return `book:user:${userId}`;
}

function makeMessageLink(chatId: number, messageId: number): string {
  const abs = String(chatId).startsWith("-100")
    ? String(chatId).slice(4)
    : String(Math.abs(chatId));
  return `https://t.me/c/${abs}/${messageId}`;
}

/**
 * handleBook 接受已解析的 ParsedUpdate，避免重复解析
 * @param parsed 已由 TgMessage.parseUpdate(update, env.BOT_USERNAME) 得到的结构
 * @param env 环境变量（包含 BOOK_STORE 等）
 */
export async function handleBook(parsed: ParsedUpdate, env: Env) {
  console.log("[Book] handleBook invoked, parsed.command:", parsed.command, "textPreview:", parsed.textPreview);

  const chatId = parsed.chatId!;
  const threadId = parsed.threadId;
  const fromId = parsed.from?.id;
  const fromName = parsed.from?.first_name || `用户${fromId}`;
  const reply = parsed.replyToMessage;

  // param 来源于 parsed.args（调用方已 parseCommandFromText）
  const param = (parsed.args && parsed.args.length > 0) ? parsed.args.join(" ").trim() : "";
  console.log("[Book] parsed.args:", parsed.args, "param:", param, "isReply:", parsed.isReply);

  // KV helpers
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

  // 判断是否为“添加书签”流程：
  const isReplyOwn = !!reply && reply.from?.id === fromId;
  const isExplicitAdd =
    parsed.isReply &&
    isReplyOwn &&
    param !== "del" &&
    param !== "all" &&
    !param.startsWith("@");
  console.log("[Book] isReplyOwn:", isReplyOwn, "isExplicitAdd:", isExplicitAdd);

  // 1. 添加书签
  if (isExplicitAdd) {
    const remark = param || "原文";
    const link = makeMessageLink(chatId, reply!.message_id);
    console.log("[Book] 添加书签 remark:", remark, "link:", link);

    const list = await loadList(fromId);
    if (list.length >= 100) {
      list.shift();
      console.log("[Book] 达到上限，删除最旧条目");
    }
    list.push({ remark, link, timestamp: new Date().toISOString() });
    await saveList(fromId, list);

    const text = `✅ 已添加书签：[${remark}](${link}) （共 ${list.length} 条）`;
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      message_thread_id: threadId
    });
    return;
  }

  // 2. 删除书签： param 可能为 "del 3" 或 "del #3"
  const delMatch = param.match(/^del\s+#?(\d+)/);
  if (delMatch) {
    const idx = parseInt(delMatch[1], 10);
    console.log("[Book] 删除书签 idx:", idx);

    const list = await loadList(fromId);
    if (idx < 1 || idx > list.length) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `⚠️ 无效序号：${idx}（当前 ${list.length} 条）`,
        parse_mode: "Markdown",
        message_thread_id: threadId
      });
      return;
    }
    list.splice(idx - 1, 1);
    await saveList(fromId, list);

    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `✅ 已删除第 ${idx} 条书签，剩余 ${list.length} 条`,
      parse_mode: "Markdown",
      message_thread_id: threadId
    });
    return;
  }

  // 3. 查看全部用户书签： param === "all"
  if (param === "all") {
    console.log("[Book] 查看 all");
    const listRes = await env.BOOK_STORE.list({ prefix: "book:user:" });
    let body = "";
    for (const { name } of listRes.keys) {
      const uid = parseInt(name.split(":")[2], 10);
      const list = await loadList(uid);
      if (list.length === 0) continue;
      const member = await TgMessage.fetchChatMember(env, chatId, uid);
      body += `<b>${member.first_name}：</b>\n`;
      list.forEach((e, i) => {
        body += `${i + 1}. <a href="${e.link}">${e.remark || "原文"}</a>\n`;
      });
      body += `\n`;
    }
    if (!body) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `📭 当前暂无任何书签`,
        message_thread_id: threadId
      });
      return;
    }

    const text = `📰 全部书签 <blockquote expandable>${body}</blockquote>`;
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      message_thread_id: threadId
    });
    return;
  }

  // 4. 查看指定用户书签： param 以 @ 开头
  if (param && param.startsWith("@")) {
    console.log("[Book] 查看他人书签 param:", param);
    const targetUsername = param.slice(1).toLowerCase();

    const listRes = await env.BOOK_STORE.list({ prefix: "book:user:" });
    let targetId: number | null = null;
    for (const { name } of listRes.keys) {
      const uid = parseInt(name.split(":")[2], 10);
      const member = await TgMessage.fetchChatMember(env, chatId, uid);
      if ((member.username || "").toLowerCase() === targetUsername) {
        targetId = uid;
        break;
      }
    }
    if (targetId === null) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `⚠️ 未找到用户名为 "${param}" 的用户书签`,
        message_thread_id: threadId
      });
      return;
    }

    const list = await loadList(targetId);
    if (list.length === 0) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `📭 用户 ${param} 暂无书签`,
        message_thread_id: threadId
      });
      return;
    }
    const member = await TgMessage.fetchChatMember(env, chatId, targetId);
    let body = "";
    list.forEach((e, i) => {
      body += `${i + 1}. <a href="${e.link}">${e.remark || "原文"}</a>\n`;
    });
    const text = `📰 ${member.first_name} 的书签：<blockquote expandable>${body}</blockquote>`;
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      message_thread_id: threadId
    });
    return;
  }

  // 5. 查看自己的书签（默认）
  console.log("[Book] 查看", fromName, "的书签");
  const list = await loadList(fromId);
  if (list.length === 0) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `📭 ${fromName}，你还没有任何书签，回复一条消息并发送 /book 即可添加～`,
      message_thread_id: threadId
    });
    return;
  }
  let body = "";
  list.forEach((e, i) => {
    body += `${i + 1}. <a href="${e.link}">${e.remark || "原文"}</a>\n`;
  });
  const text = `📰 ${fromName} 的书签：<blockquote expandable>${body}</blockquote>`;
  await TgMessage.sendText(env, {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    message_thread_id: threadId
  });
}
