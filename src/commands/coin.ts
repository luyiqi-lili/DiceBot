// commands/coin.ts
import TgMessage, { ParsedUpdate, EnvLike } from "../lib/tgMessage";

/**
 * 扩展 env 类型（至少需要 COIN_KV 和 BOT_USERNAME）
 */
export type CoinEnv = EnvLike & {
  COIN_KV: KVNamespace;
  BOT_USERNAME?: string;
};

/* ------------------------- 全局配置（统一在顶部） ------------------------- */
// 国库键
export const TREASURY_KEY = "__treasury__";

// 管理员白名单（可分权限）
export const ADMIN_UIDS_CHECK: number[] = [8080375150];
export const ADMIN_UIDS_TAKE: number[] = [8080375150];
export const ADMIN_UIDS_CREATE: number[] = [8080375150];

/* ------------------------- payConfigs（保留你的原始内容） ------------------------- */
export interface PayConfig {
  chatId: number;
  threadIds?: number[];
  placeName?: string;
  enabled?: boolean;
  successMessage?: string;
}

export const payConfigs: PayConfig[] = [
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

/* ------------------------- 公共工具函数（导出供其它模块复用） ------------------------- */
function escapeHtml(text: string) {
  return (text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** 读取余额（KV） */
export async function getBalance(kv: KVNamespace, id: string): Promise<number> {
  try {
    const raw = await kv.get(id);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch (e) {
    console.warn("[coin] getBalance KV 读取失败", e);
    return 0;
  }
}

/** 写入余额（KV） */
export async function setBalance(kv: KVNamespace, id: string, bal: number): Promise<void> {
  try {
    await kv.put(id, String(bal));
  } catch (e) {
    console.error("[coin] setBalance KV 写入失败", e);
  }
}

/** 增加账户余额，返回新余额 */
export async function addToBalance(kv: KVNamespace, id: string, delta: number): Promise<number> {
  const cur = await getBalance(kv, id);
  const next = cur + delta;
  await setBalance(kv, id, next);
  return next;
}

/** 从账户扣款，若余额不足返回 false，否则扣款并返回 true */
export async function deductFromBalance(kv: KVNamespace, id: string, amount: number): Promise<boolean> {
  const cur = await getBalance(kv, id);
  if (cur < amount) return false;
  await setBalance(kv, id, cur - amount);
  return true;
}

/** 费率计算（和你原来的阶梯规则一致） */
export function calcTransferFeeRate(targetBal: number): number {
  if (targetBal < 100) return 0;
  if (targetBal < 300) return 0.1;
  if (targetBal < 500) return 0.3;
  if (targetBal < 700) return 0.5;
  if (targetBal < 900) return 0.7;
  return 0.9;
}

/**
 * 转账：fromId -> toId
 * - 若余额不足返回 { ok:false, reason }
 * - 成功返回 { ok:true, fee, fromNew, toNew }（手续费自动写入国库 TREASURY_KEY）
 */
export async function transfer(
  kv: KVNamespace,
  fromId: string,
  toId: string,
  amount: number
): Promise<{ ok: boolean; reason?: string; fee?: number; fromNew?: number; toNew?: number }> {
  if (amount <= 0) return { ok: false, reason: "invalid amount" };
  const senderBal = await getBalance(kv, fromId);
  if (senderBal < amount) return { ok: false, reason: "insufficient" };

  const targetBal = await getBalance(kv, toId);
  const rate = calcTransferFeeRate(targetBal);
  const fee = Math.floor(amount * rate);

  // 扣款
  await setBalance(kv, fromId, senderBal - amount);
  // 收款
  await setBalance(kv, toId, targetBal + amount - fee);
  // 手续费入国库
  const oldTre = await getBalance(kv, TREASURY_KEY);
  await setBalance(kv, TREASURY_KEY, oldTre + fee);

  return {
    ok: true,
    fee,
    fromNew: senderBal - amount,
    toNew: targetBal + amount - fee
  };
}

/* 国库相关操作 */
export async function getTreasury(kv: KVNamespace): Promise<number> {
  return await getBalance(kv, TREASURY_KEY);
}
export async function addToTreasury(kv: KVNamespace, amount: number): Promise<number> {
  return await addToBalance(kv, TREASURY_KEY, amount);
}
export async function takeFromTreasury(kv: KVNamespace, amount: number): Promise<boolean> {
  return await deductFromBalance(kv, TREASURY_KEY, amount);
}
/** 凭空注入国库（create） */
export async function createTreasury(kv: KVNamespace, amount: number): Promise<number> {
  return await addToTreasury(kv, amount);
}

/** 计算所有“用户”余额合计（把“纯数字”键视为用户账户，排除含 '||' 的房间键和国库键） */
export async function sumAllUserBalances(kv: KVNamespace): Promise<number> {
  let total = 0;
  let cursor: string | undefined = undefined;
  do {
    const opts: any = cursor ? { cursor } : {};
    const res = await (kv as any).list(opts);
    cursor = res.cursor;
    for (const k of (res.keys || [])) {
      const name: string = k.name;
      if (name === TREASURY_KEY) continue;
      if (name.includes("||")) continue;
      if (/^\d+$/.test(name)) {
        const v = await getBalance(kv, name);
        total += v;
      }
    }
  } while (cursor);
  return total;
}

/* ------------------------- 原有命令处理（使用上面导出函数） ------------------------- */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function handleCoin(parsedMessage: ParsedUpdate, env: CoinEnv): Promise<void> {
  const chatId = parsedMessage.chatId ?? parsedMessage.message?.chat?.id;
  const threadId =
    parsedMessage.threadId ??
    parsedMessage.message?.message_thread_id ??
    parsedMessage.message?.reply_to_message?.message_thread_id ??
    undefined;
  const from = parsedMessage.from ?? parsedMessage.message?.from;

  if (!chatId || !from) {
    console.error("[coin] 找不到 chatId 或 from，跳过");
    return;
  }

  const args = Array.isArray(parsedMessage.args) ? parsedMessage.args.slice() : [];
  const userId = String(from.id);
  const userName = String(from.first_name ?? from.username ?? "你");
  const safeUserName = escapeHtml(userName);
  const kv = env.COIN_KV;
  const sub = (args[0] || "").toLowerCase();

  // — 查询余额（默认无子命令）
  if (!sub) {
    const bal = await getBalance(kv, userId);
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `${safeUserName}，你目前有 ${bal} 💰。`,
      parse_mode: "HTML",
      message_thread_id: threadId
    });
    return;
  }

  // pray
  if (sub === "pray") {
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

    const todayD = new Date();
    const duringEvent = todayD >= new Date("2025-08-12") && todayD <= new Date("2025-08-17");
    const gain = duringEvent ? randomInt(11, 20) : randomInt(1, 10);

    const bal = await getBalance(kv, userId);
    const newBal = bal + gain;
    await setBalance(kv, userId, newBal);
    try {
      await kv.put(prayKey, today);
    } catch (e) {
      /* ignore */
    }

    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `✨ ${safeUserName}，你祈祷获得了 ${gain} 💰，当前余额 ${newBal} 💰。`,
      parse_mode: "HTML",
      message_thread_id: threadId
    });
    return;
  }

  // pay
  if (sub === "pay") {
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
    if (isNaN(amount)) {
      const roomKey = `${chatId}||${threadId ?? 0}`;
      const roomBal = await getBalance(kv, roomKey);
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

    const senderBal = await getBalance(kv, userId);
    if (senderBal < amount) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${safeUserName}，你的余额不足，当前只有 ${senderBal} 💰。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }
    await setBalance(kv, userId, senderBal - amount);

    const roomKey = `${chatId}||${threadId ?? 0}`;
    const oldRoomBal = await getBalance(kv, roomKey);
    const newRoomBal = oldRoomBal + amount;
    await setBalance(kv, roomKey, newRoomBal);

    const place = cfg.placeName || `房间 ${threadId}`;
    const template = cfg.successMessage || "${userName} 往${place}投入 ${amount} 💰。${place}现在有 ${total} 💰。";
    const textOut = template
      .replace(/\$\{userName\}/g, escapeHtml(userName))
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

  // send (转账) — 使用 transfer()，手续费自动入国库
  if (sub === "send") {

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

    // 获取被回复用户
    const repliedFrom = parsedMessage.message?.reply_to_message?.from;
    if (!repliedFrom || !parsedMessage.isReply) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${safeUserName}，请在对方的消息下回复并使用 <code>/coin send ${amount}</code>。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    const result = await transfer(kv, userId, String(repliedFrom.id), amount);
    if (!result.ok) {
      await TgMessage.sendText(env, { chat_id: chatId, text: `❌ 转账失败：${result.reason}`, parse_mode: "HTML", message_thread_id: threadId });
      return;
    }

    const targetName = escapeHtml(String(repliedFrom.first_name ?? repliedFrom.username ?? "TA"));
    const feePercent = result.fee && amount ? Math.round((result.fee / amount) * 100) : 0;
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text:
        `💸 ${escapeHtml(userName)} 向 ${targetName} 转账 ${amount} 💰。\n` +
        `📊 ${targetName} 原有余额 ${result.toNew! - (amount - result.fee!)} 💰，适用费率 ${feePercent}%，手续费 ${result.fee} 💰（已入国库）。\n` +
        `✅ 转账后 ${targetName} 新余额：${result.toNew} 💰；\n` +
        `🪙 你的新余额：${result.fromNew} 💰。`,
      parse_mode: "HTML",
      message_thread_id: threadId
    });
    return;
  }

  /* ------------------------- 管理命令：check / take / create ------------------------- */

  // /coin check
  if (sub === "check") {
    const callerNum = Number(userId);
    if (!ADMIN_UIDS_CHECK.includes(callerNum)) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${safeUserName}，你没有权限使用 /coin check。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    // 如果回复某人：查询该人余额
    const repliedFrom = parsedMessage.message?.reply_to_message?.from;
    if (repliedFrom && parsedMessage.isReply) {
      const targetId = String(repliedFrom.id);
      const bal = await getBalance(kv, targetId);
      const targetName = escapeHtml(String(repliedFrom.first_name ?? repliedFrom.username ?? targetId));
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `👤 ${targetName} 的余额：${bal} 💰。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    // 否则返回国库与所有用户合计
    try {
      const treasuryBal = await getTreasury(kv);
      const totalUserBal = await sumAllUserBalances(kv);
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

  // /coin take <amount> — 从国库取款：不带回复则给自己，回复某人则给被回复的人（仅 ADMIN_UIDS）
  if (sub === "take") {
    const callerNum = Number(userId);
    if (!ADMIN_UIDS_TAKE.includes(callerNum)) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${safeUserName}，你没有权限使用 /coin take。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    const amount = parseInt(args[1] || "", 10);
    if (isNaN(amount) || amount <= 0) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${safeUserName}，请指定正确的取款数量，例如：<code>/coin take 100</code>。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    // 目标：如果是回复某人则转给被回复的人，
    let targetUid = userId;
    let targetLabel = escapeHtml(userId);
    if (parsedMessage.isReply && parsedMessage.message?.reply_to_message?.from) {
      const r = parsedMessage.message.reply_to_message.from;
      targetUid = String(r.id);
      targetLabel = escapeHtml(String(r.first_name ?? r.username ?? targetUid));
    }

    const treasuryBal = await getBalance(kv, TREASURY_KEY);
    if (treasuryBal < amount) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ 国库余额不足，当前只有 ${treasuryBal} 💰。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    // 扣除国库并增加目标账户
    await setBalance(kv, TREASURY_KEY, treasuryBal - amount);
    const oldTargetBal = await getBalance(kv, targetUid);
    const newTargetBal = oldTargetBal + amount;
    await setBalance(kv, targetUid, newTargetBal);

    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `✅ 已从国库取出 ${amount} 💰，并转入账户 ${targetLabel}（新余额 ${newTargetBal} 💰）。国库剩余 ${treasuryBal - amount} 💰。`,
      parse_mode: "HTML",
      message_thread_id: threadId
    });
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
      `<code>/coin check</code> （管理员查询国库/用户合计/回复某人查看其余额）\n` +
      `<code>/coin take 100</code> （管理员从国库取款）\n` +
      `<code>/coin create 1000</code> （管理员向国库注入）`,
    parse_mode: "HTML",
    message_thread_id: threadId
  });
  return;
}

export default handleCoin;
