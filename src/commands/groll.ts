// commands/groll.ts
import TgMessage, { ParsedUpdate, EnvLike } from "../lib/tgMessage";

/**
 * Group roll (groll) 重构版
 * - handleGroll(parsed, env)         : 处理发起（ParsedUpdate）
 * - handleGrollCallback(cq, data, env): 处理回调（callback_query + 解析后的 callbackData JSON）
 *
 * callbackData 示例（必须为 JSON 字符串）:
 *  { "type": "groll", "action": "accept" }
 *  { "type": "groll", "action": "end" }
 */

type RollEntry = { user: string; point: number };

const parseRolls = (text: string): RollEntry[] => {
  const rolls: RollEntry[] = [];
  text.split("\n").forEach(line => {
    const m = line.match(/^\s*-\s*(.+)：(\d+)/);
    if (m) rolls.push({ user: m[1], point: parseInt(m[2], 10) });
  });
  return rolls;
};

const getName = (u: any) => u?.first_name || "玩家";

const buildButtons = () => [
  [{ text: "我也要 Roll 🎲", callback_data: JSON.stringify({ type: "groll", action: "accept" }) }],
  [{ text: "结束群骰", callback_data: JSON.stringify({ type: "groll", action: "end" }) }]
];

/**
 * 开始群骰（接收已解析的 parsedMessage）
 */
export async function handleGroll(parsed: ParsedUpdate, env: EnvLike) {
  if (!parsed || parsed.type !== "message" || !parsed.message) {
    console.log("[groll] 非 message 类型，忽略");
    return;
  }

  const botName = env.BOT_USERNAME || "";
  const chat_id = parsed.chatId!;
  const thread_id = parsed.threadId;
  const from = parsed.from;
  const initiator = getName(from);

  // 支持 /groll 或 "@Bot groll ..." 两类触发：parsed.command === 'groll' 或文本包含 /groll
  const isCmd = parsed.command === "groll";
  const textRaw = parsed.text ?? "";
  const matched = isCmd || /\/groll\b/i.test(textRaw) || new RegExp(`@${botName}\\s+/groll`, "i").test(textRaw);

  if (!matched) {
    console.log("[groll] 未检测到发起命令，忽略");
    return;
  }

  // 取参数描述（parsed.args）
  const description = (parsed.args && parsed.args.length > 0) ? parsed.args.join(" ").trim() : "";
  const title = description ? `🎲 ${initiator} 发起了一个群骰 ${description}` : `🎲 ${initiator} 发起了一个群骰`;
  const text = `${title}\n\n其他玩家点击按钮加入掷点：`;

  try {
    await TgMessage.sendText(env, {
      chat_id,
      text,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: buildButtons() },
      message_thread_id: thread_id
    } as any);
  } catch (e) {
    console.error("[groll] 发送起始消息失败", e);
  }
}

/**
 * 处理 groll 的 callback（callback_query + 解析后的 callbackData object）
 */
export async function handleGrollCallback(callbackQuery: any, callbackData: any, env: EnvLike) {
  const cq = callbackQuery;
  const data = callbackData || {};
  // 只处理 type === 'groll'
  if (!data || data.type !== "groll") {
    console.log("[groll callback] 非 groll 回调，忽略", data);
    return;
  }

  const action = data.action || "";
  const replier = getName(cq.from);
  const msg = cq.message;
  if (!msg || !msg.text) {
    await TgMessage.answerCallbackQuery(env, cq.id, { text: "回调消息缺失或内容为空", show_alert: true });
    return;
  }

  const chat_id = msg.chat?.id;
  const message_id = msg.message_id;

  // 解析当前已有 rolls
  const rolls = parseRolls(msg.text);

  // --- accept: 用户加入掷点 ---
  if (action === "accept") {
    // 已参加检查
    if (rolls.some(r => r.user === replier)) {
      await TgMessage.answerCallbackQuery(env, cq.id, { text: `${replier} 已经掷过点了。`, show_alert: true });
      return;
    }

    // 人数上限（保守值）
    const MAX_PARTICIPANTS = 100;
    if (rolls.length >= MAX_PARTICIPANTS) {
      await TgMessage.answerCallbackQuery(env, cq.id, { text: `参加人数已达上限（${MAX_PARTICIPANTS} 人）。`, show_alert: true });
      return;
    }

    // 随机点数 1..100
    const point = Math.floor(Math.random() * 100) + 1;
    rolls.push({ user: replier, point });

    // 重建文本：保留原首行 title
    const titleLine = msg.text.split("\n")[0] || `🎲 群骰`;
    let text = `${titleLine}\n`;
    rolls.forEach(r => (text += `- ${r.user}：${r.point}\n`));
    text += `\n其他玩家点击按钮加入掷点：`;

    // 编辑消息
    try {
      await TgMessage.editMessageText(env, {
        chat_id,
        message_id,
        parse_mode: "HTML",
        text,
        reply_markup: { inline_keyboard: buildButtons() }
      });
    } catch (e) {
      console.error("[groll callback] 编辑消息失败 (accept)", e);
      // 回答 callback 以解除 loading
      await TgMessage.answerCallbackQuery(env, cq.id, { text: "加入失败，稍后再试。", show_alert: true });
    }
    return;
  }

  // --- end: 发起人结束群骰，输出排序结果 ---
  if (action === "end") {
    const titleLine = msg.text.split("\n")[0] || "";
    const initiator = (titleLine.match(/^🎲\s*(.+?)\s*发起了一个群骰/) || [])[1] || "";
    const caller = getName(cq.from);
    if (initiator && caller !== initiator) {
      await TgMessage.answerCallbackQuery(env, cq.id, { text: `只有发起人 ${initiator} 能结束群骰。`, show_alert: true });
      return;
    }

    if (!rolls.length) {
      // 直接编辑为结束状态
      const noText = `${titleLine}\n没有有效的掷点记录，群骰已结束。`;
      try {
        await TgMessage.editMessageText(env, {
          chat_id,
          message_id,
          parse_mode: "HTML",
          text: noText,
          reply_markup: { inline_keyboard: [] }
        });
      } catch (e) {
        console.error("[groll callback] 编辑消息失败 (end no rolls)", e);
      }
      return;
    }

    // 排序并输出名次
    const sorted = rolls.slice().sort((a, b) => b.point - a.point);
    const maxPoint = sorted[0].point;
    const winners = sorted.filter(r => r.point === maxPoint).map(r => r.user).join("，");

    let text = `${titleLine}\n`;
    sorted.forEach((r, idx) => {
      text += `${idx + 1}# ${r.user}：${r.point}\n`;
    });
    text += `\n🏆 胜利者：${winners}，点数：${maxPoint}`;

    try {
      await TgMessage.editMessageText(env, {
        chat_id,
        message_id,
        parse_mode: "HTML",
        text,
        reply_markup: { inline_keyboard: [] }
      });
    } catch (e) {
      console.error("[groll callback] 编辑消息失败 (end)", e);
      await TgMessage.answerCallbackQuery(env, cq.id, { text: "结束失败，稍后再试。", show_alert: true });
    }
    return;
  }

  // 未知 action
  await TgMessage.answerCallbackQuery(env, cq.id, { text: "未知的群骰操作。", show_alert: true });
}
