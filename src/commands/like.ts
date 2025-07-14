// commands/like.ts
import type { Env, TelegramMessage } from "../types";
import { likeTextMapFriend, likeTextMapDaughter } from "./liketext";

// 亲密风格白名单用户 ID
type CountEntry = { name: string; value?: string };
const daughterUserIds = new Set<number>([ 10 // 示例 ID，请替换
]);

export async function handleLike(
  msg: TelegramMessage,
  env: Env
): Promise<{ text: string; reply_markup?: any }> {
  const text = msg.text?.trim() || "";

  // 扩展：当命令为 `/like all` 时，列出所有用户的使用次数统计（按次数从多到少排序），不带评价
  if (text === "@LichDiceBot /like all") {
    // 从 KV 存储中获取所有键
    const list = await env.TGBOTCOUNT.list({ prefix: "count:" });
    const stats: Array<{ firstName: string; count: number }> = [];

    for (const entry of list.keys as CountEntry[]) {
      const userId = parseInt(entry.name.split(":")[1], 10);
      // 优先使用 value 字段，否则再单独读取
      const countStr = entry.value ?? (await env.TGBOTCOUNT.get(entry.name));
      const count = parseInt(countStr || "0", 10);

      // 调用 Telegram Bot API 获取用户 first_name
      const resp = await fetch(
        `https://api.telegram.org/bot${env.BOT_TOKEN}/getChat?chat_id=${userId}`
      );
      const data = await resp.json();
      const firstName = data.result?.first_name || `ID:${userId}`;

      stats.push({ firstName, count });
    }

    // 按使用次数降序排序
    stats.sort((a, b) => b.count - a.count);
    const lines = stats.map(item => `${item.firstName}: ${item.count}`);

    return {
      text: `使用统计（按次数从多到少排序）：\n${lines.join("\n")}`
    };
  }

  // 普通 /like 逻辑
  const userId = msg.from.id;
  const key = `count:${userId}`;
  const countStr = await env.TGBOTCOUNT.get(key);
  const count = parseInt(countStr || "0", 10);

  // 选择风格
  const likeTextMap = daughterUserIds.has(userId)
    ? likeTextMapDaughter
    : likeTextMapFriend;

  // 匹配对应文本段
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

  const remark = attitudePool[Math.floor(Math.random() * attitudePool.length)];

  return {
    text: `你已经召唤骰娘<b>${count}</b>次了！${remark}`
  };
}
