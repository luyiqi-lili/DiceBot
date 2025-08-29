import TgMessage, { ParsedUpdate } from "../lib/tgMessage";
import {
  CoinEnv,
  getBalance as coinGetBalance,
  deductFromBalance,
  addToTreasury
} from "./coin";

/**
 * 环境类型：在 CoinEnv 基础上要求 AFFECTION_KV
 */
export type RoseEnv = CoinEnv & {
  AFFECTION_KV: KVNamespace;
};

function escapeHtml(text: string) {
  return (text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function scoreToEmoji(score: number): string {
  if (score < 10) return "";
  let units = Math.floor(score / 10);
  const emojis = ["🌱", "🍃", "🌷", "🌹", "💓", "💖", "💝"];

  let result = "";
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

function nowUTCDateYMD(): string {
  return new Date().toISOString().split("T")[0];
}

/* ----------------------------------
   AFFECTION KV helpers (local, no external module)
   Key: affection:<sourceId> -> JSON map { <targetId>: { firstName, value } }
-----------------------------------*/
async function readAffectionMap(kv: KVNamespace, sourceId: number) {
  const key = `affection:${sourceId}`;
  const raw = await kv.get(key);
  if (!raw) return {} as Record<string, { firstName: string; value: number }>;
  try {
    return JSON.parse(raw) as Record<string, { firstName: string; value: number }>;
  } catch {
    return {} as Record<string, { firstName: string; value: number }>;
  }
}

async function writeAffectionMap(kv: KVNamespace, sourceId: number, map: Record<string, { firstName: string; value: number }>) {
  const key = `affection:${sourceId}`;
  await kv.put(key, JSON.stringify(map));
}

/* ----------------------------------
   主处理函数：接收 ParsedUpdate 并使用 TgMessage 发送回复
-----------------------------------*/
export async function handleRose(parsedMessage: ParsedUpdate, env: RoseEnv): Promise<void> {
  const chatId = parsedMessage.chatId!;
  const threadId = parsedMessage.threadId;
  const from = parsedMessage.from!;
  const fromId = Number(from.id);
  const fromName = escapeHtml(String(from.first_name ?? from.username ?? "你"));

  // 必须是对某条消息的回复（由 TgMessage.parseUpdate 解析），并且被回复消息要有 from
  if (!parsedMessage.isReply || !parsedMessage.replyToMessage || !parsedMessage.replyToMessage.from) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `请在目标用户的消息上回复并使用 /rose 查询或 /rose send 送花（例如：在某人消息上回复并发送 <code>/rose send</code>）。`,
      parse_mode: "HTML",
      message_thread_id: threadId
    });
    return;
  }

  const target = parsedMessage.replyToMessage.from;
  const targetId = Number(target.id);
  const targetName = escapeHtml(String(target.first_name ?? target.username ?? "该用户"));

  // 解析是否为 send 操作（parsedMessage.args 由 TgMessage.parseCommandFromText 填充）
  const args = Array.isArray(parsedMessage.args) ? parsedMessage.args.map((s) => String(s).toLowerCase()) : [];
  const isSend = args.includes("send");

  // 读取当前好感地图（本地操作）
  const map = await readAffectionMap(env.AFFECTION_KV, fromId);
  const key = String(targetId);
  const rec = map[key] ?? { firstName: targetName, value: 0 };
  let score = Number(rec.value || 0);

  if (isSend) {
    // 检查今天是否已免费送花
    const sendKey = `rose_send:${fromId}`;
    const lastSendDate = await env.AFFECTION_KV.get(sendKey);
    const todayUTC = nowUTCDateYMD();

    if (lastSendDate !== todayUTC) {
      // 首次免费送花
      score += 160;
      map[key] = { firstName: targetName, value: score };
      await writeAffectionMap(env.AFFECTION_KV, fromId, map);
      // 记录已送花（当天） 
      await env.AFFECTION_KV.put(sendKey, todayUTC);

      const emoji = scoreToEmoji(score);
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `${fromName} 已向 ${targetName} 送出一朵 🌷，目前好感度为 ${emoji || String(score)}。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    // 非免费时间：尝试支付 30 💰（扣钱并将款项记入国库）
    const amount = 30;
    const ok = await deductFromBalance(env.COIN_KV, String(fromId), amount);
    if (!ok) {
      // 查询余额并提示
      const bal = await coinGetBalance(env.COIN_KV, String(fromId));
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${fromName} 今天已经送过花了。如需额外送花需支付 ${amount} 💰，但你的余额仅有 ${bal} 💰。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    // 扣款成功后把钱转入国库
    await addToTreasury(env.COIN_KV, amount);

    // 记录好感度变化
    score += 160;
    map[key] = { firstName: targetName, value: score };
    await writeAffectionMap(env.AFFECTION_KV, fromId, map);

    // 获取新的余额显示
    const newBal = await coinGetBalance(env.COIN_KV, String(fromId));
    const emoji = scoreToEmoji(score);

    await TgMessage.sendText(env, {
      chat_id: chatId,
      text:
        `${fromName} 支付 ${amount} 💰 向 ${targetName} 额外送出了一朵 🌷，目前好感度为 ${emoji || String(score)}，` +
        `你当前余额 ${newBal} 💰。`,
      parse_mode: "HTML",
      message_thread_id: threadId
    });

    return;
  }

  // 非 send：查询当前好感度
  if (score < 10) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `${fromName} 对 ${targetName} 的好感度不够高，快多互动吧！`,
      parse_mode: "HTML",
      message_thread_id: threadId
    });
    return;
  }

  const emoji = scoreToEmoji(score);
  await TgMessage.sendText(env, {
    chat_id: chatId,
    text: `${fromName} 对 ${targetName} 的好感度为 ${emoji}`,
    parse_mode: "HTML",
    message_thread_id: threadId
  });
}

export default handleRose;
