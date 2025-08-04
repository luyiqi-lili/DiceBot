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
 * 处理 /rose 命令，通过回复消息获取目标用户，查询或增加好感度
 * 支持：
 *   /rose            查询好感度
 *   /rose send       向目标用户送花，好感度 +120 并持久化，每天每个用户限送一朵
 */
export async function handleRose(msg: any, env: Env) {
  const chatId = msg.chat.id;
  const fromId = msg.from.id;
  const fromName = msg.from.first_name || '你';

  // 解析命令参数，看是否是 "send"
  const parts = msg.text.trim().split(/\s+/);
  const isSend = parts.slice(1).map(s => s.toLowerCase()).includes('send');

  // 如果用户没有回复任何消息，则提示用法
  if (!msg.reply_to_message || !msg.reply_to_message.from || msg.reply_to_message.forum_topic_created) {
    return {
      method: 'sendMessage',
      chat_id: chatId,
      text: '请在想操作的用户消息上回复并使用 @LichDiceBot /rose 或 /rose send 来查询或送花。',
    };
  }

  // 从回复的消息中获取目标用户信息
  const targetUser = msg.reply_to_message.from;
  const targetId = targetUser.id;
  const targetName = targetUser.first_name || targetUser.username || '该用户';

  // 查询当前好感度地图
  const map = await getAffectionMap(fromId, env);
  const key = targetId.toString();
  const record = map[key] || { firstName: targetName, value: 0 };
  let score = record.value;

  if (isSend) {
    // 检查当天是否已送花（UTC 日期） 
    const sendKey = `rose_send:${fromId}`;
    const lastSendDate = await env.AFFECTION_KV.get(sendKey);
    const todayUTC = new Date().toISOString().split('T')[0];

    if (lastSendDate !== todayUTC) {
      // 第一次免费送花：+160 好感
      score += 160;
      map[key] = { firstName: targetName, value: score };
      // 持久化好感度和送花日期
      await env.AFFECTION_KV.put(`affection:${fromId}`, JSON.stringify(map));
      await env.AFFECTION_KV.put(sendKey, todayUTC, { expirationTtl: 86400 });

      const emoji = scoreToEmoji(score);
      return {
        method: 'sendMessage',
        chat_id: chatId,
        text: `${fromName} 已经向 ${targetName} 送出了一朵 🌷，目前好感度为 ${emoji}`,
        parse_mode: 'HTML'
      };
    }

    // 超过免费次数，尝试花费 30 coin 继续送花
    const coinRaw = await env.COIN_KV.get(fromId.toString());
    const coinBal = coinRaw ? parseInt(coinRaw, 10) : 0;
    if (coinBal < 30) {
      return {
        method: 'sendMessage',
        chat_id: chatId,
        text: `❌ ${fromName} 今天已经送过花了，若要额外送花需支付 30 💰，但你的余额仅有 ${coinBal} 💰。`,
        parse_mode: 'HTML'
      };
    }
    // 扣除 30 coin 并送花 +160 好感
    await env.COIN_KV.put(fromId.toString(), (coinBal - 30).toString());
    score += 160;
    map[key] = { firstName: targetName, value: score };
    await env.AFFECTION_KV.put(`affection:${fromId}`, JSON.stringify(map));

    const emoji = scoreToEmoji(score);
    return {
      method: 'sendMessage',
      chat_id: chatId,
      text:
        `${fromName} 支付 30 💰 向 ${targetName} 额外送出了一朵 🌷，` +
        `目前好感度为 ${emoji}，你当前余额 ${coinBal - 30} 💰。`,
      parse_mode: 'HTML'
    }; 
   } else {
    // 仅查询当前好感度
    let text: string;
    if (score < 10) {
      text = `${fromName} 对 ${targetName} 的好感度不够高，快多互动吧！`;
    } else {
      const emoji = scoreToEmoji(score);
      text = `${fromName} 对 ${targetName} 的好感度为 ${emoji}`;
    }
    return {
      method: 'sendMessage',
      chat_id: chatId,
      text,
      parse_mode: 'HTML'
    };
  }
}
