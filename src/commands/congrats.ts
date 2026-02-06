import TgMessage, { ParsedUpdate, EnvLike } from "../lib/tgMessage";
import { deleteMarkup, escapeHtml } from "../lib/util";

interface CongratsCallbackData {
  type: string;
  recipientId: string;  // 收到钱的用户A
  targetId: string;    // 需要点按钮的用户B（被回复的人）
  amount: number;      // 金额
  timestamp: number;   // 时间戳防止重放
}

export async function handleCongrats(parsedMessage: ParsedUpdate, env: EnvLike): Promise<void> {
  const chatId = parsedMessage.chatId ?? parsedMessage.message?.chat?.id;
  const threadId = parsedMessage.threadId ?? parsedMessage.message?.message_thread_id;
  const from = parsedMessage.from ?? parsedMessage.message?.from;

  if (!chatId || !from) {
    console.error("[congrats] 找不到 chatId 或 from，跳过");
    return;
  }

  // 检查是否是回复消息
  if (!parsedMessage.isReply || !parsedMessage.replyToMessage?.from) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: "❌ 请回复某人的消息来使用此命令。",
      parse_mode: "HTML",
      message_thread_id: threadId,
      reply_markup: deleteMarkup,
    });
    return;
  }

  const userA = from; // 发送命令的人（要收钱的人）
  const userB = parsedMessage.replyToMessage.from; // 被回复的人（要给钱的人）

  // 不能自己给自己发
  if (userA.id === userB.id) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: "❌ 不能自己回复自己哦。",
      parse_mode: "HTML",
      message_thread_id: threadId,
      reply_markup: deleteMarkup,
    });
    return;
  }

  // 获取用户显示名
  let userAName = "用户";
  let userBName = "用户";
  
  try {
    const userAMember = await TgMessage.fetchChatMember(env, chatId, userA.id);
    userAName = userAMember.first_name || `用户${userA.id}`;
  } catch (e) {
    userAName = `用户${userA.id}`;
  }
  
  try {
    const userBMember = await TgMessage.fetchChatMember(env, chatId, userB.id);
    userBName = userBMember.first_name || `用户${userB.id}`;
  } catch (e) {
    userBName = `用户${userB.id}`;
  }

  // 生成按钮
  const timestamp = Date.now();
  const buttons = [
    [
      {
        text: "发 1 💰",
        callback_data: JSON.stringify({
          type: "congrats",
          recipientId: String(userA.id),
          targetId: String(userB.id),
          amount: 1,
          timestamp,
        } as CongratsCallbackData),
      },
    ],
    [
      {
        text: "发 5 💰",
        callback_data: JSON.stringify({
          type: "congrats",
          recipientId: String(userA.id),
          targetId: String(userB.id),
          amount: 5,
          timestamp,
        } as CongratsCallbackData),
      },
    ],
    [
      {
        text: "发 10 💰",
        callback_data: JSON.stringify({
          type: "congrats",
          recipientId: String(userA.id),
          targetId: String(userB.id),
          amount: 10,
          timestamp,
        } as CongratsCallbackData),
      },
    ],
  ];

  const replyMarkup = TgMessage.buildInlineKeyboard(buttons);

  await TgMessage.sendText(env, {
    chat_id: chatId,
    text: `🎉 <b>恭喜发财，红包拿来！</b>\n\n` +
          `👤 <b>${escapeHtml(userAName)}</b> 向 <b>${escapeHtml(userBName)}</b> 讨要红包啦！\n` +
          `💰 点击下方按钮发送金币吧～\n` +
          `<i>（只有被回复的人可以点击哦）</i>`,
    parse_mode: "HTML",
    message_thread_id: threadId,
    reply_markup: replyMarkup,
  });
}

