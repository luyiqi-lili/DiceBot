import { Env } from "../bindings";
import { getAffectionMap } from "./handleAffinity";

/**
 * 将好感度分数转换为 Emoji 表示
 */
function scoreToEmoji(score: number): string {
  if (score < 10) return '';
  let units = Math.floor(score / 10);
  const emojis = ['🌱', '🍃', '🌷', '🌹', '💓', '💖', '💝'];

  let result = '';
  let place = 0;

  while (units > 0 && place < emojis.length) {
    const digit = units % 4;
    if (digit > 0) {
      result = emojis[place].repeat(digit) + result;
    }
    units = Math.floor(units / 4);
    place++;
  }

  return result;
}

/**
 * 处理 /rose 命令，查询自己对目标用户的好感度（只支持 @username 形式）
 */
export async function handleRose(msg: any, env: Env) {
  const chatId = msg.chat.id;
  const fromId = msg.from.id;
  let targetId: number | null = null;
  let targetName = '';

  console.log("[rose] 收到 /rose 请求，msg.text=", msg.text);
  // 仅支持 @username 提及，实体类型为 'mention'
  if (msg.entities && Array.isArray(msg.entities)) {
    for (const ent of msg.entities) {
      if (ent.type === 'mention') {
        const raw = msg.text.substr(ent.offset, ent.length); // '@username'
        const username = raw.replace('@', '');
        console.log("[rose] 检测到 mention 实体，用户名=", username);
        try {
          // 调用 getChatMember 获取用户信息
          const res = await fetch(
            `https://api.telegram.org/bot${env.TOKEN}/getChatMember`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, user_id: username })
            }
          );
          const data = await res.json();
          if (data.ok && data.result && data.result.user) {
            targetId = data.result.user.id;
            targetName = data.result.user.first_name || username;
            console.log("[rose] getChatMember 成功，targetId=", targetId);
          } else {
            console.log("[rose] getChatMember 未找到用户，返回=", data);
          }
        } catch (err) {
          console.error("[rose] getChatMember 调用异常", err);
        }
        break;
      }
    }
  }

  if (!targetId) {
    console.log("[rose] 未获取到目标用户ID，返回用法提示");
    return {
      method: 'sendMessage',
      chat_id: chatId,
      text: '请使用 `@BotUsername /rose @目标用户名` 来查询好感度。',
      parse_mode: 'Markdown'
    };
  }

  // 获取好感度地图
  const map = await getAffectionMap(fromId, env);
  const record = map[targetId.toString()];
  const score = record ? record.value : 0;
  console.log("[rose] 好感度查询，source=", fromId, "target=", targetId, "score=", score);

  // 构造回复内容
  let text: string;
  if (score < 10) {
    text = `你对${targetName} 的好感度不够高，快多互动吧！`;
  } else {
    const emoji = scoreToEmoji(score);
    text = `你对 ${targetName} 的好感度为 ${emoji}`;
  }

  return {
    method: 'sendMessage',
    chat_id: chatId,
    text,
    parse_mode: 'HTML'
  };
}
