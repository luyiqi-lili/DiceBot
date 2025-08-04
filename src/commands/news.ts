type Env = {
  NEWS_STORE: KVNamespace;
  BOT_USERNAME: string;
};

// 在这里配置你的白名单（可以用用户名、也可以是用户 ID）
const WHITE_LIST = new Set<string>([
  "5621587953", //我
  "1019896885", //yolo
  "7476641553", //厅长
  "1985262205", //樱姐
  "1182936903", //🎀閃閃🐰✨
  "7234543848", //花音
  "6258646755", //挽
  "6367789964", //渡渡鸟
  "7860415401", //琉璃
  "6653537474", //蘭
  "8074655816", //小母龙
  "7209920386", //勇菈
  "7222745396", //酥酥
  "mock"
]);

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
  const chatId = msg.chat?.id.toString();
  if (msg.chat?.username) {
    return `https://t.me/${msg.chat.username}/${msg.reply_to_message!.message_id}`;
  } else if (chatId?.startsWith("-100")) {
    const rawId = chatId.slice(4);
    return `https://t.me/c/${rawId}/${msg.reply_to_message!.message_id}`;
  }
  return '';
}

export async function handleNews(msg: any, env: Env) {
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
  if (isExplicitReply) {
    const content = escapeHtml(reply.text!.trim());

    // 读取当前列表并统计当天该用户已爆料数量
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
    const isVip = WHITE_LIST.has(invoker) || WHITE_LIST.has(invokerId);
    const maxPerDay = isVip ? 99 : 5;
    console.log(`[News] ${invoker}(ID:${invokerId}) 今天已爆料 ${todayEntries.length} 条，${isVip ? "白名单" : "普通"}用户上限 ${maxPerDay}`);

    if (todayEntries.length >= maxPerDay) {
      const idx = list.findIndex(e => e.invokerId === invokerId);
      if (idx !== -1) {
        console.log("[News] 达到上限，删除最旧一条爆料，内容 =", list[idx]);
        list.splice(idx, 1);
      }
    }

    // 检查是否已对该消息爆料过
    const link = buildMessageLink(msg);
    if (list.some(e => e.invokerId === invokerId && e.link === link)) {
      return {
        text: `⚠️ ${invoker} 已经对这条消息爆料过了！`,
        parse_mode: "HTML",
      };
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

    return {
      text: `✅ ${invoker} 给骰娘爆料：<b>${targetUser}</b> 说了「${linkedSnippet}」` +
        `（你今日已爆料 ${Math.min(todayEntries.length + 1, maxPerDay)}/${maxPerDay} 条）`,
      parse_mode: "HTML",
    };
  } else {
    console.log("[News] 查询模式，读取 KV at", kvKey);
    const stored = await env.NEWS_STORE.get(kvKey);
    console.log("[News] 读取 raw =", stored);

    if (!stored) {
      return {
        text: `📭 ${dateKey} 暂无小道消息～回复一条消息并发送 <b>@${env.BOT_USERNAME} /news</b> 即可爆料喔！`,
        parse_mode: "HTML",
      };
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

        [{ text: "删除消息", callback_data: "delete_message" }]
      ]
    };
    return {
      text: result,
      parse_mode: "HTML",
      reply_markup
    };
  }
}
