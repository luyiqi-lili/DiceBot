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
const payConfigs = [

  {
    "chatId": -1002742074355,
    "threadIds": [182],
    "placeName": "天狐宫的祈愿箱",
    "enabled": true,
    "successMessage": "${userName}将 ${amount} 💰投入${place}。"
    +"<blockquote expandable>铜钱在掌心里带着一丝凉意，双手合握着硬币，轻轻投下。铜钱落下时撞击木格的声响，清脆而短促，细微的回音在殿内回荡，彷佛整座神社都听见了他的愿望，像是把心意托付给神明的回应。"
    +"拉动铃绳，铃铛随着力道震颤，清冽而悠长，声音化作无形的狐鸣，穿梭于屋檐与杉木林间。双手在胸前合十，闭眼低首。两次轻拍掌声回响，像是驱散尘世之音，也像是在召唤守护此地的狐灵。"
    +"心跳与手心的温度，似乎与远处的狐火呼应，燃成一点点无形的光。最后，再次深深鞠躬，感受到自己也被那无形的狐影注视着。临走时，不起眼的小狐灵悄悄的跟了过去守护着。</blockquote>"
    +"${place}现已累积 ${total} 💰。"
  },
  {
    "chatId": -1002848481881,
    "threadIds": [66],
    "placeName": "天狐宫的祈愿箱",
    "enabled": true,
    "successMessage": "${userName}将 ${amount} 💰投入${place}。"
    +"<blockquote expandable>铜钱在掌心里带着一丝凉意，双手合握着硬币，轻轻投下。铜钱落下时撞击木格的声响，清脆而短促，细微的回音在殿内回荡，彷佛整座神社都听见了他的愿望，像是把心意托付给神明的回应。"
    +"拉动铃绳，铃铛随着力道震颤，清冽而悠长，声音化作无形的狐鸣，穿梭于屋檐与杉木林间。双手在胸前合十，闭眼低首。两次轻拍掌声回响，像是驱散尘世之音，也像是在召唤守护此地的狐灵。"
    +"心跳与手心的温度，似乎与远处的狐火呼应，燃成一点点无形的光。最后，再次深深鞠躬，感受到自己也被那无形的狐影注视着。临走时，不起眼的小狐灵悄悄的跟了过去守护着。</blockquote>"
    +"${place}现已累积 ${total} 💰。"
  }
  /*  {
      "chatId": -1002742074355,
      "threadIds": [345],
      "placeName": "桌游室的收银台",
      "enabled": true,
      "successMessage": "${userName} 往${place}放入 ${amount} 💰。${place}现在有 ${total} 💰。"
    },
    
  {
    "chatId": -1002848481881,
    "threadIds": [66],
    "placeName": "骰娘调校房的黑箱子",
    "enabled": true,
    "successMessage": "${userName} 向${place}投了 ${amount} 💰，现在累计 ${total} 💰。"
  }*/
]


