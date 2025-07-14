// src/commands/duel.ts
export function handleDuel(msg: any, env: any): Record<string, any> {
  const botName = env.BOT_USERNAME;
  const getId = (u: any) => u.username || u.first_name || "决斗者";

  // 兼容 message 和 callback_query
  const chat_id = msg.chat?.id ?? msg.message.chat.id;
  const thread_id = msg.message_thread_id ?? msg.message?.message_thread_id;

  // —— 回调阶段：接受决斗 ——
  if (msg.data?.startsWith("duel_accept:")) {
    const [, userA, userB, stake, pointAStr] = msg.data.split(":");
    const pointA = parseInt(pointAStr, 10);
    const replier = getId(msg.from);

    // 调试日志：打印 replier 和 期望的 userB
    console.log(`[Duel] Replier: \${replier}, Expected target: \${userB}`);
    console.log(`[Duel] msg.from.username: \${msg.from.username}, msg.from.first_name: \${msg.from.first_name}`);

    // 只有被挑战者能点
    if (replier !== userB) {
      return {
        method: "answerCallbackQuery",
        callback_query_id: msg.id,
        text: `只有 \${userB} 本人才能接受此决斗。`,
        show_alert: true
      };
    }

    // 掷点，决胜负
    const pointB = Math.floor(Math.random() * 100) + 1;
    const winner = pointB > pointA ? userB : userA;
    const resultText =
      `${userA} 对 ${userB} 发起了决斗，赌注是：${stake}\n` +
      `🎲 ${userA} 掷出了 ${pointA} 点\n` +
      `${userB} 接受决斗，🎲 掷出了 ${pointB} 点\n` +
      `🏆 胜利者：${winner}，请兑现赌注！`;

    return {
      method: "editMessageText",
      chat_id,
      message_id: msg.message.message_id,
      text: resultText,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [] }
    };
  }

  // —— 发起阶段：/duel @user 赌注 ——
  const m = msg.text.match(
    new RegExp(`@${botName}\\s+/duel\\s+(?:@)?(\\S+)\\s+(.+)`, "i")
  );
  if (m) {
    const target = m[1].replace(/^@/, "");
    const stake = m[2].trim();
    const challenger = getId(msg.from);

    if (!stake || target === challenger || target === botName) {
      return {
        chat_id,
        text: `格式错误或对象不能是自己/Bot。正确用法：@${botName} /duel @目标 赌注文本`,
        parse_mode: "HTML"
      };
    }

    const pointA = Math.floor(Math.random() * 100) + 1;
    const initText =
      `${challenger} 对 ${target} 发起了决斗，赌注是：${stake}\n` +
      `🎲 ${challenger} 掷出了 ${pointA} 点\n` +
      `⚠️ ${target} 请点击下方按钮接受决斗：`;

    return {
      chat_id,
      text: initText,
      parse_mode: "HTML",
      ...(thread_id && { message_thread_id: thread_id }),
      reply_markup: {
        inline_keyboard: [[
          {
            text: "接受决斗",
            callback_data: `duel_accept:${challenger}:${target}:${stake}:${pointA}`
          }
        ]]
      }
    };
  }

  // —— 其它情况 ——
  return {
    chat_id,
    text: `命令格式不正确。\n正确用法：@${botName} /duel @对手 赌注文本`,
    parse_mode: "HTML"
  };
}
