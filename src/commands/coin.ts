// commands/coin.ts
import TgMessage, { ParsedUpdate, EnvLike } from "../lib/tgMessage";

/**
 * 扩展 env 类型（至少需要 COIN_KV 和 BOT_USERNAME）
 */
export type CoinEnv = EnvLike & {
  COIN_KV: KVNamespace;
  BOT_USERNAME?: string;
};

interface PayConfig {
  chatId: number;
  threadIds?: number[];
  placeName?: string;
  enabled?: boolean;
  successMessage?: string;
}

/* 配置区域（保留你原始内容） */
const payConfigs: PayConfig[] = [
  {
    chatId: -1002742074355,
    threadIds: [182],
    placeName: "天狐宫的祈愿箱",
    enabled: true,
    successMessage:
      "${userName}将 ${amount} 💰投入${place}." +
      "<blockquote expandable>铜钱在掌心里带着一丝凉意，双手合握着硬币，轻轻投下。铜钱落下时撞击木格的声响，清脆而短促，细微的回音在殿内回荡，彷佛整座神社都听见了他的愿望，像是把心意托付给神明的回应。"
      + "拉动铃绳，铃铛随着力道震颤，清冽而悠长，声音化作无形的狐鸣，穿梭于屋檐与杉木林间。双手在胸前合十，闭眼低首。两次轻拍掌声回响，像是驱散尘世之音，也像是在召唤守护此地的狐灵。"
      + "心跳与手心的温度，似乎与远处的狐火呼应，燃成一点点无形的光。最后，再次深深鞠躬，感受到自己也被那无形的狐影注视着。临走时，不起眼的小狐灵悄悄的跟了过去守护着。</blockquote>"
      + "${place}现已累积 ${total} 💰。"
  },
  {
    chatId: -1002848481881,
    threadIds: [66],
    placeName: "天狐宫的祈愿箱",
    enabled: true,
    successMessage:
      "${userName}将 ${amount} 💰投入${place}." +
      "<blockquote expandable>铜钱在掌心里带着一丝凉意，双手合握着硬币，轻轻投下。铜钱落下时撞击木格的声响，清脆而短促，细微的回音在殿内回荡，彷佛整座神社都听见了他的愿望，像是把心意托付给神明的回应。"
      + "拉动铃绳，铃铛随着力道震颤，清冽而悠长，声音化作无形的狐鸣，穿梭于屋檐与杉木林间。双手在胸前合十，闭眼低首。两次轻拍掌声回响，像是驱散尘世之音，也像是在召唤守护此地的狐灵。"
      + "心跳与手心的温度，似乎与远处的狐火呼应，燃成一点点无形的光。最后，再次深深鞠躬，感受到自己也被那无形的狐影注视着。临走时，不起眼的小狐灵悄悄的跟了过去守护着。</blockquote>"
      + "${place}现已累积 ${total} 💰。"
  }
];

/* 管理员与国库配置（请替换 ADMIN_UIDS 为实际的数字 UID） */
const ADMIN_UIDS: number[] = [8080375150]; // TODO: 填入允许操作国库 / check / take / create 的 UID
const TREASURY_KEY = "__treasury__";

