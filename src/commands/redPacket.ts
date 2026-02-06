// commands/redPacket.ts
import TgMessage, { ParsedUpdate, EnvLike } from "../lib/tgMessage";
import { escapeHtml } from "../lib/util";

type RedPacketEnv = EnvLike & {
  COIN_DO: DurableObjectNamespace;
};

/**
 * 处理 /恭喜发财，红包拿来 和 /妈妈 命令
 */
export async function handleRedPacket(parsedMessage: ParsedUpdate, env: RedPacketEnv): Promise<void> {
  const chatId = parsedMessage.chatId ?? parsedMessage.message?.chat?.id;
  const threadId = parsedMessage.threadId ?? parsedMessage.message?.message_thread_id;
  const from = parsedMessage.from ?? parsedMessage.message?.from;

  if (!chatId || !from) {
    console.error("[redPacket] 找不到 chatId 或 from");
    return;
  }

  // 检查是否为回复消息
  if (!parsedMessage.isReply || !parsedMessage.replyToMessage?.from) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: "❌ 请回复某人的消息来发送红包请求！",
      parse_mode: "HTML",
      message_thread_id: threadId
    });
    return;
  }

  const userA = from; // 发送命令的用户
  const userB = parsedMessage.replyToMessage.from; // 被回复的用户

  // 不能给自己发红包请求
  if (userA.id === userB.id) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: "❌ 不能给自己发红包请求哦！",
      parse_mode: "HTML",
      message_thread_id: threadId
    });
    return;
  }

  // 获取用户显示名称
  const userAName = await getUserDisplayName(env, chatId, userA.id);
  const userBName = await getUserDisplayName(env, chatId, userB.id);

  // 创建回调数据
  const callbackData = JSON.stringify({
    type: "red_packet",
    fromId: userA.id.toString(),
    toId: userB.id.toString(),
    chatId: chatId.toString(),
    messageId: parsedMessage.message?.message_id?.toString()
  });

  // 发送消息并附上按钮
  await TgMessage.sendText(env, {
    chat_id: chatId,
    text: `🎁 <b>${userAName}</b> 向 <b>${userBName}</b> 发起了红包请求！\n\n` +
          `${userBName}，点击下方按钮发送红包给 ${userAName}～`,
    parse_mode: "HTML",
    message_thread_id: threadId,
    reply_markup: {
      inline_keyboard: [[
        {
          text: "🎁 发红包",
          callback_data: callbackData
        }
      ]]
    }
  });
}

/**
 * 处理红包回调
 */
export async function handleRedPacketCallback(
  callbackQuery: any,
  callbackData: any,
  env: RedPacketEnv
): Promise<void> {
  const fromId = callbackData.fromId; // 用户A（收红包的人）
  const toId = callbackData.toId; // 用户B（点击按钮的人）
  const chatId = parseInt(callbackData.chatId);
  const callerId = callbackQuery.from.id.toString();

  // 验证：只有被回复的用户（userB）才能点击
  if (callerId !== toId) {
    await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
      text: "❌ 只有被@的人才能发红包哦！",
      show_alert: true
    });
    return;
  }

  // 获取用户显示名称
  const userAName = await getUserDisplayName(env, chatId, parseInt(fromId));
  const userBName = await getUserDisplayName(env, chatId, parseInt(toId));

  // 发送弹窗让用户输入金额
  await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
    text: `请输入要发给 ${userAName} 的coin数量（1-1000）`,
    show_alert: true
  });

  // 注意：Telegram的callback query弹窗不支持直接输入
  // 我们需要使用另一种方式：发送一条消息让用户输入金额
  // 这里我们直接使用一个简单的转账逻辑，或者改为让用户发送特定格式的消息
  
  // 方案1：直接转账固定金额（比如10 coin）
  // 方案2：使用inline键盘让用户选择金额
  // 这里我采用方案2，因为Telegram callback不支持弹窗输入

  // 发送金额选择键盘
  const amountButtons = [
    [
      { text: "10 💰", callback_data: JSON.stringify({ type: "red_packet_amount", fromId, toId, amount: 10 }) },
      { text: "50 💰", callback_data: JSON.stringify({ type: "red_packet_amount", fromId, toId, amount: 50 }) },
      { text: "100 💰", callback_data: JSON.stringify({ type: "red_packet_amount", fromId, toId, amount: 100 }) }
    ],
    [
      { text: "自定义金额", callback_data: JSON.stringify({ type: "red_packet_custom", fromId, toId }) }
    ]
  ];

  // 编辑原消息，添加金额选择
  await TgMessage.editMessageText(env, {
    chat_id: chatId,
    message_id: callbackQuery.message.message_id,
    text: `🎁 <b>${userAName}</b> 向 <b>${userBName}</b> 发起了红包请求！\n\n` +
          `${userBName}，请选择要发送的金额：`,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: amountButtons }
  });
}

