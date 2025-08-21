// commands/duel.ts
import TgMessage, { ParsedUpdate, EnvLike } from "../lib/tgMessage";

/**
 * Duel 重构：
 * - handleDuel(parsed, env)         : 处理 /duel 发起（接收 ParsedUpdate）
 * - handleDuelCallback(cq, data, env): 处理回调（callback_query + 解析后的 callbackData JSON）
 *
 * callback_data 示例（JSON 字符串）:
 * {
 *   "type":"duel",
 *   "action":"accept",
 *   "challengerFirst":"张三",
 *   "challengerId":12345,
 *   "targetIdent":"lihua",      // 优先作为 username（无 @），没有时为展示名
 *   "targetDisplay":"李华",     // 用于显示（first_name 或输入的目标名）
 *   "stake":"一瓶可乐",
 *   "pointA":42
 * }
 *
 * 注意：为了安全验证，我们在 callback_data 中带上 challengerId（数值）以及 targetIdent（通常为 username，无 @）。
 *       在展示时只用 challengerFirst / targetDisplay（不展示任何 id）。
 */

type CallbackData = {
  type: "duel";
  action: "accept";
  challengerFirst: string;
  challengerId?: number;
  targetIdent?: string; // username without @, or empty
  targetDisplay: string; // 用于显示的名字（first_name 或提供的名称）
  stake: string;
  pointA: number;
};

function pickDisplayNameFromParsed(parsed: ParsedUpdate) {
  return parsed.from?.first_name || "决斗者";
}

/**
 * 处理 /duel 发起（接收 ParsedUpdate）
 */
export async function handleDuel(parsed: ParsedUpdate, env: EnvLike) {
  if (!parsed || parsed.type !== "message" || !parsed.message) {
    console.log("[duel] 非 message 类型或缺少 message，忽略");
    return;
  }

  const chat_id = parsed.chatId!;
  const thread_id = parsed.threadId;
  const botName = env.BOT_USERNAME || "";

  const initiatorFirst = pickDisplayNameFromParsed(parsed);
  // parsed.args 期望： [ "@target", "赌注的其余文字..." ]
  const args = parsed.args || [];
  if (args.length < 2) {
    // 格式不正确，提示帮助
    await TgMessage.sendText(env, {
      chat_id,
      text: `命令格式不正确。\n正确用法：@${botName} /duel @对手 赌注文本\n例如：@${botName} /duel @lihua 一瓶可乐`,
      parse_mode: "HTML",
      message_thread_id: thread_id
    });
    return;
  }

  // 第一个参数可能为 @username 或直接为名称
  let rawTarget = args[0].trim();
  let targetIdent: string | undefined = undefined;
  if (rawTarget.startsWith("@")) {
    targetIdent = rawTarget.slice(1); // username without @
  } else {
    // 作为展示名直接使用
    targetIdent = undefined;
  }

  const stake = args.slice(1).join(" ").trim();
  if (!stake) {
    await TgMessage.sendText(env, {
      chat_id,
      text: `请指定赌注。示例：@${botName} /duel @对手 赌注文本`,
      parse_mode: "HTML",
      message_thread_id: thread_id
    });
    return;
  }

  // 目标展示名（优先尝试去掉 @）
  const targetDisplay = rawTarget.startsWith("@") ? rawTarget.slice(1) : rawTarget;

  // 不允许自己对自己或对 Bot 发起
  if (targetDisplay === initiatorFirst || (env.BOT_USERNAME && targetDisplay.toLowerCase() === env.BOT_USERNAME.toLowerCase())) {
    await TgMessage.sendText(env, {
      chat_id,
      text: `目标不能是自己或机器人。正确用法：@${botName} /duel @对手 赌注文本`,
      parse_mode: "HTML",
      message_thread_id: thread_id
    });
    return;
  }

  // 随机掷点 A（发起者点数）
  const pointA = Math.floor(Math.random() * 100) + 1;

  // 构造初始消息文本（只显示 first_name / 展示名，不显示 id）
  const initText =
    `${initiatorFirst} 对 ${targetDisplay} 发起了决斗，赌注是：${escapeHtml(stake)}\n` +
    `🎲 ${initiatorFirst} 掷出了 ${pointA} 点\n` +
    `⚠️ ${targetDisplay} 请点击下方按钮接受决斗：`;

  // 构造 callback_data JSON（字符串化）
  const cb: CallbackData = {
    type: "duel",
    action: "accept",
    challengerFirst: initiatorFirst,
    challengerId: parsed.from?.id, // 用于后端验证（不会展示）
    targetIdent: targetIdent, // username without @ (若存在)
    targetDisplay: targetDisplay,
    stake: stake,
    pointA: pointA
  };

  try {
    await TgMessage.sendText(env, {
      chat_id,
      text: initText,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "接受决斗",
              callback_data: JSON.stringify(cb)
            }
          ]
        ]
      },
      message_thread_id: thread_id
    });
  } catch (e) {
    console.error("[duel] 发送初始消息失败", e);
  }
}

