// commands/21.ts
import TgMessage from "../lib/tgMessage";
import type { EnvLike } from "../lib/tgMessage"; // EnvLike shape (包含 TOKEN, BOT_USERNAME 等)

/**
 * 21 点游戏处理模块（重构版）
 * - handle21Message: 处理发起（/21 或 @Bot /21）消息，直接发送起始消息
 * - handle21Callback: 处理 JSON callback（{ type: "21", action: "draw" | "next" }）并直接通过 TgMessage 编辑消息/回答 callback
 *
 * 备注：所有发送/编辑调用都使用 TgMessage 提供的封装函数。
 */

// 工具
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const drawCard = () => ranks[Math.floor(Math.random() * ranks.length)];

interface Player {
  user: string;
  cards: string[];
  gaveUp: boolean;
  busted?: boolean;
}

const parsePlayers = (text: string): Player[] => {
  const players: Player[] = [];
  text.split("\n").forEach(line => {
    const m = line.match(/^- (.+?)：([\s\S]+)/);
    if (m) {
      const user = m[1];
      const parts = m[2].trim().split(/\s+/).filter(Boolean);
      const gaveUp = parts.includes("放弃");
      const busted = parts.includes("爆了");
      const cards = parts.filter(p => p !== "放弃" && p !== "爆了");
      players.push({ user, cards, gaveUp, busted });
    }
  });
  return players;
};

