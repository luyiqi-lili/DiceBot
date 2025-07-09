// commands/news.ts
type Env = {
  NEWS_STORE: KVNamespace;
  BOT_USERNAME: string;
};

// 在这里配置你的白名单（可以用用户名、也可以是用户 ID）
const WHITE_LIST = new Set<string>([
  // 直接填 Telegram 用户名（不带 @），或者用户 ID 转成字符串
  "5621587953",//我
  "1019896885",//yolo
  "7476641553",//厅长
  "1985262205",//樱姐
  "1182936903",//🎀閃閃🐰✨
  "7234543848",//花音
  "6258646755",//挽
  "6367789964",//渡渡鸟
  "7860415401",//琉璃
  "6653537474",//蘭
  "8074655816",//小母龙
  "mock"
]);

function getDateStr(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

export async function handleNews(msg: any, env: Env) {
  console.log("[News] 收到消息，msg.text:", msg.text);
  const text: string = msg.text || "";
  const invoker = msg.from?.first_name || "某人";      // aa 用户昵称
  const invokerId = String(msg.from?.id);              // aa 用户 ID（字符串）
  const reply = msg.reply_to_message;

  // 判断是真正的 reply，并且回复不是来自 Bot 本身
  const isExplicitReply = Boolean(
    reply &&
    !("forum_topic_created" in reply) &&
    typeof reply.text === "string" &&
    reply.from?.username !== env.BOT_USERNAME
  );
  console.log("[News] isExplicitReply =", isExplicitReply);

  // 提取日期参数，或取今天
  const dateMatch = text.match(/\/news\s+(\d{8})/);
  const dateKey = dateMatch?.[1] || getDateStr();
  const kvKey = `news:${dateKey}`;
  console.log("[News] 使用日期 key =", dateKey);

  if (isExplicitReply) {
    const content = reply.text!.trim();

    // 1. 长度限制
    if (content.length > 100) {
      console.log("[News] 爆料内容超长，长度 =", content.length);
      return {
        text: `⚠️ 爆料内容不能超过 100 字，你当前输入了 ${content.length} 字。`,
        parse_mode: "HTML",
      };
    }

    // 2. 读当前列表并统计当天该用户已爆料数量
    const raw = await env.NEWS_STORE.get(kvKey);
    const list: Array<{
      invoker: string;
      invokerId: string;
      targetUser: string;
      text: string;
      timestamp: string;
    }> = raw ? JSON.parse(raw) : [];

    const todayEntries = list.filter(e => e.invokerId === invokerId);
    const isVip = WHITE_LIST.has(invoker) || WHITE_LIST.has(invokerId);
    const maxPerDay = isVip ? 10 : 3;
    console.log(`[News] ${invoker}(ID:${invokerId}) 今天已爆料 ${todayEntries.length} 条，${isVip? "白名单":"普通"}用户上限 ${maxPerDay}`);

    // 3. 如果已达上限，删除最早的一条
    if (todayEntries.length >= maxPerDay) {
      // 找到 list 中第一个属于 invoker 的索引
      const idx = list.findIndex(e => e.invokerId === invokerId);
      if (idx !== -1) {
        console.log("[News] 达到上限，删除最旧一条爆料，内容 =", list[idx]);
        list.splice(idx, 1);
      }
    }

    // 4. 构造并推入新条目
    const targetUser = reply.from?.first_name || "某人";
    const entry = {
      invoker,
      invokerId,
      targetUser,
      text: content,
      timestamp: new Date().toISOString(),
    };
    console.log("[News] 新增 entry =", entry);
    list.push(entry);

    // 写回 KV
    await env.NEWS_STORE.put(kvKey, JSON.stringify(list));
    console.log("[News] 写入 KV 成功，当前条数 =", list.length);

    return {
      text: `✅ ${invoker} 给骰娘爆料：<b>${targetUser}</b> 说了「${content}」。\n` +
            `（你今日已爆料 ${Math.min(todayEntries.length + 1, maxPerDay)}/${maxPerDay} 条）`,
      parse_mode: "HTML",
    };
  } else {
    // —— 查询爆料汇总
    console.log("[News] 查询模式，读取 KV at", kvKey);
    const stored = await env.NEWS_STORE.get(kvKey);
    console.log("[News] 读取 raw =", stored);

    if (!stored) {
      return {
        text: `📭 ${dateKey} 暂无小道消息～回复一条消息并发送 <b>@LichDiceBot /news</b> 即可爆料喔！`,
        parse_mode: "HTML",
      };
    }

    const list: {
      invoker: string;
      targetUser: string;
      text: string;
    }[] = JSON.parse(stored);

    const dateDisplay = `${dateKey.slice(0,4)}年${dateKey.slice(4,6)}月${dateKey.slice(6)}日`;
    // 这里用一个点号开头，模拟 Telegram 的引用格式；你也可以改成 '>' 或 '<blockquote>'
    const header = `📰${dateDisplay} 紫罗兰小道消息 <blockquote expandable>`;
    const body = list
      .map(e => `${e.invoker} 爆料 ${e.targetUser} 说了：${e.text}`)
      .join("\n");

    // 将所有内容包裹进 tg-spoiler，实现折叠
    const result = 
      `${header} <tg-spoiler>` +
      `${body}` +
      `</tg-spoiler></blockquote>`;
    console.log("[News] 返回内容 =", result);

    return {
      text: result,
      parse_mode: "HTML",
    };
  }
}
