// commands/like.ts
import type { Env, TelegramMessage } from "../types";
import { likeTextMapFriend, likeTextMapDaughter } from "./liketext";

// 亲密风格白名单用户 ID
const daughterUserIds = new Set<number>([
  10 // 示例 ID，请替换
]);

export async function handleLike(
  msg: TelegramMessage,
  env: Env
): Promise<{ text: string; reply_markup?: any }> {
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