/* 工具函数 */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function escapeHtml(text: string) {
  return (text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * 重构后的 handleCoin：直接接收 parsedMessage 并发送消息
 */
export async function handleCoin(parsedMessage: ParsedUpdate, env: CoinEnv): Promise<void> {
  const chatId = parsedMessage.chatId ?? parsedMessage.message?.chat?.id;
  const threadId = parsedMessage.threadId ?? parsedMessage.message?.message_thread_id ?? parsedMessage.message?.reply_to_message?.message_thread_id ?? undefined;
  const from = parsedMessage.from ?? parsedMessage.message?.from;

  if (!chatId || !from) {
    console.error("[coin] 找不到 chatId 或 from，跳过");
    return;
  }

  // 文本与参数：优先使用 parsedMessage.args（parseCommandFromText 已经拆分）
  const args = Array.isArray(parsedMessage.args) ? parsedMessage.args.slice() : [];


  const userId = String(from.id);
  const userName = String(from.first_name ?? from.username ?? "你");
  const safeUserName = escapeHtml(userName);

  const kv = env.COIN_KV;

  async function getBalance(id: string): Promise<number> {
    try {
      const raw = await kv.get(id);
      return raw ? parseInt(raw, 10) || 0 : 0;
    } catch (e) {
      console.warn("[coin] getBalance KV 读取失败", e);
      return 0;
    }
  }
  async function setBalance(id: string, bal: number) {
    try {
      await kv.put(id, String(bal));
    } catch (e) {
      console.error("[coin] setBalance KV 写入失败", e);
    }
  }

  const sub = (args[0] || "").toLowerCase();

  // — 查询余额（默认无子命令）
  if (!sub) {
    const bal = await getBalance(userId);
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `${safeUserName}，你目前有 ${bal} 💰。`,
      parse_mode: "HTML",
      message_thread_id: threadId
    });
    return;
  }

  // 日常祈祷
  if (sub === "pray") {
    // 限制到特定群组/主题（原逻辑）
    const allowed =
      (chatId === -1002848481881 && [66].includes(threadId ?? 0)) ||
      (chatId === -1002742074355 && [62].includes(threadId ?? 0));
    if (!allowed) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `✨ 这里的神圣气息过于微弱，女神未能听闻你的心愿。或许前往真正的祈祷之地，才能唤来幸运之光……`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    const prayKey = `coin_pray:${userId}`;
    const last = await kv.get(prayKey);
    const today = new Date().toISOString().split("T")[0];
    if (last === today) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `🙏 ${safeUserName}，你今天已经祈祷过了，明天再来吧！`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    // 活动期间奖励逻辑（原始硬编码时间）
    const todayD = new Date();
    const duringEvent = (todayD >= new Date("2025-08-12") && todayD <= new Date("2025-08-17"));
    const gain = duringEvent ? randomInt(11, 20) : randomInt(1, 10);

    const bal = await getBalance(userId);
    const newBal = bal + gain;
    await setBalance(userId, newBal);
    try { await kv.put(prayKey, today); } catch (e) { /* ignore */ }

    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `✨ ${safeUserName}，你祈祷获得了 ${gain} 💰，当前余额 ${newBal} 💰。`,
      parse_mode: "HTML",
      message_thread_id: threadId
    });
    return;
  }

  // pay 操作（向房间/祈愿箱投币）
  if (sub === "pay") {
    // 找到配置
    const cfg = payConfigs.find((c) => {
      if (c.chatId !== chatId) return false;
      if (!c.threadIds || c.threadIds.length === 0) return true;
      return c.threadIds.includes(threadId ?? 0);
    });

    if (!cfg || cfg.enabled === false) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${safeUserName}，此房间暂不支持投币 (pay)。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    const amount = parseInt(args[1] || "", 10);
    // 无数字则查询该房间余额
    if (isNaN(amount)) {
      const roomKey = `${chatId}||${threadId ?? 0}`;
      const roomBal = await getBalance(roomKey);
      const place = cfg.placeName || `房间 ${threadId}`;
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `📥 ${escapeHtml(place)} 当前有 ${roomBal} 💰。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    if (isNaN(amount) || amount <= 0) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${safeUserName}，请指定正确的投币数量，例如：<code>/coin pay 1</code>。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    // 检查并扣除用户余额
    const senderBal = await getBalance(userId);
    if (senderBal < amount) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${safeUserName}，你的余额不足，当前只有 ${senderBal} 💰。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }
    const newSenderBal = senderBal - amount;
    await setBalance(userId, newSenderBal);

    // 更新房间余额（key 为 chatId||threadId）
    const roomKey = `${chatId}||${threadId ?? 0}`;
    const oldRoomBal = await getBalance(roomKey);
    const newRoomBal = oldRoomBal + amount;
    await setBalance(roomKey, newRoomBal);

    const place = cfg.placeName || `房间 ${threadId}`;

    // 模板替换（小心 HTML 转义）
    const template = cfg.successMessage || "${userName} 往${place}投入 ${amount} 💰。${place}现在有 ${total} 💰。";
    const textOut = template
      .replace(/\$\{userName\}/g, safeUserName)
      .replace(/\$\{place\}/g, escapeHtml(place))
      .replace(/\$\{amount\}/g, String(amount))
      .replace(/\$\{total\}/g, String(newRoomBal))
      .replace(/\$\{threadId\}/g, String(threadId));

    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: textOut,
      parse_mode: "HTML",
      message_thread_id: threadId
    });
    return;
  }

  // send (转账) — 新逻辑：手续费进入国库
  if (sub === "send") {
    const todayD = new Date();
    const duringTrans = (todayD >= new Date("2025-08-15") && todayD <= new Date("2026-08-18"));
    if (!duringTrans) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${safeUserName}，转账功能升级中，敬请期待。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    const amount = parseInt(args[1] || "", 10);
    if (isNaN(amount) || amount <= 0) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${safeUserName}，请指定正确的转账数量，例如：<code>/coin send 50</code>。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    const target = parsedMessage.message?.reply_to_message?.from;
    if (!target) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${safeUserName}，请在对方的消息下回复并使用 <code>/coin send ${amount}</code>。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    // 检查并扣除发送者余额
    const senderBal = await getBalance(userId);
    if (senderBal < amount) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${safeUserName}，你的余额不足，当前只有 ${senderBal} 💰。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }
    const newSenderBal = senderBal - amount;
    await setBalance(userId, newSenderBal);

    // 接收者旧余额
    const targetId = String(target.id);
    const oldBal = await getBalance(targetId);

    // 阶梯费率
    let rate: number;
    if (oldBal < 100) rate = 0;
    else if (oldBal < 300) rate = 0.1;
    else if (oldBal < 500) rate = 0.3;
    else if (oldBal < 700) rate = 0.5;
    else if (oldBal < 900) rate = 0.7;
    else rate = 0.9;

    const fee = Math.floor(amount * rate);
    const newTargetBal = oldBal + amount - fee;
    await setBalance(targetId, newTargetBal);

    // 将手续费存入国库
    const oldTreasury = await getBalance(TREASURY_KEY);
    await setBalance(TREASURY_KEY, oldTreasury + fee);

    const targetName = escapeHtml(String(target.first_name ?? target.username ?? "TA"));

    await TgMessage.sendText(env, {
      chat_id: chatId,
      text:
        `💸 ${safeUserName} 向 ${targetName} 转账 ${amount} 💰。\n` +
        `📊 ${targetName} 原有余额 ${oldBal} 💰，适用费率 ${(rate * 100).toFixed(0)}%，手续费 ${fee} 💰（已入国库）。\n` +
        `✅ 转账后 ${targetName} 新余额：${newTargetBal} 💰；\n` +
        `🪙 你的新余额：${newSenderBal} 💰。`,
      parse_mode: "HTML",
      message_thread_id: threadId
    });
    return;
  }

  // 新增管理命令：check / take / create
  // /coin check — 不带参数显示国库 + 所有用户账户总和；回复某人则查询该人余额（仅管理员可用）
  if (sub === "check") {
    const callerNum = Number(userId);
    if (!ADMIN_UIDS.includes(callerNum)) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${safeUserName}，你没有权限使用 /coin check。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    // 如果是回复某人的消息，则查询该人的余额
    const replied = parsedMessage.message?.reply_to_message?.from;
    if (replied) {
      const targetId = String(replied.id);
      const bal = await getBalance(targetId);
      const targetName = escapeHtml(String(replied.first_name ?? replied.username ?? targetId));
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `👤 ${targetName} 的余额：${bal} 💰。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    // 否则（无参数且非回复）—— 计算国库与所有用户账户余额之和
    try {
      let treasuryBal = await getBalance(TREASURY_KEY);

      // 遍历 KV 列表，累加所有看起来像用户 UID 的键（纯数字），排除国库键和房间键（含 '||'）
      let totalUserBal = 0;
      let cursor: string | undefined = undefined;
      do {
        const listOpts: any = cursor ? { cursor } : {};
        // limit 可选，视 KV 大小调整；这里不指定则使用默认分页
        const res = await (kv as any).list(listOpts);
        cursor = res.cursor;

        for (const k of (res.keys || [])) {
          const name: string = k.name;
          if (name === TREASURY_KEY) continue;
          if (name.includes("||")) continue; // 跳过房间键
          if (/^\d+$/.test(name)) { // 仅数字键视为用户账户
            const v = await getBalance(name);
            totalUserBal += v;
          }
        }
      } while (cursor);

      await TgMessage.sendText(env, {
        chat_id: chatId,
        text:
          `🏦 国库：${treasuryBal} 💰。\n` +
          `👥 所有用户账户余额合计：${totalUserBal} 💰。\n` +
          `📊 国库 + 用户总计：${treasuryBal + totalUserBal} 💰。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    } catch (e) {
      console.error("[coin] /coin check 列表或计算失败", e);
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ 查询失败：无法遍历账户数据，请稍后重试或联系管理员。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }
  }


  // /coin take <amount> [<targetUid>]  — 从国库取款，限 ADMIN_UIDS
  if (sub === "take") {
    const callerNum = Number(userId);
    if (!ADMIN_UIDS.includes(callerNum)) {
      await TgMessage.sendText(env, { chat_id: chatId, text: `❌ ${safeUserName}，你没有权限使用 /coin take。`, parse_mode: "HTML", message_thread_id: threadId });
      return;
    }

    const amount = parseInt(args[1] || "", 10);
    if (isNaN(amount) || amount <= 0) {
      await TgMessage.sendText(env, { chat_id: chatId, text: `❌ ${safeUserName}，请指定正确的取款数量，例如：<code>/coin take 100</code>。`, parse_mode: "HTML", message_thread_id: threadId });
      return;
    }

    const targetUid = args[2] ? String(args[2]) : userId; // 默认为自己
    const treasuryBal = await getBalance(TREASURY_KEY);
    if (treasuryBal < amount) {
      await TgMessage.sendText(env, { chat_id: chatId, text: `❌ 国库余额不足，当前只有 ${treasuryBal} 💰。`, parse_mode: "HTML", message_thread_id: threadId });
      return;
    }

    // 扣除国库并增加目标账户
    await setBalance(TREASURY_KEY, treasuryBal - amount);
    const oldTargetBal = await getBalance(targetUid);
    await setBalance(targetUid, oldTargetBal + amount);

    await TgMessage.sendText(env, { chat_id: chatId, text: `✅ 已从国库取出 ${amount} 💰，并转入账户 ${escapeHtml(targetUid)}。国库剩余 ${treasuryBal - amount} 💰。`, parse_mode: "HTML", message_thread_id: threadId });
    return;
  }

  // /coin create <amount> — 向国库注入（凭空） ，限 ADMIN_UIDS
  if (sub === "create") {
    const callerNum = Number(userId);
    if (!ADMIN_UIDS.includes(callerNum)) {
      await TgMessage.sendText(env, { chat_id: chatId, text: `❌ ${safeUserName}，你没有权限使用 /coin create。`, parse_mode: "HTML", message_thread_id: threadId });
      return;
    }

    const amount = parseInt(args[1] || "", 10);
    if (isNaN(amount) || amount <= 0) {
      await TgMessage.sendText(env, { chat_id: chatId, text: `❌ ${safeUserName}，请指定正确的注入数量，例如：<code>/coin create 1000</code>。`, parse_mode: "HTML", message_thread_id: threadId });
      return;
    }

    const oldTreasury = await getBalance(TREASURY_KEY);
    await setBalance(TREASURY_KEY, oldTreasury + amount);

    await TgMessage.sendText(env, { chat_id: chatId, text: `✅ 已向国库注入 ${amount} 💰。国库当前 ${oldTreasury + amount} 💰。`, parse_mode: "HTML", message_thread_id: threadId });
    return;
  }

  // 未知子命令
  await TgMessage.sendText(env, {
    chat_id: chatId,
    text:
      `❓ 不支持的子命令，请用：\n` +
      `<code>/coin</code> 查询余额\n` +
      `<code>/coin pray</code> 今日祈祷\n` +
      `<code>/coin send 50</code> 回复消息支付 50 💰\n` +
      `<code>/coin check</code> （管理员查询国库）\n` +
      `<code>/coin take 100</code> （管理员从国库取款）\n` +
      `<code>/coin create 1000</code> （管理员向国库注入）`,
    parse_mode: "HTML",
    message_thread_id: threadId
  });
  return;
}

export default handleCoin;
