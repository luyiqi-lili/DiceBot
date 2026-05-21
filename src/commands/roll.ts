/**
 * @file commands/roll.ts
 * @description 掷骰命令处理器（/roll /r /rd /rh）。
 *   支持多种骰子表达式格式：
 *   - 默认 1d100
 *   - NdS（如 2d6）
 *   - Nd{选项} 多次抽取
 *   - {选项} 单次抽取
 *   - 表达式（如 2d6+1d4+5）
 *   - /rh 隐藏掷骰（结果发私聊）
 */

import TgMessage, { ParsedUpdate, EnvLike } from "../lib/tgMessage";
import {escapeHtml}  from "../lib/util";

/**
 * 将原始文本解析为 roll 输入参数（例如 "2d6+1" 或 "{红 白 绿}"）
 */
function extractInput(parsedMessage: ParsedUpdate): string {
  // 优先使用解析好的 args
  if (Array.isArray(parsedMessage.args) && parsedMessage.args.length > 0) {
    return parsedMessage.args.join(" ").trim();
  }

  // 否则从原始文本中去掉可能的 @Bot 前缀与命令词
  let text = parsedMessage.text || "";
  // 移除开头的 @Bot 或 /command 或带 @ 的命令
  text = text.replace(/^@?\w+\s*/i, "");
  text = text.replace(/^\/(?:r|roll|rh|rd)\b/i, "");
  return text.trim();
}

/**
 * 基于原有实现，计算并返回要发送的文本（未做 HTML 转义）
 */
function computeRollText(inputRaw: string, userName: string): string {
  // 先规范化输入（保留原有逻辑）
  let input = inputRaw.replace(/.*\/r(?:oll)?\s*/i, "").trim();

  // /rd -> 1d100, 以及 d<number> -> 1d<number>
  if (/^[dD]\s*$/.test(input)) {
    input = "1d100";
  }
  input = input.replace(/\b[dD](\d+)/g, "1d$1");

  // 标题：显示给用户的命令形式（如果 input 为空，就显示 /roll）
  const cmdDisplay = input ? `/roll ${input}` : `/roll`;
  const header = `${userName} 执行 ${cmdDisplay} 结果是：\n`;

  // 空参数（默认 1-100）
  if (!input) {
    const point = Math.floor(Math.random() * 100) + 1;
    return `${header}${point} 点`;
  }

  const normalizedInput = input.replace(/[｛]/g, "{").replace(/[｝]/g, "}");

  // 多次抽取 3d{A B C}
  const multiDrawMatch = normalizedInput.match(/^(\d+)[dD]\{([^}]+)\}$/);
  if (multiDrawMatch) {
    const count = parseInt(multiDrawMatch[1], 10);
    const options = multiDrawMatch[2].split(/[，,\s]+/).filter(Boolean);
    if (options.length === 0) return `${userName} 的抽取列表不能为空。示例：/roll 3d{红 白 绿}`;
    const picks: string[] = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * options.length);
      picks.push(options[idx]);
    }
    const body = `${userName} 抽取了 ${count} 次：\n` + picks.map((p, i) => `#${i + 1}: ${p}`).join("\n");
    return `${header}${body}`;
  }

  // 单次抽取 {A B C}
  const singleDrawMatch = normalizedInput.match(/^\{([^}]+)\}$/);
  if (singleDrawMatch) {
    const options = singleDrawMatch[1].split(/[，,\s]+/).filter(Boolean);
    if (options.length === 0) return `${userName} 的抽取列表不能为空。示例：/roll {红 白 绿}`;
    const idx = Math.floor(Math.random() * options.length);
    const pick = options[idx];
    const body = `${userName} 抽取结果：${pick}`;
    return `${header}${body}`;
  }

  // 验证字符合法性（只允许数字 d + - 空格）
  if (/[^\d+dD+\-\s]/.test(normalizedInput) || /[{}]/.test(normalizedInput)) {
    return `${userName} 的骰点表达式无效，请使用如 /roll 2d6+1d4+5 的格式`;
  }

  const parts = normalizedInput.match(/(\d+d\d+|\d+|[+\-])/gi);
  if (!parts) return `${userName} 的骰点格式无效，请使用如 /roll 2d6+1d4+5 的格式`;

  let total = 0;
  let currentSign = 1;
  const rollDetails: string[] = [];

  for (const part of parts) {
    if (part === "+") {
      currentSign = 1;
      continue;
    } else if (part === "-") {
      currentSign = -1;
      continue;
    }

    const diceMatch = part.match(/^(\d+)[dD](\d+)$/);
    if (diceMatch) {
      const count = parseInt(diceMatch[1], 10);
      const sides = parseInt(diceMatch[2], 10);

      if (count > 100 || sides > 1000) {
        return `${userName} 的骰子数或面数超出限制（单组最大 100 颗，最多 1000 面）`;
      }

      const rolls: number[] = [];
      for (let i = 0; i < count; i++) {
        const roll = Math.floor(Math.random() * sides) + 1;
        rolls.push(roll);
      }
      const subtotal = rolls.reduce((a, b) => a + b, 0) * currentSign;
      total += subtotal;
      rollDetails.push(`${currentSign < 0 ? "-" : ""}${count}d${sides} 🎲 [${rolls.join(", ")}]`);
    } else if (/^\d+$/.test(part)) {
      const value = parseInt(part, 10) * currentSign;
      total += value;
      rollDetails.push(`${currentSign < 0 ? "-" : "+"}${Math.abs(value)}`);
    } else {
      return `${userName} 的骰点表达式有误，无法识别：${part}`;
    }
  }

  const body = `${userName} 掷出了：\n${rollDetails.join("\n")}\n📊 总和：${total}`;
  return `${header}${body}`;
}

/**
 * 接受 parsedMessage，直接通过 TgMessage 发送 reply
 * 支持 /rh（隐藏掷骰：将结果发到私聊并在群组提示）
 * 支持 /rd 或 d 的简写
 */
export async function handleRoll(parsedMessage: ParsedUpdate, env: EnvLike) {
  const chatId = parsedMessage.chatId || parsedMessage.message?.chat?.id;
  const threadId = parsedMessage.threadId;
  const from = parsedMessage.from || parsedMessage.message?.from;
  if (!from) {
    console.error("[roll] 找不到用户信息 from");
    return;
  }
  if (!chatId) {
    console.error("[roll] 找不到 chatId");
    return;
  }

  const displayName = (from.first_name as string) || (from.username as string) || `ID ${from.id}`;
  const userNameEsc = escapeHtml(displayName);

  const input = extractInput(parsedMessage);
  const resultText = computeRollText(input, displayName);

  // 判断是否为隐藏掷骰 /rh 或命令名为 rh
  const isHidden = parsedMessage.command === "rh" || (/^\/rh\b/i.test(parsedMessage.text || ""));

  if (isHidden) {
    // 群提示
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `🎲 已将掷骰结果发送至 <b>${userNameEsc}</b> 的私聊。`,
      parse_mode: "HTML",
      message_thread_id: threadId
    });

    // 私聊发送详细结果（不做 HTML 转义以保留格式，但对用户生成的变量做转义）
    await TgMessage.sendText(env, {
      chat_id: from.id,
      text: `🎲 <b>你的隐藏掷骰结果</b>：\n${escapeHtml(resultText)}`,
      parse_mode: "HTML"
    });

    return;
  }

  // 普通回复直接发到群组
  await TgMessage.sendText(env, {
    chat_id: chatId,
    text: escapeHtml(resultText),
    parse_mode: "HTML",
    message_thread_id: threadId
  });
}

export default handleRoll;
