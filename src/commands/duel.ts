// commands/duel.ts
import TgMessage, { ParsedUpdate, EnvLike } from "../lib/tgMessage";
import {escapeHtml}  from "../lib/util";

/**
 * Duel 精简版（callback_data 只保留短字段）
 *
 * callback_data 示例（字符串化后非常短）：
 *  JSON.stringify({ type: "duel", act: "accept", u: "targetname" })
 *  - type: 固定 "duel"
 *  - act: "accept"
 *  - u: optional, target username without @ (用于精确校验)
 *
 * 备注：
 *  - 发起消息中包含发起者掷点文本（例如 "🎲 张三 掷出了 42 点"），回调时从消息文本解析 pointA。
 *  - 若无法解析 pointA，则视为 0（仍能工作，但结果可能不完全准确）。
 */

type ShortCb = {
  type: "duel";
  act: "accept";
  u?: string; // optional target username without @
};

const reply_delete = {
  inline_keyboard: [[{ text: "删除消息", callback_data: JSON.stringify({ type: "delete_message" }) }]]
};
 

function pickDisplayNameFromParsed(parsed: ParsedUpdate) {
  return parsed.from?.first_name || "决斗者";
}

/**
 * 从 init 消息文本中解析发起者掷点 pointA（例如 "🎲 张三 掷出了 42 点"）
 */
function parsePointAFromInitText(text: string): number {
  if (!text) return 0;
  // 尝试匹配形如 "🎲 发起者 掷出了 42 点"
  const m = text.match(/🎲[\s\S]*?掷出了\s*(\d+)\s*点/);
  if (m) return parseInt(m[1], 10) || 0;
  // 兜底：尝试匹配任何数字
  const m2 = text.match(/(\d{1,3})\s*点/);
  if (m2) return parseInt(m2[1], 10) || 0;
  return 0;
}

/**
 * 从 init 消息首行解析：发起者名、目标名、赌注
 * 期望首行格式： "<initiator> 对 <targetDisplay> 发起了决斗，赌注是：<stake>"
 */
function parseInitTitle(titleLine: string) {
  const res = { userA: "挑战者", userB: "被挑战者", stake: "" };
  if (!titleLine) return res;
  const m = titleLine.match(/^(.+?) 对 (.+?) 发起了决斗，赌注是：(.+)$/);
  if (m) {
    res.userA = m[1].trim();
    res.userB = m[2].trim();
    res.stake = m[3].trim();
  } else {
    // 兜底解析：尽量截取 "对" 之前/之后的片段
    const parts = titleLine.split(" 对 ");
    if (parts.length >= 2) {
      res.userA = parts[0].trim();
      const rest = parts[1];
      const idx = rest.indexOf(" 发起了决斗");
      if (idx !== -1) {
        res.userB = rest.slice(0, idx).trim();
        const stakeMatch = rest.match(/赌注是：(.+)$/);
        if (stakeMatch) res.stake = stakeMatch[1].trim();
      } else {
        res.userB = rest.trim();
      }
    }
  }
  return res;
}

/**
 * 处理 /duel 发起（接收 ParsedUpdate）
 */
export async function handleDuel(parsed: ParsedUpdate, env: EnvLike) {
  if (!parsed || parsed.type !== "message" || !parsed.message) return;

  const chat_id = parsed.chatId!;
  const thread_id = parsed.threadId;
  const botName = env.BOT_USERNAME || "";

  const initiatorFirst = pickDisplayNameFromParsed(parsed);
  const args = parsed.args || [];

  if (args.length < 2) {
    await TgMessage.sendText(env, {
      chat_id,
      text: `命令格式不正确。\n正确用法：@${botName} /duel @对手 赌注文本\n例如：@${botName} /duel @lihua 一瓶可乐`,
      parse_mode: "HTML",
      reply_markup: reply_delete,
      message_thread_id: thread_id
    });
    return;
  }

  const rawTarget = args[0].trim();
  let targetIdent: string | undefined;
  if (rawTarget.startsWith("@")) targetIdent = rawTarget.slice(1);
  else targetIdent = undefined;

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

  const targetDisplay = rawTarget.startsWith("@") ? rawTarget.slice(1) : rawTarget;

  // 禁止自己/机器人作为目标（以展示名/username 简易判断）
  if (targetDisplay === initiatorFirst || (env.BOT_USERNAME && targetDisplay.toLowerCase() === env.BOT_USERNAME.toLowerCase())) {
    await TgMessage.sendText(env, {
      chat_id,
      text: `目标不能是自己或机器人。正确用法：@${botName} /duel @对手 赌注文本`,
      parse_mode: "HTML",
      reply_markup: reply_delete,
      message_thread_id: thread_id
    });
    return;
  }

  // 随机掷点 A（发起者点数），放入消息文本，但不放入 callback_data
  const pointA = Math.floor(Math.random() * 100) + 1;

  const initText =
    `${initiatorFirst} 对 ${targetDisplay} 发起了决斗，赌注是：${escapeHtml(stake)}\n` +
    `🎲 ${initiatorFirst} 掷出了 ${pointA} 点\n` +
    `⚠️ ${targetDisplay} 请点击下方按钮接受决斗：`;

  // callback_data 只保留 type/act/u
  const cb: ShortCb = { type: "duel", act: "accept" };
  if (targetIdent) cb.u = targetIdent;

  try {
    await TgMessage.sendText(env, {
      chat_id,
      text: initText,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "接受决斗", callback_data: JSON.stringify(cb) }]
        ]
      },
      message_thread_id: thread_id
    });
  } catch (e) {
    console.error("[duel] 发送初始消息失败", e);
  }
}

