// commands/duel.ts
import TgMessage, { ParsedUpdate, EnvLike } from "../lib/tgMessage";
import { escapeHtml } from "../lib/util";

/**
 * Duel 重构版
 * - 通过回复消息确认决斗对象
 * - 接受决斗后才进行双方掷点
 * - 图片、文本和按钮在同一个消息中
 */

type ShortCb = {
  type: "duel";
  act: "accept";
  uid?: number; // 目标用户 ID
};

const reply_delete = {
  inline_keyboard: [[{ text: "删除消息", callback_data: JSON.stringify({ type: "delete_message" }) }]]
};

// 决斗氛围图片 ID
const DUEL_IMAGE_ID = "AgACAgEAAyEFAASpyGJZAAJ9SWj-FJr4gS7H43QLuwYb25tuqfBSAAIuC2sbPEfwR4PzdlhNkrdiAQADAgADeAADNgQ";

function pickDisplayNameFromParsed(parsed: ParsedUpdate) {
  return parsed.from?.first_name || "决斗者";
}

/**
 * 处理 /duel 发起（通过回复消息确认决斗对象）
 */
export async function handleDuel(parsed: ParsedUpdate, env: EnvLike) {
  if (!parsed || parsed.type !== "message" || !parsed.message) return;

  const chat_id = parsed.chatId!;
  const thread_id = parsed.threadId;
  const botName = env.BOT_USERNAME || "";

  const initiatorFirst = pickDisplayNameFromParsed(parsed);
  const initiatorId = parsed.from?.id;
  const args = parsed.args || [];

  // 检查是否是回复消息
  if (!parsed.isReply || !parsed.replyToMessage) {
    await TgMessage.sendText(env, {
      chat_id,
      text: `请通过<b>回复</b>某人的消息来指定决斗对象！\n\n用法：\n1. 回复某人的消息\n2. 输入 @${botName} /duel 赌注内容\n\n例如：回复某人的消息并输入 "@${botName} /duel 一瓶可乐"`,
      parse_mode: "HTML",
      reply_markup: reply_delete,
      message_thread_id: thread_id
    });
    return;
  }

  // 获取被回复的用户信息（决斗目标）
  const targetUser = parsed.replyToMessage.from;
  if (!targetUser) {
    await TgMessage.sendText(env, {
      chat_id,
      text: "无法识别被回复的用户，请确保回复的是有效的用户消息。",
      parse_mode: "HTML",
      reply_markup: reply_delete,
      message_thread_id: thread_id
    });
    return;
  }

  const targetDisplay = targetUser.first_name || "未知用户";
  const targetId = targetUser.id;

  // 检查赌注
  const stake = args.join(" ").trim();
  if (!stake) {
    await TgMessage.sendText(env, {
      chat_id,
      text: `请指定赌注内容。\n用法：回复某人消息并输入 "@${botName} /duel 赌注内容"`,
      parse_mode: "HTML",
      reply_markup: reply_delete,
      message_thread_id: thread_id
    });
    return;
  }

  // 禁止自己/机器人作为目标
  if (targetId === initiatorId) {
    await TgMessage.sendText(env, {
      chat_id,
      text: "你不能与自己决斗！请回复其他人的消息来指定决斗对象。",
      parse_mode: "HTML",
      reply_markup: reply_delete,
      message_thread_id: thread_id
    });
    return;
  }

  if (targetId === env.BOT_USERNAME) {
    await TgMessage.sendText(env, {
      chat_id,
      text: "你不能与机器人决斗！",
      parse_mode: "HTML",
      reply_markup: reply_delete,
      message_thread_id: thread_id
    });
    return;
  }

  // 构建决斗邀请消息
  const captionText =
    `⚔️ <b>决斗邀请</b> ⚔️\n\n` +
    `🗡️ <b>${escapeHtml(initiatorFirst)}</b> 向 <b>${escapeHtml(targetDisplay)}</b> 发起决斗！\n` +
    `💰 <b>赌注：</b>${escapeHtml(stake)}\n\n` +
    `⚠️ ${escapeHtml(targetDisplay)} 请点击下方按钮接受决斗！`;

  // callback_data 包含目标用户 ID 用于验证
  const cb: ShortCb = { type: "duel", act: "accept", uid: targetId };

  try {
    // 发送带图片、文本和按钮的完整消息
    await TgMessage.sendMediaGroup(env, {
      chat_id,
      media: [
        {
          type: "photo",
          media: DUEL_IMAGE_ID,
          caption: captionText,
          parse_mode: "HTML"
        }
      ],
      message_thread_id: thread_id,
      reply_markup: {
        inline_keyboard: [
          [{ text: "⚔️ 接受决斗", callback_data: JSON.stringify(cb) }]
        ]
      }
    });

  } catch (e) {
    console.error("[duel] 发送决斗消息失败", e);
    // 如果发送图片失败，回退到纯文本
    await TgMessage.sendText(env, {
      chat_id,
      text: captionText + `\n\n🗡️ ${escapeHtml(targetDisplay)}，点击按钮接受决斗：`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "⚔️ 接受决斗", callback_data: JSON.stringify(cb) }]
        ]
      },
      message_thread_id: thread_id
    });
  }
}

