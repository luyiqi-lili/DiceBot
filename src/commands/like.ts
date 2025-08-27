import TgMessage, { ParsedUpdate, EnvLike } from "../lib/tgMessage";
import { likeTextMapFriend } from "../lib/liveConfig";

// 示例 daughter id 集合（请根据实际替换/扩展）
const daughterUserIds = new Set<number>([10]);

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * 重构后的 handleLike：
 * - 接收 parsedMessage
 * - 直接使用 TgMessage.sendText 发送回复
 */
export async function handleLike(parsedMessage: ParsedUpdate, env: EnvLike) {
  const chatId = parsedMessage.chatId || parsedMessage.message?.chat?.id;
  if (!chatId) {
    console.error("[like] 找不到 chatId，无法发送回复");
    return;
  }

  const mention = `@${(env as any).BOT_USERNAME || "Bot"}`;

  // 判断是否为 /like all 查询（优先使用解析后的命令参数）
  const isAllQuery = parsedMessage.command === "like" && Array.isArray(parsedMessage.args) && parsedMessage.args[0] === "all"
    || (parsedMessage.text?.trim() === `${mention} /like all`);

  // KV 名称前缀
  const prefix = "count:";

  if (isAllQuery) {
    // 获取所有 key 并维护 Top10（避免全量排序）
    const list = await (env as any).TGBOTCOUNT.list({ prefix });
    const top10: { userId: number; count: number; firstName: string }[] = [];

    for (const entry of list.keys) {
      const userId = parseInt(entry.name.replace(prefix, ""), 10);
      const raw = await (env as any).TGBOTCOUNT.get(entry.name);
      let count = 0;
      let firstName = "";
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          count = typeof parsed.count === "number" ? parsed.count : parseInt(raw, 10) || 0;
          firstName = typeof parsed.firstName === 'string' ? parsed.firstName : '';
        } catch {
          count = parseInt(raw, 10) || 0;
        }
      }

      if (top10.length < 10 || count > top10[top10.length - 1].count) {
        const item = { userId, count, firstName };
        let i = top10.length - 1;
        while (i >= 0 && top10[i].count < count) i--;
        top10.splice(i + 1, 0, item);
        if (top10.length > 10) top10.pop();
      }
    }

    const results = top10.map(u => {
      const name = u.firstName ? escapeHtml(u.firstName) : `ID ${u.userId}`;
      return `${name}：${u.count} 次`;
    });

    const text = `<b>骰娘Top 10 使用榜：</b>\n<blockquote expandable>${escapeHtml(results.join("\n"))}</blockquote>`;

    return await TgMessage.sendText(env, {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      message_thread_id: parsedMessage.threadId
    });
  }

  // 个人查询
  const from = parsedMessage.from || parsedMessage.message?.from;
  if (!from) {
    console.error("[like] 找不到用户信息 from");
    return;
  }

  const userId = from.id;
  const key = `${prefix}${userId}`;
  const raw = await (env as any).TGBOTCOUNT.get(key);

  let record: { count: number; firstName: string };
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      record = {
        count: typeof parsed.count === 'number' ? parsed.count : parseInt(raw, 10) || 0,
        firstName: typeof parsed.firstName === 'string' ? parsed.firstName : ''
      };
    } catch {
      record = { count: parseInt(raw, 10) || 0, firstName: '' };
    }
  } else {
    record = { count: 0, firstName: '' };
  }

  const count = record.count;
  const likeTextMap = likeTextMapFriend;

  let attitudePool: string[] = [];
  for (const entry of likeTextMap) {
    if (entry.range === "above" && count > 1000) {
      attitudePool = entry.texts;
      break;
    } else if (Array.isArray(entry.range)) {
      const [min, max] = entry.range;
      if (count >= min && count <= max) {
        attitudePool = entry.texts;
        break;
      }
    }
  }

  if (attitudePool.length === 0) attitudePool = ["骰娘一时搞不清你属于哪个等级啦！🤔"];

  const remark = escapeHtml(attitudePool[Math.floor(Math.random() * attitudePool.length)]);
  const safeCount = escapeHtml(count.toString());
  const displayName = record.firstName || (from.first_name as string) || `ID ${userId}`;
  const safeName = escapeHtml(displayName);

  const text = `${safeName}，你已经召唤骰娘<b>${safeCount}</b>次了！${remark}`;

  return await TgMessage.sendText(env, {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    message_thread_id: parsedMessage.threadId
  });
}

export default handleLike;