const calcValue = (cards: string[]): number =>
  cards.reduce((sum, c) => {
    if (c === "A") return sum + 1;
    if (["J", "Q", "K"].includes(c)) return sum + 10;
    const n = parseInt(c, 10);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);

// 生成 inline buttons（callback_data 使用 JSON 字符串）
const buildButtons = () => {
  return {
    inline_keyboard: [
      [{ text: "抽牌", callback_data: JSON.stringify({ type: "21", action: "draw" }) }],
      [{ text: "下一轮", callback_data: JSON.stringify({ type: "21", action: "next" }) }]
    ]
  };
};

// === 发起处理：/21 命令调用 ===
export async function handle21Message(msg: any, env: EnvLike) {
  // msg 为 Telegram message 对象
  const chat_id = msg.chat?.id;
  const thread_id = msg.message_thread_id ?? msg.message?.message_thread_id;
  const initiator = msg.from?.first_name || "玩家";

  const title = `🎴 ${initiator} 发起了21点游戏`;
  const text = `${title}\n当前是第1轮次，请大家抽取第1张扑克牌\n\n其他玩家点击按钮抽牌：`;

  const replyMarkup = buildButtons();

  // 直接发送（使用 TgMessage 的 sendInline / sendText）
  try {
    if (thread_id) {
      await TgMessage.sendText(env, {
        chat_id,
        text,
        parse_mode: "HTML",
        reply_markup: replyMarkup,
        message_thread_id: thread_id
      } as any);
    } else {
      await TgMessage.sendText(env, {
        chat_id,
        text,
        parse_mode: "HTML",
        reply_markup: replyMarkup
      } as any);
    }
  } catch (e) {
    console.error("[21] send start message failed", e);
  }
}

// === 回调处理：JSON callback ===
// callbackQuery: 原 callback_query 对象（包含 id, from, message 等）
// callbackData: 解析好的 callback JSON，例如 { type: "21", action: "draw" }
export async function handle21Callback(callbackQuery: any, callbackData: any, env: EnvLike) {
  const cq = callbackQuery;
  const data = callbackData || {};
  const action = data.action || "";

  const replier = cq.from?.first_name || "玩家";

  // message info
  const msg = cq.message;
  if (!msg) {
    await TgMessage.answerCallbackQuery(env, cq.id, { text: "回调消息缺失", show_alert: true });
    return;
  }
  const chat_id = msg.chat?.id;
  const message_id = msg.message_id;
  const thread_id = msg.message_thread_id ?? msg.message?.message_thread_id;

  const lines = (msg.text || "").split("\n");
  const initiatorLine = lines[0] || "";
  const roundLine = lines[1] || "";
  const roundMatch = roundLine.match(/当前是第(\d+)轮次/);
  let round = roundMatch ? parseInt(roundMatch[1], 10) : 1;

  const players = parsePlayers(lines.slice(2).join("\n"));

  // helper: find player by name (first_name)
  const me = players.find(p => p.user === replier);

  // DRAW
  if (action === "draw") {
    // 资格检查
    if (me) {
      if (me.gaveUp || me.busted) {
        await TgMessage.answerCallbackQuery(env, cq.id, { text: "你已结束本局，无法继续抽牌。", show_alert: true });
        return;
      }
      if (me.cards.length >= round) {
        await TgMessage.answerCallbackQuery(env, cq.id, { text: "你已在本轮抽过牌。", show_alert: true });
        return;
      }
    }

    // 抽牌
    const newCard = drawCard();
    if (me) {
      me.cards.push(newCard);
    } else {
      players.push({ user: replier, cards: [newCard], gaveUp: false });
    }

    const updated = players.find(p => p.user === replier)!;
    const total = calcValue(updated.cards);

    // 达21点 -> 立即结束
    if (total === 21) {
      let endText = `${initiatorLine}\n游戏结束！\n`;
      players.forEach(p => {
        const flags = [];
        if (p.gaveUp) flags.push("放弃");
        if (p.busted) flags.push("爆了");
        endText += `- ${p.user}：${[...p.cards, ...flags].join(" ")}${p.user === replier ? ' 🎉 21点！' : ''}\n`;
      });
      endText += `\n🏆 胜利者：${replier}，达成21点！`;

      try {
        await TgMessage.editMessageText(env, {
          chat_id,
          message_id,
          parse_mode: "HTML",
          text: endText
        });
      } catch (e) {
        console.error("[21] edit after 21 failed", e);
      }
      return;
    }

    // 爆牌
    if (total > 21) {
      updated.busted = true;
    }

    // 重建消息
    let text = `${initiatorLine}\n`;
    text += `当前是第${round}轮次，请大家抽取第${round}张扑克牌\n`;
    players.forEach(p => {
      const flags = [];
      if (p.gaveUp) flags.push("放弃");
      if (p.busted) flags.push("爆了");
      text += `- ${p.user}：${[...p.cards, ...flags].join(" ")}\n`;
    });
    text += `\n轮次完毕后，主持人点击“下一轮”继续，或当所有玩家放弃时自动结束。`;

    // 编辑消息（带按钮）
    try {
      await TgMessage.editMessageText(env, {
        chat_id,
        message_id,
        parse_mode: "HTML",
        text,
        reply_markup: buildButtons()
      });
    } catch (e) {
      console.error("[21] edit after draw failed", e);
    }
    return;
  }

  // NEXT
  if (action === "next") {
    const caller = cq.from?.first_name || "玩家";
    const initiator = (initiatorLine.match(/^🎴\s*(.+?)\s*发起/) || [])[1] || "";

    if (caller !== initiator) {
      await TgMessage.answerCallbackQuery(env, cq.id, { text: `只有主持人 ${initiator} 能开始下一轮。`, show_alert: true });
      return;
    }

    // 跳过未跟上者
    players.forEach(p => {
      if (!p.busted && p.cards.length < round) p.gaveUp = true;
    });

    // 检查结束条件：没有活动玩家
    const active = players.filter(p => !p.gaveUp && !p.busted && p.cards.length >= round);
    if (active.length === 0) {
      let best = 0;
      const winners: string[] = [];
      players.forEach(p => {
        const v = calcValue(p.cards);
        if (v <= 21 && v > best) {
          best = v;
          winners.length = 0;
          winners.push(p.user);
        } else if (v === best) {
          winners.push(p.user);
        }
      });

      let finalText = `${initiatorLine}\n游戏结束！\n`;
      players.forEach(p => {
        const flags = [];
        if (p.gaveUp) flags.push("放弃");
        if (p.busted) flags.push("爆了");
        finalText += `- ${p.user}：${[...p.cards, ...flags].join(" ")}\n`;
      });
      finalText += `\n🏆 胜利者：${winners.join("，")}，点数：${best}`;

      try {
        await TgMessage.editMessageText(env, {
          chat_id,
          message_id,
          parse_mode: "HTML",
          text: finalText
        });
      } catch (e) {
        console.error("[21] edit final failed", e);
      }
      return;
    }

    // 否则进入下一轮
    round += 1;
    let text = `${initiatorLine}\n`;
    text += `当前是第${round}轮次，请大家抽取第${round}张扑克牌\n`;
    players.forEach(p => {
      const flags = [];
      if (p.gaveUp) flags.push("放弃");
      if (p.busted) flags.push("爆了");
      text += `- ${p.user}：${[...p.cards, ...flags].join(" ")}\n`;
    });
    text += `\n轮次完毕后，主持人点击“下一轮”继续，或当所有玩家放弃时自动结束。`;

    try {
      await TgMessage.editMessageText(env, {
        chat_id,
        message_id,
        parse_mode: "HTML",
        text,
        reply_markup: buildButtons()
      });
    } catch (e) {
      console.error("[21] edit after next failed", e);
    }
    return;
  }

  // 未知 action
  await TgMessage.answerCallbackQuery(env, cq.id, { text: "未知的 21 点操作。", show_alert: true });
}
