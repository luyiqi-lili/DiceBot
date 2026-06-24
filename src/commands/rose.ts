/**
 * @file commands/rose.ts
 * @description 好感度系统命令处理器（/rose）。
 *   功能：
 *   - /rose（回复某人）：查看你对对方的好感度
 *   - /rose send（回复某人）：赠送一朵 🌷（每天首次免费）
 *   - /rose check（回复某人）：查看他人对你的好感度排行榜
 *   好感度存储于 D1 数据库（affections 表）+ AFFECTION_KV 回退/备份。
 */

import { Env } from '../index';
import TgMessage, { ParsedUpdate } from '../lib/telegram';
import { deleteMarkup, escapeHtml } from "../lib/util";

import {
  getBalance,
  addToTreasury
} from "../lib/coinService";

import {
  readAffectionMap,
  incrementAffection,
  getAffectionRanking,
  claimDailyFreeRoseSend,
} from "../lib/affectionDB";

type RoseEnv = Env;

function scoreToEmoji(score: number): string {
  if (score > 0 && score < 10) return "🌱";
  if (score < 10) return "";
  let units = Math.floor(score / 10);
  const emojis = ["🌱", "🍃", "🌷", "🌹", "💓", "💖", "💝", "❤️‍🔥","💍"];

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

    // 从数据库（或 KV 回退）获取排行榜
    const rows = await getAffectionRanking(env.DB!, env.AFFECTION_KV, targetId);

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
      // 获取来源用户展示名：优先 fetchChatMember 取最新名字，回退到 DB/KV 中的记录
      let sourceName = r.firstName || `用户${r.sourceId}`;
      try {
        const member = await TgMessage.fetchChatMember(env, chatId, Number(r.sourceId));
        sourceName = member.first_name ?? sourceName;
      } catch {
        // 忽略 fetch 错误，保持已有名字
      }
      // 已经是 <a> 链接格式则直接使用，否则生成可点击的 tg://user 链接
      const displayName = sourceName.startsWith('<a ')
        ? sourceName
        : `<a href="tg://user?id=${r.sourceId}">${escapeHtml(sourceName)}</a>`;
      const emoji = scoreToEmoji(r.value);
      lines.push(`${i + 1}. ${displayName} — ${emoji || String(r.value)}`);
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

  if (isSend) {
    const todayUTC = nowUTCDateYMD();
    const isFreeSend = await claimDailyFreeRoseSend(env.DB, env.AFFECTION_KV, fromId, todayUTC);

    if (isFreeSend) {
      const incrementResult = await incrementAffection(env.DB, env.AFFECTION_KV, fromId, targetId, targetName, 160);
      if (!incrementResult.ok) {
        await TgMessage.sendText(env, {
          chat_id: chatId,
          text: `❌ 好感度记录失败，请稍后重试。`,
          parse_mode: "HTML",
          message_thread_id: threadId,
          reply_markup: deleteMarkup,
        });
        return;
      }

      const emoji = scoreToEmoji(incrementResult.value || 0);
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `${fromName} 已向 ${targetName} 送出一朵 🌷，目前好感度为 ${emoji || String(incrementResult.value || 0)}。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    // 非免费时间：尝试支付 30 💰（扣钱并将款项记入国库）
    const amount = 30;
    const bal = await getBalance(env.COIN_DO, String(fromId));
    if (bal < 30) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${fromName} 今天已经送过花了。如需额外送花需支付 ${amount} 💰，但你的余额仅有 ${bal} 💰。`,
        parse_mode: "HTML",
        message_thread_id: threadId,
        reply_markup: deleteMarkup

      });
      return;

    }
    const result = await addToTreasury(env, env.COIN_DO, String(fromId), amount, "送花消费");
    if (!result.ok) {
      // 查询余额并提示
      const bal = await getBalance(env.COIN_DO, String(fromId));
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${fromName} 扣费失败：${result.reason || "未知错误"}。如需额外送花需支付 ${amount} 💰，你当前余额 ${bal} 💰。`,
        parse_mode: "HTML",
        message_thread_id: threadId,
        reply_markup: deleteMarkup

      });
      return;
    }

    const incrementResult = await incrementAffection(env.DB, env.AFFECTION_KV, fromId, targetId, targetName, 160);
    if (!incrementResult.ok) {
      // coin 已扣除，但好感度写入失败：提示用户联系管理员
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ 好感度记录失败，但已扣除 ${amount} 💰。请稍后重试或联系管理员。`,
        parse_mode: "HTML",
        message_thread_id: threadId,
        reply_markup: deleteMarkup,
      });
      return;
    }

    // 获取新的余额显示
    const newBal = await getBalance(env.COIN_DO, String(fromId));
    const emoji = scoreToEmoji(incrementResult.value || 0);

    await TgMessage.sendText(env, {
      chat_id: chatId,
      text:
        `${fromName} 支付 ${amount} 💰 向 ${targetName} 额外送出了一朵 🌷，目前好感度为 ${emoji || String(incrementResult.value || 0)}，` +
        `你当前余额 ${newBal} 💰。`,
      parse_mode: "HTML",
      message_thread_id: threadId
    });

    return;
  }

  // 读取当前好感地图（优先数据库，回退 KV）
  const map = await readAffectionMap(env.DB!, env.AFFECTION_KV, fromId);
  const key = String(targetId);
  const rec = map[key] ?? { firstName: targetName, value: 0 };
  const score = Number(rec.value || 0);

  // 非 send：查询当前好感度
  if (score <= 0) {
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