export async function handleCoin(msg: any, env: Env): Promise<Partial<CoinResponse>> {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const userName = msg.from.first_name || "你";

  // 去除 @BotUsername 提及（如有）
  let text = msg.text.trim();
  const botMention = `@${env.BOT_USERNAME}`;
  if (text.startsWith(botMention)) text = text.slice(botMention.length).trim();
  const parts = text.split(/\s+/);
  if (parts[0] !== "/coin") return {};

  const sub = parts[1]?.toLowerCase();

  const todayD = new Date();

  const duringEvent = (todayD >= new Date("2025-08-12") && todayD <= new Date("2025-08-17"));
  const duringTrans = (todayD >= new Date("2025-08-15") && todayD <= new Date("2026-08-18"));


  // 余额读写
  async function getBalance(id: string): Promise<number> {
    const raw = await env.COIN_KV.get(id);
    return raw ? parseInt(raw, 10) : 0;
  }
  async function setBalance(id: string, bal: number) {
    await env.COIN_KV.put(id, bal.toString());
  }

  // ——— 查询余额 ———
  if (!sub) {
    const bal = await getBalance(userId);
    return {
      method: "sendMessage",
      chat_id: chatId,
      text: `${userName}，你目前有 ${bal} 💰。`,
      parse_mode: "HTML",
    };
  }

  // ——— 每日祈福 ———
  if (sub === "pray") {
    // —— 新增：仅允许在特定群组和主题中使用 pray —— 
    const threadId = msg.message_thread_id ?? msg.reply_to_message?.message_thread_id;
    const allowed =
      (chatId === -1002848481881 && [66].includes(threadId)) ||
      (chatId === -1002742074355 && [62].includes(threadId));
    if (!allowed) {
      return {
        method: "sendMessage",
        chat_id: chatId,
        text:
          `✨ 这里的神圣气息过于微弱，女神未及听闻你的祈愿。或许前往真正的祈祷之地，才能唤来幸运之光……`,
        parse_mode: "HTML",
      };
    }


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
    // 活动期间（2025-08-12 — 2025-08-17）提高祈福奖励为 11-20


    const gain = (duringEvent)
      ? randomInt(11, 20)
      : randomInt(1, 10);
    const bal = await getBalance(userId);
    const newBal = bal + gain;
    await setBalance(userId, newBal);
    await env.COIN_KV.put(prayKey, today);
    return {
      method: "sendMessage",
      chat_id: chatId,
      text: `✨ ${userName}，你祈福获得了 ${gain} 💰，当前余额 ${newBal} 💰。`,
      parse_mode: "HTML",
    };
  }
  const threadId = msg.message_thread_id ?? msg.reply_to_message?.message_thread_id ?? 0;

  if (sub === "pay") {




    // 查找配置，判断当前房间/主题是否允许 pay
    const cfg = payConfigs.find((c) => {
      if (c.chatId !== chatId) return false;
      if (!c.threadIds || c.threadIds.length === 0) return true;
      return c.threadIds.includes(threadId);
    });

    if (!cfg || cfg.enabled === false) {
      return {
        method: "sendMessage",
        chat_id: chatId,
        text: `❌ ${userName}，此房间暂不支持投币 (pay)。`,
        parse_mode: "HTML",
      };
    }
    const amount = parseInt(parts[2] || "", 10);
    if (isNaN(amount)) {
      const roomKey = `${chatId}||${threadId ?? 0}`;
      const roomBal = await getBalance(roomKey);
      const place = cfg?.placeName || `房间 ${threadId}`;
      return {
        method: "sendMessage",
        chat_id: chatId,
        text: `📥 ${place} 当前有 ${roomBal} 💰。`,
        parse_mode: "HTML",
      };
    }
    if (isNaN(amount) || amount <= 0) {
      return {
        method: "sendMessage",
        chat_id: chatId,
        text: `❌ ${userName}，请指定正确的投币数量，例如：<code>/coin pay 1</code>。`,
        parse_mode: "HTML",
      };
    }
    // 检查并扣除用户余额
    const senderBal = await getBalance(userId);
    if (senderBal < amount) {
      return {
        method: "sendMessage",
        chat_id: chatId,
        text: `❌ ${userName}，你的余额不足，当前只有 ${senderBal} 💰。`,
        parse_mode: "HTML",
      };
    }
    const newSenderBal = senderBal - amount;
    await setBalance(userId, newSenderBal);

    // 更新房间余额（只计数，无法取出），使用通用的 getBalance/setBalance，key 为 chatId||threadId
    const roomKey = `${chatId}||${threadId ?? 0}`;
    const oldRoomBal = await getBalance(roomKey);
    const newRoomBal = oldRoomBal + amount;
    await setBalance(roomKey, newRoomBal);

    const place = cfg.placeName || `房间 ${threadId}`;

    // 成功文案支持预设模板变量：${userName}, ${place}, ${amount}, ${total}, ${threadId}
    const template = cfg.successMessage || "${userName} 往${place}投入 ${amount} 💰。${place}现在有 ${total} 💰。";
    const textOut = template
      .replace(/\$\{userName\}/g, userName)
      .replace(/\$\{place\}/g, place)
      .replace(/\$\{amount\}/g, String(amount))
      .replace(/\$\{total\}/g, String(newRoomBal))
      .replace(/\$\{threadId\}/g, String(threadId));

    return {
      method: "sendMessage",
      chat_id: chatId,
      text: textOut,
      parse_mode: "HTML",
    };
  }

  // ——— 转账，并由接收者支付阶梯手续费 ———
  if (sub === "send") {
    if (!duringTrans) {
      return {
        method: "sendMessage",
        chat_id: chatId,
        text: `❌ ${userName}，转账功能升级中，敬请期待。`,
        parse_mode: "HTML",
      };
    }

    const amount = parseInt(parts[2] || "", 10);
    if (isNaN(amount) || amount <= 0) {
      return {
        method: "sendMessage",
        chat_id: chatId,
        text: `❌ ${userName}，请指定正确的转账数量，例如：<code>/coin send 50</code>。`,
        parse_mode: "HTML",
      };
    }
    const target = msg.reply_to_message?.from;
    if (!target) {
      return {
        method: "sendMessage",
        chat_id: chatId,
        text: `❌ ${userName}，请在对方的消息下回复并使用 <code>/coin send ${amount}</code>。`,
        parse_mode: "HTML",
      };
    }

    // 1. 检查并扣除发送者余额
    const senderBal = await getBalance(userId);
    if (senderBal < amount) {
      return {
        method: "sendMessage",
        chat_id: chatId,
        text: `❌ ${userName}，你的余额不足，当前只有 ${senderBal} 💰。`,
        parse_mode: "HTML",
      };
    }
    const newSenderBal = senderBal - amount;
    await setBalance(userId, newSenderBal);

    // 2. 读取接收者原始余额 oldBal
    const targetId = target.id.toString();
    const oldBal = await getBalance(targetId);

    // 3. 确定阶梯费率（示例）
    let rate: number;
    if (oldBal < 100) rate = 0;        // 0%
    else if (oldBal < 300) rate = 0.1;   // 10%
    else if (oldBal < 500) rate = 0.3;  // 30%
    else if (oldBal < 700) rate = 0.5;  // 50%
    else if (oldBal < 900) rate = 0.7;  // 70%
    else rate = 0.9;                       // 90%

    // 4. 计算手续费（向下取整）
    const fee = Math.floor(amount * rate);
    // 5. 更新接收者余额：oldBal + amount - fee
    const newTargetBal = oldBal + amount - fee;
    await setBalance(targetId, newTargetBal);

    const targetName = target.first_name || "TA";
    return {
      method: "sendMessage",
      chat_id: chatId,
      text:
        `💸 ${userName} 向 ${targetName} 转账 ${amount} 💰。\n` +
        `📊 ${targetName} 原有余额 ${oldBal} 💰，适用费率 ${(rate * 100).toFixed(0)}%，手续费 ${fee} 💰。\n` +
        `✅ 转账后 ${targetName} 新余额：${newTargetBal} 💰；\n` +
        `🪙 你的新余额：${newSenderBal} 💰。`,
      parse_mode: "HTML",
    };
  }

  // ——— 未知子命令 ———
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