/**
 * 处理 duel 回调（callback_query + 解析后的 callbackData）
 */
export async function handleDuelCallback(callbackQuery: any, callbackData: any, env: EnvLike) {
  const cq = callbackQuery;
  if (!callbackData || typeof callbackData !== "object") return;
  if (callbackData.type !== "duel" || callbackData.act !== "accept") return;

  const msg = cq.message;
  if (!msg || !msg.text) {
    await TgMessage.answerCallbackQuery(env, cq.id, { text: "回调消息缺失或内容不可用", show_alert: true });
    return;
  }

  const chat_id = msg.chat?.id;
  const message_id = msg.message_id;

  // 期望 callbackData.u 为目标 username（若发起时指定了 @username）
  const expectedTargetIdent = callbackData.u ? String(callbackData.u).toLowerCase() : undefined;
  const callerUsername = cq.from?.username ? String(cq.from.username).toLowerCase() : undefined;
  const callerFirst = cq.from?.first_name || "";

  // 校验：若有 username，则必须匹配 username；否则尝试用 first_name 与消息中解析的目标名比对
  let isTarget = false;
  if (expectedTargetIdent) {
    if (callerUsername && callerUsername === expectedTargetIdent) isTarget = true;
    // 额外兜底：有时 username 不匹配但 first_name 相同，也允许（谨慎）
    else if (callerFirst === (msg.text.split("\n")[0].match(/^.+? 对 (.+?) 发起了决斗/)?.[1] || "")) isTarget = true;
  } else {
    // 没有 username 时回退到 first_name 比较（需要用户输入目标名能匹配）
    const titleFirstLine = msg.text.split("\n")[0] || "";
    const parsed = titleFirstLine.match(/^(.+?) 对 (.+?) 发起了决斗/);
    const parsedTargetName = parsed?.[2] || "";
    if (callerFirst === parsedTargetName) isTarget = true;
  }

  if (!isTarget) {
    await TgMessage.answerCallbackQuery(env, cq.id, { text: `只有被挑战的  ${expectedTargetIdent} 才能接受此决斗。`, show_alert: true });
    return;
  }

  // 从消息文本解析发起者名、目标名、赌注与发起者点数（pointA）
  const lines = msg.text.split("\n");
  const titleLine = lines[0] || "";
  const parsedTitle = parseInitTitle(titleLine);
  const userAName = parsedTitle.userA;
  const userBName = parsedTitle.userB;
  const stake = parsedTitle.stake;

  const pointA = parsePointAFromInitText(msg.text);

  // 对手掷点
  const pointB = Math.floor(Math.random() * 100) + 1;
  const winner = pointB > pointA ? userBName : userAName;

  const resultText =
    `${userAName} 对 ${userBName} 发起了决斗，赌注是：${escapeHtml(stake)}\n` +
    `🎲 ${userAName} 掷出了 ${pointA} 点\n` +
    `${userBName} 接受决斗，🎲 掷出了 ${pointB} 点\n\n` +
    `🏆 胜利者：${winner}，请兑现赌注！`;

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
    await TgMessage.answerCallbackQuery(env, cq.id, { text: "处理失败，请稍后重试。", show_alert: true });
  }
}
