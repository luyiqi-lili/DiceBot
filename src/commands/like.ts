import type { Env, TelegramMessage } from "../types";
import { likeTextMapFriend, likeTextMapDaughter } from "./liketext";

const daughterUserIds = new Set<number>([
  10 // 示例 ID，请替换
]);

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function handleLike(
  msg: TelegramMessage,
  env: Env
): Promise<{ text: string; parse_mode?: string; reply_markup?: any }> {
  const mention = `@${env.BOT_USERNAME}`;
  const isAllQuery = msg.text?.trim() === `${mention} /like all`;

  if (isAllQuery) {
    // 获取所有 key，实时维护 Top 10，避免全量排序
    const list = await env.TGBOTCOUNT.list({ prefix: "count:" });
    const top10: { userId: number; count: number; firstName: string }[] = [];

    for (const entry of list.keys) {
      const userId = parseInt(entry.name.replace("count:", ""), 10);
      const raw = await env.TGBOTCOUNT.get(entry.name);
      let count = 0;
      let firstName = "";
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          count = typeof parsed.count === 'number' ? parsed.count : parseInt(raw, 10) || 0;
          firstName = typeof parsed.firstName === 'string' ? parsed.firstName : '';
        } catch {
          count = parseInt(raw, 10) || 0;
        }
      }
      // 插入 top10 队列
      if (top10.length < 10 || count > top10[top10.length - 1].count) {
        // 插入并保持降序
        const item = { userId, count, firstName };
        let i = top10.length - 1;
        while (i >= 0 && top10[i].count < count) {
          i--;
        }
        top10.splice(i + 1, 0, item);
        if (top10.length > 10) top10.pop();
      }
    }

    const results = top10.map(u => {
      const name = u.firstName ? escapeHtml(u.firstName) : `ID ${u.userId}`;
      return `${name}：${u.count} 次`;
    });

    return {
      text: `<b>骰娘Top 10 使用榜：</b>\n<blockquote expandable>${escapeHtml(results.join("\n"))}</blockquote>`,
      parse_mode: "HTML"
    };
  }

  // 默认个人查询
  const userId = msg.from.id;
  const key = `count:${userId}`;
  const raw = await env.TGBOTCOUNT.get(key);
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
  const likeTextMap = daughterUserIds.has(userId)
    ? likeTextMapDaughter
    : likeTextMapFriend;

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

  if (attitudePool.length === 0) {
    attitudePool = ["骰娘一时搞不清你属于哪个等级啦！🤔"];
  }

  const remark = escapeHtml(
    attitudePool[Math.floor(Math.random() * attitudePool.length)]
  );
  const safeCount = escapeHtml(count.toString());

  return {
    text: `你已经召唤骰娘<b>${safeCount}</b>次了！${remark}`,
    parse_mode: "HTML"
  };
}
