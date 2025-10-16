import TgMessage, { ParsedUpdate } from "../lib/tgMessage";
import { deleteMarkup, escapeHtml } from "../lib/util";

import {
  getBalance,
  addToTreasury
} from "../lib/coinService";

/**
 * 环境类型：在 CoinEnv 基础上要求 AFFECTION_KV
 */
export type RoseEnv = Env & {
  AFFECTION_KV: KVNamespace;
  COIN_DO: DurableObjectNamespace;
  TOKEN: string;

};

function scoreToEmoji(score: number): string {
  if (score < 10) return "";
  let units = Math.floor(score / 10);
  const emojis = ["🌱", "🍃", "🌷", "🌹", "💓", "💖", "💝", "❤️‍🔥"];

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

  // 解析是否为 send/check 操作（parsedMessage.args 由 TgMessage.parseCommandFromText 填充）
  const args = Array.isArray(parsedMessage.args) ? parsedMessage.args.map((s) => String(s).toLowerCase()) : [];
  const isSend = args.includes("send");
  const isCheck = args.includes("check");

  // 如果是 check 命令：统计所有人对目标用户的好感度（回复某人则查该人；直接发送则查自己）
  if (isCheck) {
    // 目标用户支持两种方式：回复某人，或直接发送（则查询对自己的好感度）
    let targetId: number;
    let targetName: string;

    if (parsedMessage.isReply && parsedMessage.replyToMessage && parsedMessage.replyToMessage.from) {
      targetId = Number(parsedMessage.replyToMessage.from.id);
      try {
        targetName = (await TgMessage.fetchChatMember(env, chatId, parsedMessage.replyToMessage.from.id)).first_name;
      } catch {
        targetName = escapeHtml(String(parsedMessage.replyToMessage.from.first_name ?? parsedMessage.replyToMessage.from.username ?? String(targetId)));
      }
    } else {
      targetId = fromId;
      targetName = fromName;
    }

    const targetKey = String(targetId);

    // 列出所有 affection:* 键并查找包含 targetKey 的来源
    let cursor: string | undefined = undefined;
    const rows: Array<{ sourceId: number; sourceName: string; value: number }> = [];

    do {
      // KV list 可能返回 keys 字段
      const list = await env.AFFECTION_KV.list({ prefix: "affection:", cursor });
      const keys = (list.keys ?? []) as Array<{ name: string }>;

      for (const k of keys) {
        // k.name 格式: affection:<sourceId>
        const parts = k.name.split(":");
        if (parts.length < 2) continue;
        const sourceId = Number(parts[1]);
        if (Number.isNaN(sourceId)) continue;

        const raw = await env.AFFECTION_KV.get(k.name);
        if (!raw) continue;
        let map: Record<string, { firstName: string; value: number }>;
        try {
          map = JSON.parse(raw) as Record<string, { firstName: string; value: number }>;
        } catch {
          continue;
        }

        const rec = map[targetKey];
        if (!rec) continue; // 该 source 对 target 没有记录

        // 获取来源用户展示名（尝试从 chat member 获取，失败则用占位）
        let sourceName = `用户${sourceId}`;
        try {
          const member = await TgMessage.fetchChatMember(env, chatId, Number(sourceId));
          sourceName = member.first_name ?? sourceName;
        } catch {
          // 忽略 fetch 错误，保持占位名
        }

        // 排除目标自己对自己的记录（如果需要保留可移除此判断）
        if (sourceId === targetId) continue;

        rows.push({ sourceId, sourceName: (String(sourceName)), value: Number(rec.value || 0) });
      }

      cursor = (list as any).cursor;
    } while (cursor);

    // 按数值倒序排序
    rows.sort((a, b) => b.value - a.value);

    if (rows.length === 0) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `${targetName} 暂无来自他人的好感记录。`,
        parse_mode: "HTML",
        message_thread_id: threadId,
        reply_markup: deleteMarkup

      });
      return;
    }

    // 构造回复文本（限制行数以防过长）
    const maxLines = 50;
    const lines: string[] = [];
    for (let i = 0; i < Math.min(rows.length, maxLines); i++) {
      const r = rows[i];
      const emoji = scoreToEmoji(r.value);
      lines.push(`${i + 1}. ${r.sourceName} — ${emoji || String(r.value)}`);
    }

    let text = `${targetName} 的好感度排行榜：<blockquote expandable>` + lines.join("\n");
    if (rows.length > maxLines) text += `\n... 仅显示前 ${maxLines} 条`;
    text += '</blockquote>'

    await TgMessage.sendText(env, {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      message_thread_id: threadId,
      reply_markup: deleteMarkup

    });

    return;
  }

  // 必须是对某条消息的回复（由 TgMessage.parseUpdate 解析），并且被回复消息要有 from
  if (!parsedMessage.isReply || !parsedMessage.replyToMessage || !parsedMessage.replyToMessage.from) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `请在目标用户的消息上回复并使用 /rose 查询或 /rose send 送花（例如：在某人消息上回复并发送 <code>/rose send</code>）。`,
      parse_mode: "HTML",
      message_thread_id: threadId,
      reply_markup: deleteMarkup

    });
    return;
  }

  const target = parsedMessage.replyToMessage.from;
  const targetId = Number(target.id);
  const targetName = (await TgMessage.fetchChatMember(env, chatId, target.id)).first_name

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
    const ok = await addToTreasury(env, env.COIN_DO, String(fromId), amount, "送花消费");
    if (!ok) {
      // 查询余额并提示
      const bal = await getBalance(env.COIN_DO, String(fromId));
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${fromName} 今天已经送过花了。如需额外送花需支付 ${amount} 💰，但你的余额仅有 ${bal} 💰。`,
        parse_mode: "HTML",
        message_thread_id: threadId,
        reply_markup: deleteMarkup

      });
      return;
    }

    // 记录好感度变化
    score += 160;
    map[key] = { firstName: targetName, value: score };
    await writeAffectionMap(env.AFFECTION_KV, fromId, map);

    // 获取新的余额显示
    const newBal = await getBalance(env.COIN_DO, String(fromId));
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
      message_thread_id: threadId,
      reply_markup: deleteMarkup

    });
    return;
  }

  const emoji = scoreToEmoji(score);
  await TgMessage.sendText(env, {
    chat_id: chatId,
    text: `${fromName} 对 ${targetName} 的好感度为 ${emoji}`,
    parse_mode: "HTML",
    message_thread_id: threadId,
    reply_markup: deleteMarkup

  });
}

export default handleRose;
