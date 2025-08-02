export function handleGroll(msg: any, env: any): Record<string, any> {
  const botName = env.BOT_USERNAME;
  const getName = (u: any) => u.first_name || "玩家";

  // 兼容 message 和 callback_query
  const chat_id = msg.chat?.id ?? msg.message.chat.id;
  const thread_id = msg.message_thread_id ?? msg.message?.message_thread_id;

  // 辅助：解析现有 rolls
  const parseRolls = (text: string) => {
    const rolls: Array<{ user: string; point: number }> = [];
    text.split("\n").forEach(line => {
      const m = line.match(/^\s*-\s*(.+)：(\d+)/);
      if (m) rolls.push({ user: m[1], point: parseInt(m[2], 10) });
    });
    return rolls;
  };

  // 辅助：编辑消息
  const editMessage = (text: string, buttons: any[] = []) => ({
    method: "editMessageText",
    chat_id,
    message_id: msg.message?.message_id,
    ...(thread_id && { message_thread_id: thread_id }),
    text,
    parse_mode: "HTML",
    reply_markup: buttons.length ? { inline_keyboard: buttons } : { inline_keyboard: [] }
  });

  // —— 回调阶段 ——
  // 普通 roll
  if (msg.data === "groll_accept") {
    const replier = getName(msg.from);
    const rolls = parseRolls(msg.message.text);
    if (rolls.some(r => r.user === replier)) {
      return { method: "answerCallbackQuery", callback_query_id: msg.id, text: `${replier} 已经掷过点了。`, show_alert: true };
    }
    if (rolls.length >= 100) {
      return { method: "answerCallbackQuery", callback_query_id: msg.id, text: `参加人数已达上限（20 人）。`, show_alert: true };
    }
    rolls.push({ user: replier, point: Math.floor(Math.random() * 100) + 1 });

    // 提取 initiator 和描述
    const titleLine = msg.message.text.split("\n")[0];
    const initiatorMatch = titleLine.match(/^🎲\s*(.+?)\s*发起了一个群骰(?:\s+(.+))?$/);
    const initiator = initiatorMatch?.[1] || "玩家";

    // 重建文本
    let text = `${titleLine}\n`;
    rolls.forEach(r => (text += `- ${r.user}：${r.point}\n`));
    text += `\n其他玩家点击按钮加入掷点：`;

    // 按钮：roll & end
    const buttons = [
      [{ text: "我也要 Roll 🎲", callback_data: "groll_accept" }],
      [{ text: "结束群骰", callback_data: `groll_end`}]
    ];
    return editMessage(text, buttons);
  }

  // 结束群骰，仅 initiator 可点，并输出排序结果
  if (msg.data === "groll_end") {
    const titleLine = msg.message.text.split("\n")[0];
    const initiator = (titleLine.match(/^🎲\s*(.+?)\s*发起了一个群骰/) || [])[1] || "玩家";
    const caller = getName(msg.from);
    if (caller !== initiator) {
      return { method: "answerCallbackQuery", callback_query_id: msg.id, text: `只有发起人 ${initiator} 能结束群骰。`, show_alert: true };
    }
    const rolls = parseRolls(msg.message.text);
    if (!rolls.length) {
      return editMessage(`没有有效的掷点记录，群骰已结束。`);
    }
    // 根据点数排序，降序
    const sortedRolls = rolls.slice().sort((a, b) => b.point - a.point);
    const maxPoint = sortedRolls[0].point;
    const winners = sortedRolls.filter(r => r.point === maxPoint).map(r => r.user).join("，");

    // 重建排序后文本，添加名次
    let text = `${titleLine}\n`;
    sortedRolls.forEach((r, idx) => {
      text += `${idx + 1}# ${r.user}：${r.point}\n`;
    });
    text += `\n🏆 胜利者：${winners}，点数：${maxPoint}`;

    return editMessage(text, []);
  }

  // —— 发起阶段 ——
  const startMatch = msg.text?.match(new RegExp(`@${botName}\\s+/groll\\s*(.*)`, "i"));
  if (startMatch) {
    const initiator = getName(msg.from);
    const description = startMatch[1]?.trim();
    const title = description ? `🎲 ${initiator} 发起了一个群骰 ${description}` : `🎲 ${initiator} 发起了一个群骰`;
    const text = `${title}\n\n其他玩家点击按钮加入掷点：`;
    const buttons = [
      [{ text: "我也要 Roll 🎲", callback_data: "groll_accept" }],
      [{ text: "结束群骰", callback_data: "groll_end" }]
    ];
    return { chat_id, ...(thread_id && { message_thread_id: thread_id }), text, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
  }

  // 其它情况
  return {};
}
