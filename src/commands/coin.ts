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

  // 原始消息文本，可能形如 "@BotUsername /coin pray" 或者 "/coin pray"
  console.log("📥 [handleCoin] 收到消息 text =", msg.text);

  // 1. 去除开头的 Bot 提及（如果有），例如 "@lili_DevDiceBot"
  let text = msg.text.trim();
  const botMention = `@${env.BOT_USERNAME}`;
  if (text.startsWith(botMention)) {
    text = text.slice(botMention.length).trim();
    console.log(`🔍 [handleCoin] 去除 Bot 提及，剩余 text = "${text}"`);
  }

  // 2. 拆分为若干部分，parts[0] 应为 "/coin"，parts[1] 为子命令（"pray" 或 "send"）
  const parts = text.split(/\s+/);
  console.log("📋 [handleCoin] 拆分 parts =", parts);

  // 如果 parts[0] 不是 /coin，说明不应该由此处理
  if (parts[0] !== "/coin") {
    console.warn(`⚠️ [handleCoin] 非 /coin 命令，跳过处理：${parts[0]}`);
    // 返回 undefined，让上层继续其他逻辑
    return {};
  }

  // 子命令，比如 "pray"、"send" 等
  const sub = parts[1]?.toLowerCase();
  console.log(`🔖 [handleCoin] 识别到子命令 sub = "${sub}"`);

  // Helper: 读取并解析用户余额
  async function getBalance(): Promise<number> {
    const raw = await env.COIN_KV.get(userId);
    const bal = raw ? parseInt(raw, 10) : 0;
    console.log(`💾 [handleCoin] 读取余额 userId=${userId} => ${bal}`);
    return bal;
  }

  // Helper: 存储余额
  async function setBalance(balance: number) {
    console.log(`💾 [handleCoin] 存储余额 userId=${userId} <= ${balance}`);
    await env.COIN_KV.put(userId, balance.toString());
  }

  // —— 分支 1：仅 "/coin"，查询余额 —— 
  if (!sub) {
    const bal = await getBalance();
    console.log(`💰 [handleCoin] 查询余额，回复 ${bal}`);
    return {
      method: "sendMessage",
      chat_id: chatId,
      text: `${userName}，你目前有 ${bal} 💰。`,
      parse_mode: "HTML",
    };
  }

  // —— 分支 2："/coin pray"，每日祈福 —— 
  if (sub === "pray") {
    console.log("🙏 [handleCoin] 进入 pray 分支");
    const prayKey = `coin_pray:${userId}`;
    const last = await env.COIN_KV.get(prayKey);
    const today = new Date().toISOString().split("T")[0];
    console.log(`📅 [handleCoin] 上次祈福日期 =`, last, "，今天 =", today);

    if (last === today) {
      console.log("⛔ [handleCoin] 今日已祈福，拒绝重复");
      return {
        method: "sendMessage",
        chat_id: chatId,
        text: `🙏 ${userName}，你今天已经祈福过了，明天再来吧！`,
        parse_mode: "HTML",
      };
    }

    const gain = randomInt(10, 100);  // 随机获得 10–100
    console.log(`✨ [handleCoin] 随机祈福收益 gain = ${gain}`);
    const bal = await getBalance();
    const newBal = bal + gain;
    await setBalance(newBal);

    // 标记今天已祈福
    await env.COIN_KV.put(prayKey, today);
    console.log(`✅ [handleCoin] 标记 prayKey=${prayKey} 为 ${today}`);

    return {
      method: "sendMessage",
      chat_id: chatId,
      text: `✨ ${userName}，你祈福获得了 ${gain} 💰，当前余额 ${newBal} 💰。`,
      parse_mode: "HTML",
    };
  }

  // —— 分支 3："/coin send X"，向被回复用户转账 —— 
  if (sub === "send") {
    console.log("💸 [handleCoin] 进入 send 分支");
    const amount = parseInt(parts[2] || "", 10);
    console.log(`🔢 [handleCoin] 解析转账金额 amount =`, amount);

    // 检查金额是否合法
    if (isNaN(amount) || amount <= 0) {
      console.log("❌ [handleCoin] 转账金额无效，返回错误提示");
      return {
        method: "sendMessage",
        chat_id: chatId,
        text: `❌ ${userName}，请指定正确的转账数量，例如：<code>/coin send 50</code>。`,
        parse_mode: "HTML",
      };
    }

    // 必须是在回复一条消息的上下文中
    const target = msg.reply_to_message?.from;
    console.log("📨 [handleCoin] 回复上下文 target =", target?.id);
    if (!target) {
      console.log("❌ [handleCoin] 未检测到回复用户，返回提示");
      return {
        method: "sendMessage",
        chat_id: chatId,
        text: `❌ ${userName}，请在对方的消息下回复并使用 <code>/coin send ${amount}</code>。`,
        parse_mode: "HTML",
      };
    }

    // 检查自己的余额是否足够
    const bal = await getBalance();
    if (bal < amount) {
      console.log("❌ [handleCoin] 余额不足，当前余额 =", bal);
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
    console.log(`➖ [handleCoin] 扣除 ${amount} 后余额 = ${newBal}`);

    // 给对方加款
    const targetId = target.id.toString();
    const rawT = await env.COIN_KV.get(targetId);
    const tBal = rawT ? parseInt(rawT, 10) : 0;
    const targetNewBal = tBal + amount;
    await env.COIN_KV.put(targetId, targetNewBal.toString());
    console.log(`➕ [handleCoin] 给 targetId=${targetId} 增加 ${amount}，新余额 = ${targetNewBal}`);

    const targetName = target.first_name || "TA";
    return {
      method: "sendMessage",
      chat_id: chatId,
      text:
        `💸 ${userName} 向 ${targetName} 支付了 ${amount} 💰。\n` +
        `你的新余额：${newBal} 💰。`,
      parse_mode: "HTML",
    };
  }

  // —— 分支 4：未知子命令 —— 
  console.warn(`❓ [handleCoin] 未知子命令 sub="${sub}"`);
  return {
    method: "sendMessage",
    chat_id: chatId,
    text:
      `❓ 不支持的子命令，请用：\n` +
      `<code>/coin</code> 查询余额\n` +
      `<code>/coin pray</code> 今日祈福\n` +
      `<code>/coin send 50</code> 回复消息支付 50 💰`,
    parse_mode: "HTML",
  };
}