/**
 * 处理 duel 回调（接受决斗）
 */
export async function handleDuelCallback(callbackQuery: any, callbackData: any, env: EnvLike) {
  const cq = callbackQuery;
  if (!callbackData || typeof callbackData !== "object") return;
  if (callbackData.type !== "duel" || callbackData.act !== "accept") return;

  const msg = cq.message;
  if (!msg) {
    await TgMessage.answerCallbackQuery(env, cq.id, { text: "回调消息缺失", show_alert: true });
    return;
  }

  const chat_id = msg.chat?.id;
  const message_id = msg.message_id;

  // 验证调用者是否为被挑战者
  const expectedTargetId = callbackData.uid;
  const callerId = cq.from?.id;

  if (expectedTargetId !== callerId) {
    await TgMessage.answerCallbackQuery(env, cq.id, {
      text: "只有被挑战者才能接受此决斗！",
      show_alert: true
    });
    return;
  }

  const callerFirst = cq.from?.first_name || "决斗者";

  // 从消息中解析发起者和赌注信息
  const caption = msg.caption || "";
  const initiatorMatch = caption.match(/🗡️ <b>(.+?)<\/b> 向/);
  const targetMatch = caption.match(/向 <b>(.+?)<\/b> 发起决斗/);
  const stakeMatch = caption.match(/💰 <b>赌注：<\/b>(.+?)\n\n/);

  const initiatorName = initiatorMatch ? initiatorMatch[1] : "发起者";
  const targetName = targetMatch ? targetMatch[1] : callerFirst;
  const stake = stakeMatch ? stakeMatch[1] : "未知赌注";

  // 双方掷点
  const pointA = Math.floor(Math.random() * 100) + 1; // 发起者点数
  const pointB = Math.floor(Math.random() * 100) + 1; // 接受者点数

  const winner = pointB > pointA ? targetName : initiatorName;
  const winnerPoints = pointB > pointA ? pointB : pointA;

  const resultText =
    `⚔️ <b>决斗结果</b> ⚔️\n\n` +
    `🗡️ <b>${escapeHtml(initiatorName)}</b> 向 <b>${escapeHtml(targetName)}</b> 发起决斗\n` +
    `💰 <b>赌注：</b>${escapeHtml(stake)}\n\n` +
    `🎲 <b>${escapeHtml(initiatorName)}</b> 掷出了 <b>${pointA}</b> 点\n` +
    `🎲 <b>${escapeHtml(targetName)}</b> 掷出了 <b>${pointB}</b> 点\n\n` +
    `🏆 <b>胜利者：${escapeHtml(winner)}</b> (${winnerPoints}点)\n\n` +
    `💰 <b>请兑现赌注！</b>`;

  try {
    // 编辑原消息显示结果（保持同一张图片）
    await TgMessage.send(env, 'editMessageCaption', {
      chat_id,
      message_id,
      caption: resultText,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "删除消息", callback_data: JSON.stringify({ type: "delete_message" }) }]
        ]
      }
    });

    await TgMessage.answerCallbackQuery(env, cq.id, {
      text: "决斗已完成！",
      show_alert: false
    });

  } catch (e) {
    console.error("[duel callback] 处理决斗结果失败", e);
    await TgMessage.answerCallbackQuery(env, cq.id, {
      text: "处理失败，请稍后重试。",
      show_alert: true
    });
  }
}