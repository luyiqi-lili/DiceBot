interface CoinResponse {
  method: string;
  chat_id: number;
  text: string;
  parse_mode?: string;
}

// 随机整数，包含 min 和 max
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function handleCoin(msg: any, env: Env): Promise<Partial<CoinResponse>> {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const userName = msg.from.first_name || "你";
  const parts = msg.text.trim().split(/\s+/);
  const sub = parts[1]?.toLowerCase();

  // Helper: 读取并解析用户余额
  async function getBalance(): Promise<number> {
    const raw = await env.COIN_KV.get(userId);
    return raw ? parseInt(raw, 10) : 0;
  }
  // Helper: 存储余额
  async function setBalance(balance: number) {
    await env.COIN_KV.put(userId, balance.toString());
  }

  // 默认：查询余额
  if (!sub) {
    const bal = await getBalance();
    return {
      method: "sendMessage",
      chat_id: chatId,
      text: `${userName}，你目前有 ${bal} 💰。`,
      parse_mode: "HTML",
    };
  }

  // /coin pray — 每天一次的祈福
  if (sub === "pray") {
    const prayKey = `coin_pray:${userId}`;
    const last = await env.COIN_KV.get(prayKey);
    const today = new Date().toISOString().split("T")[0];
    if (last === today) {
      return {
        method: "sendMessage",
        chat_id: chatId,
        text: `🙏 ${userName}，你今天已经祈福过了，明天再来吧！`,
        parse_mode: "HTML",
      };
    }
    const gain = randomInt(10, 100);  // 随机获得 10–100
    const bal = await getBalance();
    const newBal = bal + gain;
    await setBalance(newBal);
    // 标记今天已祈福
    await env.COIN_KV.put(prayKey, today);
    return {
      method: "sendMessage",
      chat_id: chatId,
      text: `✨ ${userName}，你祈福获得了 ${gain} 💰，当前余额 ${newBal} 💰。`,
      parse_mode: "HTML",
    };
  }

  // /coin send X — 向被回复的用户转账
  if (sub === "send") {
    const amount = parseInt(parts[2] || "", 10);
    if (isNaN(amount) || amount <= 0) {
      return {
        method: "sendMessage",
        chat_id: chatId,
        text: `❌ ${userName}，请指定正确的转账数量，例如：<code>/coin send 50</code>。`,
        parse_mode: "HTML",
      };
    }
    // 必须是在回复一条消息的上下文中
    const target = msg.reply_to_message?.from;
    if (!target) {
      return {
        method: "sendMessage",
        chat_id: chatId,
        text: `❌ ${userName}，请在对方的消息下回复并使用 <code>/coin send ${amount}</code>。`,
        parse_mode: "HTML",
      };
    }
    // 检查余额
    const bal = await getBalance();
    if (bal < amount) {
      return {
        method: "sendMessage",
        chat_id: chatId,
        text: `❌ ${userName}，你的余额不足，当前只有 ${bal} 💰。`,
        parse_mode: "HTML",
      };
    }
    // 扣款
    const newBal = bal - amount;
    await setBalance(newBal);
    // 给对方加款
    const targetId = target.id.toString();
    const rawT = await env.COIN_KV.get(targetId);
    const tBal = rawT ? parseInt(rawT, 10) : 0;
    await env.COIN_KV.put(targetId, (tBal + amount).toString());

    const targetName = target.first_name || "TA";
    return {
      method: "sendMessage",
      chat_id: chatId,
      text: `💸 ${userName} 向 ${targetName} 支付了 ${amount} 💰。\n` +
            `你的新余额：${newBal} 💰。`,
      parse_mode: "HTML",
    };
  }

  // 未知子命令
  return {
    method: "sendMessage",
    chat_id: chatId,
    text: `❓ 不支持的子命令，请用：\n` +
          `<code>/coin</code> 查询余额\n` +
          `<code>/coin pray</code> 今日祈福\n` +
          `<code>/coin send 50</code> 回复消息支付 50 💰`,
    parse_mode: "HTML",
  };
}