/**
 * 处理 duel 的 callback（callback_query + 解析后的 callbackData object）
 */
export async function handleDuelCallback(callbackQuery: any, callbackData: any, env: EnvLike) {
  const cq = callbackQuery;
  if (!callbackData || typeof callbackData !== "object" || callbackData.type !== "duel") {
    console.log("[duel callback] 非 duel 回调，忽略", callbackData);
    return;
  }

  // 解析并断言类型
  const data = callbackData as CallbackData;
  const msg = cq.message;
  if (!msg) {
    await TgMessage.answerCallbackQuery(env, cq.id, { text: "回调消息缺失", show_alert: true });
    return;
  }

  const chat_id = msg.chat?.id;
  const message_id = msg.message_id;

  // 验证：只有被挑战者能点接受
  const callerUsername = cq.from?.username ? String(cq.from.username).toLowerCase() : undefined;
  const callerFirst = cq.from?.first_name || "";
  let isTarget = false;

  if (data.targetIdent) {
    // 有提供 username 作为 targetIdent，优先用 username 校验
    if (callerUsername && callerUsername === data.targetIdent.toLowerCase()) {
      isTarget = true;
    } else {
      // username 不匹配，尝试用 first_name 与提供的 targetDisplay 比较
      if (callerFirst === data.targetDisplay) isTarget = true;
    }
  } else {
    // 没有 username 信息，使用 first_name 比较（fallback）
    if (callerFirst === data.targetDisplay) isTarget = true;
  }

  if (!isTarget) {
    await TgMessage.answerCallbackQuery(env, cq.id, {
      text: `只有 ${data.targetDisplay} 本人才能接受此决斗。`,
      show_alert: true
    });
    return;
  }

  // 进行掷点，比较点数
  const pointA = Number(data.pointA || 0);
  const pointB = Math.floor(Math.random() * 100) + 1;
  const userAName = data.challengerFirst || "挑战者";
  const userBName = data.targetDisplay || (cq.from?.first_name || "挑战者");

  const winner = pointB > pointA ? userBName : userAName;

  const resultText =
    `${userAName} 对 ${userBName} 发起了决斗，赌注是：${escapeHtml(data.stake)}\n` +
    `🎲 ${userAName} 掷出了 ${pointA} 点\n` +
    `${userBName} 接受决斗，🎲 掷出了 ${pointB} 点\n` +
    `\n🏆 胜利者：${winner}，请兑现赌注！`;

  try {
    await TgMessage.editMessageText(env, {
      chat_id,
      message_id,
      parse_mode: "HTML",
      text: resultText,
      reply_markup: { inline_keyboard: [] }
    });
  } catch (e) {
    console.error("[duel callback] 编辑结果消息失败", e);
    // 回答 callback 以解除客户端 loading
    await TgMessage.answerCallbackQuery(env, cq.id, { text: "处理失败，请稍后重试。", show_alert: true });
  }
}

/** 简单的 HTML 转义，防止赌注文本破坏 HTML */
function escapeHtml(s: string) {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
