// commands/duel.ts
import TgMessage, { ParsedUpdate, EnvLike } from '../lib/telegram';
import { escapeHtml } from "../lib/util";

/**
 * Duel 重构版
 * - 通过回复消息确认决斗对象
 * - 接受决斗后才进行双方掷点
 * - 在单条消息中包含图片、文本和按钮
 * - 所有必要信息存储在 callback_data 中
 */

type ShortCb = {
  type: "duel";          // type
  i: number;          // initiatorId
  d: number;          // targetId
  s: string;          // stake (截断到安全长度)
};

const reply_delete = {
  inline_keyboard: [[{ text: "删除消息", callback_data: JSON.stringify({ type: "delete_message" }) }]]
};

// 决斗氛围图片 ID
                       
const DUEL_IMAGE_PATH = "https://luyiqi-lili.github.io/pic/sticker.jpg";

/**
 * 处理 /duel 发起（通过回复消息确认决斗对象）
 */
export async function handleDuel(parsed: ParsedUpdate, env: EnvLike) {
  if (!parsed || parsed.type !== "message" || !parsed.message) return;

  const chat_id = parsed.chatId!;
  const thread_id = parsed.threadId;
  const botName = env.BOT_USERNAME || "";

  const initiatorId = parsed.from?.id;
  const initiatorFirst = parsed.from?.first_name || "决斗者";
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

  // 获取用户显示名称（带链接）
  const initiatorInfo = await TgMessage.fetchChatMember(env, chat_id, initiatorId!);
  const targetInfo = await TgMessage.fetchChatMember(env, chat_id, targetId);

  // 构建决斗邀请消息
  const captionText =
    `⚔️ <b>决斗邀请</b> ⚔️\n\n` +
    `🗡️ ${initiatorInfo.first_name} 向 ${targetInfo.first_name} 发起决斗！\n` +
    `💰 <b>赌注：</b>${escapeHtml(stake)}\n\n` +
    `⚠️ ${targetInfo.first_name} 请点击下方按钮接受决斗！`;

  // callback_data 包含所有必要信息，使用缩写字段名减少长度
  const cb: ShortCb = {
    type: "duel",
    i: initiatorId!,
    d: targetId,
    s: stake.slice(0, 20) // 限制赌注长度，避免超过64字节限制
  };

  const callbackData = JSON.stringify(cb);
  console.log("[duel] callback_data 长度:", callbackData.length, "内容:", callbackData);

  // 检查长度是否超过限制
  if (callbackData.length > 64) {
    console.error("[duel] callback_data 超过64字节限制:", callbackData.length);
    // 如果还是太长，进一步缩短赌注
    cb.s = stake.slice(0, 10);
    const finalCallbackData = JSON.stringify(cb);
    console.log("[duel] 调整后的 callback_data 长度:", finalCallbackData.length);
  }

  try {
    // 使用 sendPhoto 发送包含图片、文本和按钮的单条消息
    await TgMessage.sendPhoto(env, {
      chat_id,
      photo: DUEL_IMAGE_PATH,
      caption: captionText,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "⚔️ 接受决斗", callback_data: JSON.stringify(cb) }]
        ]
      },
      message_thread_id: thread_id
    });

  } catch (e) {
    console.error("[duel] 发送决斗消息失败", e);
    // 如果发送图片失败，回退到纯文本
    await TgMessage.sendText(env, {
      chat_id,
      text: captionText + `\n\n🗡️ ${targetInfo.first_name}，点击按钮接受决斗：`,
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
  if (callbackData.type !== "duel"  ) return;

  const msg = cq.message;
  if (!msg) {
    await TgMessage.answerCallbackQuery(env, cq.id, { text: "回调消息缺失", show_alert: true });
    return;
  }

  const chat_id = msg.chat?.id;
  const message_id = msg.message_id;

  // 验证调用者是否为被挑战者
  const expectedTargetId = callbackData.d; // 使用缩写字段
  const callerId = cq.from?.id;

  if (expectedTargetId !== callerId) {
    await TgMessage.answerCallbackQuery(env, cq.id, {
      text: "只有被挑战者才能接受此决斗！",
      show_alert: true
    });
    return;
  }

  // 从 callback_data 中获取所有必要信息（使用缩写字段）
  const initiatorId = callbackData.i;
  const targetId = callbackData.d;
  const stake = callbackData.s;

  // 获取用户显示名称（带链接）
  const initiatorInfo = await TgMessage.fetchChatMember(env, chat_id, initiatorId);
  const targetInfo = await TgMessage.fetchChatMember(env, chat_id, targetId);

  // 双方掷点
  const pointA = Math.floor(Math.random() * 100) + 1; // 发起者点数
  const pointB = Math.floor(Math.random() * 100) + 1; // 接受者点数

  const winner = pointB > pointA ? targetInfo.first_name : initiatorInfo.first_name;
  const winnerPoints = Math.max(pointA, pointB);

  const resultText =
    `⚔️ <b>决斗结果</b> ⚔️\n\n` +
    `🎲 ${initiatorInfo.first_name} 掷出了 <b>${pointA}</b> 点\n` +
    `🎲 ${targetInfo.first_name} 掷出了 <b>${pointB}</b> 点\n\n` +
    `🏆 <b>胜利者：${winner}</b> (${winnerPoints}点)\n\n` +
    `💰 <b>赌注：${escapeHtml(stake)}</b>\n\n` +
    `🎉 <b>请兑现赌注！</b>`;

  try {
    // 编辑原消息显示结果（保持图片，更新文本和按钮）
    await TgMessage.editMessageCaption(env, {
      chat_id,
      message_id,
      caption: resultText,
      parse_mode: "HTML",
    });

    await TgMessage.answerCallbackQuery(env, cq.id, {
      text: "决斗完成！",
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