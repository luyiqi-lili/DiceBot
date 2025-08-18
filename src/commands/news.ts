// commands/news.ts
import TgMessage from '../lib/tgMessage';

type Env = {
  TOKEN: string;
  BOT_USERNAME: string;
  NEWS_STORE: KVNamespace;
};

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getDateStr(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function buildMessageLink(msg: any) {
  const chatId = msg.chat?.id?.toString?.();
  if (msg.chat?.username && msg.reply_to_message) {
    return `https://t.me/${msg.chat.username}/${msg.reply_to_message!.message_id}`;
  } else if (chatId?.startsWith("-100") && msg.reply_to_message) {
    const rawId = chatId.slice(4);
    return `https://t.me/c/${rawId}/${msg.reply_to_message!.message_id}`;
  }
  return '';
}

/**
 * 直接使用 TgMessage 发送消息（不再返回旧的 payload 格式）
 */
export async function handleNews(msg: any, env: Env): Promise<void> {
  console.log("[News] 收到消息，msg.text:", msg.text);
  const text: string = msg.text || "";
  const invoker = msg.from?.first_name || "某人";
  const invokerId = String(msg.from?.id);
  const reply = msg.reply_to_message;

  const isExplicitReply = Boolean(
    reply &&
      !("forum_topic_created" in reply) &&
      typeof reply.text === "string" &&
      reply.from?.username !== env.BOT_USERNAME
  );
  console.log("[News] isExplicitReply =", isExplicitReply);

  const dateMatch = text.match(/\/news\s+(\d{8})/);
  const dateKey = dateMatch?.[1] || getDateStr();
  const kvKey = `news:${dateKey}`;
  console.log("[News] 使用日期 key =", dateKey);
  const segmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' });

  // 准备通用的 reply_markup（删除按钮）
  const deleteInlineKb = {
    inline_keyboard: [
      [{ text: "清理爆料痕迹~", callback_data: JSON.stringify({ type: "delete_message" }) }]
    ]
  };

  // message_thread_id（如果存在）——用于论坛/主题群组
  const threadId =
    msg.message_thread_id
    ?? msg.message?.message_thread_id;

  if (isExplicitReply) {
    const content = escapeHtml(reply.text!.trim());

    const raw = await env.NEWS_STORE.get(kvKey);
    const list: Array<{
      invoker: string;
      invokerId: string;
      targetUser: string;
      text: string;
      link: string;
      timestamp: string;
    }> = raw ? JSON.parse(raw) : [];

    const todayEntries = list.filter(e => e.invokerId === invokerId);

    // 如果你有白名单逻辑，请在这里替换或导入；当前实现默认普通用户限制
    const isVip = false;
    const maxPerDay = isVip ? 99 : 90;
    console.log(`[News] ${invoker}(ID:${invokerId}) 今天已爆料 ${todayEntries.length} 条，上限 ${maxPerDay}`);

    if (todayEntries.length >= maxPerDay) {
      const idx = list.findIndex(e => e.invokerId === invokerId);
      if (idx !== -1) {
        console.log("[News] 达到上限，删除最旧一条爆料，内容 =", list[idx]);
        list.splice(idx, 1);
      }
    }

    const link = buildMessageLink(msg);
    if (list.some(e => e.invokerId === invokerId && e.link === link && link !== '')) {
      const dupText = `⚠️ ${invoker} 已经对这条消息爆料过了！`;
      await TgMessage.sendText(env, {
        chat_id: msg.chat.id,
        text: dupText,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    const targetUser = reply.from?.first_name || "某人";
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

    // 使用 TgMessage 发送（在群组主题中保留 message_thread_id）
    await TgMessage.sendText(env, {
      chat_id: msg.chat.id,
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
        chat_id: msg.chat.id,
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

    // 直接发送展示消息
    await TgMessage.sendText(env, {
      chat_id: msg.chat.id,
      text: result,
      parse_mode: "HTML",
      reply_markup,
      message_thread_id: threadId
    });

    return;
  }
}