export async function handleCongratsCallback(callbackQuery: any, callbackData: any, env: EnvLike): Promise<void> {
  const chatId = callbackQuery.message?.chat?.id;
  const messageId = callbackQuery.message?.message_id;
  const from = callbackQuery.from;

  if (!chatId || !messageId || !from) {
    console.error("[congrats] 回调缺少必要信息");
    return;
  }

  const data = callbackData as CongratsCallbackData;
  
  // 验证点击者是否是被回复的用户B
  if (String(from.id) !== data.targetId) {
    await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
      text: "❌ 只有被回复的人可以发红包哦！",
      show_alert: true,
    });
    return;
  }

  // 验证时间戳（防止重放攻击，10分钟内有效）
  const now = Date.now();
  if (now - data.timestamp > 10 * 60 * 1000) {
    await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
      text: "❌ 红包已过期，请重新发送命令",
      show_alert: true,
    });
    return;
  }

  // 获取 CoinDO 的 stub
  const doNs = (env as any).COIN_DO;
  if (!doNs) {
    console.error("[congrats] 没有 COIN_DO namespace");
    await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
      text: "❌ 系统错误：货币系统未初始化",
      show_alert: true,
    });
    return;
  }

  // 转账逻辑
  try {
    const stub = doNs.idFromName("coins");
    const coinDo = doNs.get(stub);

    // 使用 transfer 接口
    const transferResult = await coinDo.fetch("https://do/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: data.targetId,    // 用户B 转出
        to: data.recipientId,   // 用户A 接收
        amount: data.amount,
      }),
    });

    const result = await transferResult.json();
    
    if (!result.ok) {
      let errorMsg = "转账失败";
      if (result.reason === "insufficient") {
        errorMsg = "余额不足";
      } else if (result.reason === "invalid amount") {
        errorMsg = "金额无效";
      }
      
      await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
        text: `❌ ${errorMsg}`,
        show_alert: true,
      });
      return;
    }

    // 获取用户显示名
    let recipientName = `用户${data.recipientId}`;
    let targetName = `用户${data.targetId}`;
    
    try {
      const recipientMember = await TgMessage.fetchChatMember(env, chatId, parseInt(data.recipientId));
      recipientName = recipientMember.first_name || recipientName;
    } catch (e) {}
    
    try {
      const targetMember = await TgMessage.fetchChatMember(env, chatId, parseInt(data.targetId));
      targetName = targetMember.first_name || targetName;
    } catch (e) {}

    // 成功提示
    await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
      text: `✅ 成功发送 ${data.amount} 💰 给 ${recipientName}！`,
      show_alert: true,
    });

    // 更新消息显示
    const newText = `🎉 <b>恭喜发财，红包拿来！</b>\n\n` +
                    `👤 <b>${escapeHtml(recipientName)}</b> 向 <b>${escapeHtml(targetName)}</b> 讨要红包啦！\n` +
                    `💰 点击下方按钮发送金币吧～\n` +
                    `<i>（只有被回复的人可以点击哦）</i>\n\n` +
                    `✨ <b>${escapeHtml(targetName)}</b> 已经发送了 <b>${data.amount} 💰</b>！`;

    await TgMessage.editMessageText(env, {
      chat_id: chatId,
      message_id: messageId,
      text: newText,
      parse_mode: "HTML",
      reply_markup: TgMessage.buildInlineKeyboard([
        [
          {
            text: "再发 1 💰",
            callback_data: JSON.stringify({
              ...data,
              timestamp: Date.now(), // 更新时间戳
            }),
          },
        ],
        [
          {
            text: "再发 5 💰",
            callback_data: JSON.stringify({
              ...data,
              timestamp: Date.now(),
            }),
          },
        ],
        [
          {
            text: "再发 10 💰",
            callback_data: JSON.stringify({
              ...data,
              timestamp: Date.now(),
            }),
          },
        ],
      ]),
    });

  } catch (error) {
    console.error("[congrats] 转账失败", error);
    await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
      text: "❌ 转账失败，请稍后重试",
      show_alert: true,
    });
  }
}

export default handleCongrats;