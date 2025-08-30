// commands/news.ts
import TgMessage, { ParsedUpdate } from "../lib/tgMessage";
import {escapeHtml}  from "../lib/util";

type Env = {
  TOKEN: string;
  BOT_USERNAME: string;
  NEWS_STORE: KVNamespace;
};


function getDateStr(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * 根据 parsed 中的 message / replyToMessage 构造可跳转链接
 * 兼容：有 chat.username 的公开群（/username/message_id）和私有群（/c/rawId/message_id）
 */
function buildMessageLinkFromParsed(parsed: ParsedUpdate) {
  const msg = parsed.message;
  const reply = parsed.replyToMessage;
  if (!msg || !reply) return "";

  const chat = msg.chat || {};
  const chatId = String(chat.id ?? "");
  // 公开群有 username
  if (chat.username && reply.message_id) {
    return `https://t.me/${chat.username}/${reply.message_id}`;
  }
  // 私有频道/群以 -100 开头，用 /c/<raw>/<message_id>
  if (chatId.startsWith("-100") && reply.message_id) {
    const rawId = chatId.slice(4);
    return `https://t.me/c/${rawId}/${reply.message_id}`;
  }
  return "";
}

/**
 * 处理爆料逻辑，输入为已解析的 parsedMessage（TgMessage.parseUpdate 返回值）
 */
export async function handleNews(parsed: ParsedUpdate, env: Env): Promise<void> {
  console.log("[News] handleNews invoked, parsed.command:", parsed.command, "textPreview:", parsed.textPreview);

  const parsedMsg = parsed.message;
  if (!parsedMsg) {
    console.log("[News] parsed.message 缺失，忽略");
    return;
  }

  const text = (parsed.text ?? "").trim();
  const invoker = parsed.from?.first_name || "某人";
  const invokerId = String(parsed.from?.id ?? "");
  const reply = parsed.replyToMessage;

  // 使用 parsed 的 isReply 判断是否为显式回复
  const isExplicitReply = Boolean(
    parsed.isReply &&
      reply &&
      !("forum_topic_created" in (reply as any)) &&
      typeof (reply as any).text === "string" &&
      // 确保回复不是机器人自己（避免自爆料）
      (reply as any).from?.username !== env.BOT_USERNAME
  );
  console.log("[News] isExplicitReply =", isExplicitReply, "parsed.isReply =", parsed.isReply);

  // 支持命令参数中传入日期：/news 20250101
  let dateKey = getDateStr();
  if (parsed.args && parsed.args.length > 0) {
    const maybe = parsed.args[0].trim();
    if (/^\d{8}$/.test(maybe)) {
      dateKey = maybe;
    }
  }
  const kvKey = `news:${dateKey}`;
  console.log("[News] 使用日期 key =", dateKey);

  // 中文分词用于截取片段
  const segmenter = new Intl.Segmenter("zh", { granularity: "grapheme" });

  // 准备删除按钮（内联）——保持原有行为
  const deleteInlineKb = {
    inline_keyboard: [
      [{ text: "清理爆料痕迹~", callback_data: JSON.stringify({ type: "delete_message" }) }]
    ]
  };

  // threadId（论坛/主题群组）
  const threadId = parsed.threadId;

  // 如果是对某条消息的显式回复，则进入“新增爆料”流程
  if (isExplicitReply) {
    const content = escapeHtml((reply as any).text!.trim());

    const raw = await env.NEWS_STORE.get(kvKey);
    const list: Array<{
      invoker: string;
      invokerId: string;
      targetUser: string;
      text: string;
      link: string;
      timestamp: string;
    }> = raw ? JSON.parse(raw) : [];

    // 统计当天该用户已爆料数
    const todayEntries = list.filter(e => e.invokerId === invokerId);

    // 白名单/会员逻辑预留（当前默认普通用户）
    const isVip = false;
    const maxPerDay = isVip ? 99 : 90;
    console.log(`[News] ${invoker}(ID:${invokerId}) 今天已爆料 ${todayEntries.length} 条，上限 ${maxPerDay}`);

    if (todayEntries.length >= maxPerDay) {
      // 删除最早的同 invokerId 的一条（保持总数）
      const idx = list.findIndex(e => e.invokerId === invokerId);
      if (idx !== -1) {
        console.log("[News] 达到上限，删除最旧一条爆料，内容 =", list[idx]);
        list.splice(idx, 1);
      }
    }

    const link = buildMessageLinkFromParsed(parsed);
    if (link !== "" && list.some(e => e.invokerId === invokerId && e.link === link)) {
      const dupText = `⚠️ ${invoker} 已经对这条消息爆料过了！`;
      await TgMessage.sendText(env, {
        chat_id: parsed.chatId!,
        text: dupText,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    const targetUser = (reply as any).from?.first_name || "某人";
    const snippet = [...segmenter.segment(content)]
      .map(seg => seg.segment)
      .slice(0, 50)
      .join("") + "...";

    const linkedSnippet = link ? `<a href="${link}">${snippet}</a>` : snippet;

    const entry = {
      invoker,
      invokerId,
      targetUser,
      text: linkedSnippet,
      link,
      timestamp: new Date().toISOString(),
    };
    console.log("[News] 新增 entry =", entry);
    list.push(entry);

    await env.NEWS_STORE.put(kvKey, JSON.stringify(list));
    console.log("[News] 写入 KV 成功，当前条数 =", list.length);

    const sendText = `✅ ${invoker} 给骰娘爆料：<b>${targetUser}</b> 说了「${linkedSnippet}」` +
      `（你今日已爆料 ${Math.min(todayEntries.length + 1, maxPerDay)}/${maxPerDay} 条）`;

    await TgMessage.sendText(env, {
      chat_id: parsed.chatId!,
      text: sendText,
      parse_mode: "HTML",
      reply_markup: deleteInlineKb,
      message_thread_id: threadId
    });

    return;
  } else {
    // 查询模式：读取当天爆料列表并展示
    console.log("[News] 查询模式，读取 KV at", kvKey);
    const stored = await env.NEWS_STORE.get(kvKey);
    console.log("[News] 读取 raw =", stored);

    if (!stored) {
      const noText = `📭 ${dateKey} 暂无小道消息～回复一条消息并发送 <b>@${env.BOT_USERNAME} /news</b> 即可爆料喔！`;
      await TgMessage.sendText(env, {
        chat_id: parsed.chatId!,
        text: noText,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    const list: Array<{ invoker: string; targetUser: string; text: string; link: string }> = JSON.parse(stored);
    const dateDisplay = `${dateKey.slice(0, 4)}年${dateKey.slice(4, 6)}月${dateKey.slice(6)}日`;
    const header = `📰${dateDisplay} 紫罗兰小道消息 <blockquote expandable>`;

    const body = list
      .map(e =>
        `${e.invoker} 爆料 ${e.targetUser} 说了：${e.text}`
      )
      .join("\n");

    const result =
      `${header} <tg-spoiler>` +
      `${body}` +
      `</tg-spoiler></blockquote>`;
    console.log("[News] 返回内容 =", result);

    const reply_markup = {
      inline_keyboard: [
        [{ text: "烧了它！", callback_data: JSON.stringify({ type: "delete_message" }) }]
      ]
    };

    await TgMessage.sendText(env, {
      chat_id: parsed.chatId!,
      text: result,
      parse_mode: "HTML",
      reply_markup,
      message_thread_id: threadId
    });

    return;
  }
}
