export function handle21(msg: any, env: any): Record<string, any> {
  const botName = env.BOT_USERNAME;
  const getName = (u: any) => u.first_name || "玩家";

  // 兼容 message 和 callback_query
  const chat_id = msg.chat?.id ?? msg.message.chat.id;
  const thread_id = msg.message_thread_id ?? msg.message?.message_thread_id;

  // 玩家数据结构
  interface Player {
    user: string;
    cards: string[];
    gaveUp: boolean;
    busted?: boolean;
  }

  // 解析已有玩家记录
  const parsePlayers = (text: string): Player[] => {
    const players: Player[] = [];
    text.split("\n").forEach(line => {
      const m = line.match(/^- (.+?)：([\s\S]+)/);
      if (m) {
        const user = m[1];
        const parts = m[2].trim().split(/\s+/);
        const gaveUp = parts.includes("放弃");
        const busted = parts.includes("爆了");
        const cards = parts.filter(p => p !== "放弃" && p !== "爆了");
        players.push({ user, cards, gaveUp, busted });
      }
    });
    return players;
  };

  // 计算手牌点数
  const calcValue = (cards: string[]): number =>
    cards.reduce((sum, c) => {
      if (c === "A") return sum + 1;
      if (["J", "Q", "K"].includes(c)) return sum + 10;
      return sum + parseInt(c, 10);
    }, 0);

  // 抽一张牌
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const drawCard = () => ranks[Math.floor(Math.random() * ranks.length)];

  // 编辑消息辅助
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
  if (msg.data === "21_draw") {
    const replier = getName(msg.from);
    const lines = msg.message.text.split("\n");
    const initiatorLine = lines[0];
    const roundLine = lines[1];
    const roundMatch = roundLine.match(/当前是第(\d+)轮次/);
    const round = roundMatch ? parseInt(roundMatch[1], 10) : 1;
    const players = parsePlayers(lines.slice(2).join("\n"));
    const me = players.find(p => p.user === replier);

    // 资格检查
    if (me) {
      if (me.gaveUp || me.busted) {
        return { method: "answerCallbackQuery", callback_query_id: msg.id, text: "你已结束本局，无法继续抽牌。", show_alert: true };
      }
      if (me.cards.length >= round) {
        return { method: "answerCallbackQuery", callback_query_id: msg.id, text: "你已在本轮抽过牌。", show_alert: true };
      }
    }

    // 执行抽牌
    const newCard = drawCard();
    if (me) {
      me.cards.push(newCard);
    } else {
      players.push({ user: replier, cards: [newCard], gaveUp: false });
    }

    // 计算新点数
    const updated = players.find(p => p.user === replier)!;
    const total = calcValue(updated.cards);

    // 达21点，立刻结束
    if (total === 21) {
      let endText = `${initiatorLine}\n游戏结束！\n`;
      players.forEach(p => {
        const mark = p.cards.join(" ");
        endText += `- ${p.user}：${mark}${p.user === replier ? ' 🎉 21点！' : ''}\n`;
      });
      endText += `\n🏆 胜利者：${replier}，达成21点！`;
      return editMessage(endText, []);
    }

    // 爆牌处理
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
      const line = `- ${p.user}：${[...p.cards, ...flags].join(" ")}`;
      text += line + "\n";
    });
    text += `\n轮次完毕后，主持人点击“下一轮”继续，或当所有玩家放弃时自动结束。`;

    const buttons = [
      [{ text: "抽牌", callback_data: "21_draw" }],
      [{ text: "下一轮", callback_data: "21_next" }]
    ];
    return editMessage(text, buttons);
  }

  if (msg.data === "21_next") {
    const caller = getName(msg.from);
    const lines = msg.message.text.split("\n");
    const initiatorLine = lines[0];
    const initiator = (initiatorLine.match(/^🎴\s*(.+?)\s*发起/) || [])[1] || "";
    if (caller !== initiator) {
      return { method: "answerCallbackQuery", callback_query_id: msg.id, text: `只有主持人 ${initiator} 能开始下一轮。`, show_alert: true };
    }
    const roundMatch = lines[1].match(/当前是第(\d+)轮次/);
    let round = roundMatch ? parseInt(roundMatch[1], 10) : 1;
    const players = parsePlayers(lines.slice(2).join("\n"));

    // 跳过未跟上者
    players.forEach(p => {
      if (!p.busted && p.cards.length < round) p.gaveUp = true;
    });

    // 检查结束条件
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
      return editMessage(finalText, []);
    }

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

    const buttons = [
      [{ text: "抽牌", callback_data: "21_draw" }],
      [{ text: "下一轮", callback_data: "21_next" }]
    ];
    return editMessage(text, buttons);
  }

  // 发起阶段，匹配 @Bot 或直接 /21
  const startMatch = msg.text?.match(new RegExp(`(?:@${botName}\s*)?\\/21\\b`, "i"));
  if (startMatch) {
    const initiator = getName(msg.from);
    const title = `🎴 ${initiator} 发起了21点游戏`;
    const text = `${title}\n当前是第1轮次，请大家抽取第1张扑克牌\n\n其他玩家点击按钮抽牌：`;
    const buttons = [
      [{ text: "抽牌", callback_data: "21_draw" }],
      [{ text: "下一轮", callback_data: "21_next" }]
    ];
    return { chat_id, ...(thread_id && { message_thread_id: thread_id }), text, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
  }

  return {};
}