/**
 * 处理红包金额选择回调
 */
export async function handleRedPacketAmountCallback(
  callbackQuery: any,
  callbackData: any,
  env: RedPacketEnv
): Promise<void> {
  const fromId = callbackData.fromId; // 用户A（收红包的人）
  const toId = callbackData.toId; // 用户B（发红包的人）
  const amount = callbackData.amount;
  const chatId = callbackQuery.message.chat.id;
  const callerId = callbackQuery.from.id.toString();

  // 验证：只有被回复的用户（userB）才能点击
  if (callerId !== toId) {
    await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
      text: "❌ 只有被@的人才能发红包哦！",
      show_alert: true
    });
    return;
  }

  // 获取用户显示名称
  const userAName = await getUserDisplayName(env, chatId, parseInt(fromId));
  const userBName = await getUserDisplayName(env, chatId, parseInt(toId));

  // 执行转账：从userB转给userA
  const doNs = env.COIN_DO;
  
  // 获取userB的余额
  const userBBalance = await getBalance(doNs, toId);
  if (userBBalance < amount) {
    await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
      text: `❌ 余额不足！你只有 ${userBBalance} 💰`,
      show_alert: true
    });
    return;
  }

  // 执行转账
  const transferResult = await transfer(env, doNs, toId, fromId, amount);
  
  if (transferResult.ok) {
    // 更新消息显示转账成功
    await TgMessage.editMessageText(env, {
      chat_id: chatId,
      message_id: callbackQuery.message.message_id,
      text: `🎉 <b>红包发送成功！</b>\n\n` +
            `${userBName} 向 ${userAName} 发送了 ${amount} 💰\n` +
            `用户A新余额: ${transferResult.toNew} 💰\n` +
            `用户B新余额: ${transferResult.fromNew} 💰`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [] }
    });

    // 回答callback query
    await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
      text: `✅ 成功发送 ${amount} 💰 给 ${userAName}`,
      show_alert: false
    });
  } else {
    await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
      text: `❌ 转账失败: ${transferResult.reason || "未知错误"}`,
      show_alert: true
    });
  }
}

/**
 * 处理自定义金额回调
 */
export async function handleRedPacketCustomCallback(
  callbackQuery: any,
  callbackData: any,
  env: RedPacketEnv
): Promise<void> {
  const fromId = callbackData.fromId;
  const toId = callbackData.toId;
  const chatId = callbackQuery.message.chat.id;
  const callerId = callbackQuery.from.id.toString();

  // 验证：只有被回复的用户（userB）才能点击
  if (callerId !== toId) {
    await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
      text: "❌ 只有被@的人才能发红包哦！",
      show_alert: true
    });
    return;
  }

  // 获取用户显示名称
  const userAName = await getUserDisplayName(env, chatId, parseInt(fromId));

  // 发送提示消息，让用户输入特定格式
  await TgMessage.sendText(env, {
    chat_id: chatId,
    text: `💬 <b>${userAName}</b>，请在聊天中发送：\n<code>/coin send &lt;金额&gt; @${userAName}</code>\n\n` +
          `例如：<code>/coin send 50 @${userAName}</code>`,
    parse_mode: "HTML",
    reply_to_message_id: callbackQuery.message.message_id
  });

  // 回答callback query
  await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
    text: "请查看消息输入自定义金额",
    show_alert: false
  });
}

// 辅助函数：获取用户显示名称
async function getUserDisplayName(env: EnvLike, chatId: number, userId: number): Promise<string> {
  try {
    const member = await TgMessage.fetchChatMember(env, chatId, userId);
    return member.first_name || `用户${userId}`;
  } catch (e) {
    return `用户${userId}`;
  }
}

// 辅助函数：获取余额（从coinService复制）
async function getBalance(doNs: DurableObjectNamespace, id: string): Promise<number> {
  const stub = doNs.get(doNs.idFromName("coins"));
  const url = `https://do/get?key=${encodeURIComponent(id)}`;
  const res = await stub.fetch(url, { method: "GET" });
  if (!res.ok) return 0;
  const text = await res.text();
  return Number(text) || 0;
}

// 辅助函数：转账（从coinService复制并简化）
async function transfer(
  env: EnvLike,
  doNs: DurableObjectNamespace,
  from: string,
  to: string,
  amount: number
): Promise<{ ok: boolean; reason?: string; fromNew?: number; toNew?: number }> {
  const stub = doNs.get(doNs.idFromName("coins"));
  const url = `https://do/transfer`;
  const res = await stub.fetch(url, {
    method: "POST",
    body: JSON.stringify({ from, to, amount }),
    headers: { "Content-Type": "application/json" }
  });
  
  const json = await res.json();
  return json;
}

export default {
  handleRedPacket,
  handleRedPacketCallback,
  handleRedPacketAmountCallback,
  handleRedPacketCustomCallback
};