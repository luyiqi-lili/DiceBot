// commands/coin.ts
import TgMessage, { ParsedUpdate, EnvLike, } from "../lib/tgMessage";
import { escapeHtml } from "../lib/util";
import { payConfigs } from "../lib/liveConfig";
import {
  getBalance,
  setBalance,
  payoutFromTreasuryAllowNegative,
  getTreasury,
  addToTreasury,
  takeFromTreasury,
  TREASURY_KEY
} from "../lib/coinService";

/**
 * 扩展 env 类型（至少需要 COIN_KV 和 BOT_USERNAME）
 */
type CoinEnv = EnvLike & {
  COIN_KV: KVNamespace;
  BOT_USERNAME?: string;
};

/* ------------------------- 全局配置（统一在顶部） ------------------------- */


// 管理员白名单（可分权限）
const ADMIN_UIDS_CHECK: number[] = [8080375150, 5621587953, 7804622477, 7476641553, 1019896885];
const ADMIN_UIDS_TAKE: number[] = [8080375150, 5621587953, 7804622477];
const ADMIN_UIDS_CREATE: number[] = [8080375150, 5621587953];
const ADMIN_UIDS_REMOVE: number[] = [8080375150, 5621587953, 7476641553, 1019896885];

/** 费率计算 */
function calcTransferFeeRate(targetBal: number): number {
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
 * - 成功返回 { ok:true, fee, fromNew, toNew }（手续费自动写入艾丽莎宝库 TREASURY_KEY）
 */
async function transfer(
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
  // 手续费入艾丽莎宝库
  await addToTreasury(kv, fee);

  return {
    ok: true,
    fee,
    fromNew: senderBal - amount,
    toNew: targetBal + amount - fee
  };
}

/** 计算所有“用户”余额合计（把“纯数字”键视为用户账户，排除含 '||' 的房间键和艾丽莎宝库键） */
async function sumAllUserBalances(kv: KVNamespace): Promise<number> {
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
    const gain = duringEvent ? randomInt(11, 20) : randomInt(8, 12);


    const bal = await getBalance(kv, userId);

    const rate = calcTransferFeeRate(bal);
    let fee = Math.floor(gain * rate);
    fee = 0;
    const newBal = bal + gain - fee;
    await payoutFromTreasuryAllowNegative(kv, gain - fee);
    await setBalance(kv, userId, newBal);
    try {
      await kv.put(prayKey, today);
    } catch (e) {
      /* ignore */
    }

    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `✨ ${safeUserName}，你祈祷获得了 ${gain - fee} 💰，当前余额 ${newBal} 💰。`,
      parse_mode: "HTML",
      message_thread_id: threadId
    });
    return;
  }

  // pay
  if (sub === "pay" || sub === "give") {
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

    await addToTreasury(kv, amount);
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

  // send (转账) — 使用 transfer()，手续费自动入艾丽莎宝库
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

    //如果传了UID
    const targetID = parseInt(args[2] || "", 10);
    if (!isNaN(targetID)) {
      const userInfo = await TgMessage.fetchChatMember(env, chatId, targetID);
      const targetName = userInfo.first_name;
      console.log(`🔔 [userInfo] ${targetName}`);
      console.log(`🔔 [targetName] ${targetName}`);
      if ((targetName == `用户${targetID}`)) {
        await TgMessage.sendText(env, { chat_id: chatId, text: `❌ 转账失败：${targetID} 查询用户失败`, parse_mode: "HTML", message_thread_id: threadId });
        return;

      }
      if ((targetID == parseInt(userId))) {
        await TgMessage.sendText(env, { chat_id: chatId, text: `❌ 转账失败，目标${targetID} 和转账${userId} 不能相同`, parse_mode: "HTML", message_thread_id: threadId });
        return;

      }
      const result = await transfer(kv, userId, targetID.toString(), amount);
      if (!result.ok) {
        await TgMessage.sendText(env, { chat_id: chatId, text: `❌ 转账失败：${result.reason}`, parse_mode: "HTML", message_thread_id: threadId });
        return;
      }
      const feePercent = result.fee && amount ? Math.round((result.fee / amount) * 100) : 0;
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text:
          `💸 ${escapeHtml(userName)} 向 ${targetName} 转账 ${amount} 💰。\n` +
          `📊 ${targetName} 原有余额 ${result.toNew! - (amount - result.fee!)} 💰，适用费率 ${feePercent}%，手续费 ${result.fee} 💰（已入艾丽莎宝库）。\n` +
          `✅ 转账后 ${targetName} 新余额：${result.toNew} 💰；\n` +
          `🪙 你的新余额：${result.fromNew} 💰。`,
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


    if (((repliedFrom.id) == parseInt(userId))) {
      await TgMessage.sendText(env, { chat_id: chatId, text: `❌ 转账失败，目标${repliedFrom.id} 和转账${userId} 不能相同`, parse_mode: "HTML", message_thread_id: threadId });
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
        `📊 ${targetName} 原有余额 ${result.toNew! - (amount - result.fee!)} 💰，适用费率 ${feePercent}%，手续费 ${result.fee} 💰（已入艾丽莎宝库）。\n` +
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

    // 否则返回艾丽莎宝库与所有用户合计
    try {
      const treasuryBal = await getTreasury(kv);
      const totalUserBal = await sumAllUserBalances(kv);


      const text =
        `🏦 艾丽莎宝库：${treasuryBal} 💰。\n` +
        `👥 所有用户账户余额合计：${totalUserBal} 💰。\n` +
        ` 📊 总计（宝库  + 房间）：${treasuryBal + totalUserBal} 💰。`
        ;

      await TgMessage.sendText(env, {
        chat_id: chatId,
        text,
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

  // /coin take <amount> — 扣除某人的coin（仅 ADMIN_UIDS）
  if (sub === "remove") {
    const callerNum = Number(userId);
    if (!ADMIN_UIDS_REMOVE.includes(callerNum)) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${safeUserName}，你没有权限使用 /coin remove。`,
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
    let targetUid;
    let targetLabel;
    // 目标：如果是回复某人则转给被回复的人，
    if (parsedMessage.isReply && parsedMessage.message?.reply_to_message?.from) {
      const r = parsedMessage.message.reply_to_message.from;
      targetUid = String(r.id);
      targetLabel = escapeHtml(String(r.first_name ?? r.username ?? targetUid));
    } else {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ 请回复消息进行扣款 💰。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;

    }


    const treasuryBal = await getTreasury(kv);
    const oldTargetBal = await getBalance(kv, targetUid);


    if (oldTargetBal < amount) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ 目标余额不足，当前只有 ${oldTargetBal} 💰。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    // 扣除艾丽莎宝库并增加目标账户
    await addToTreasury(kv, amount);

    const newTargetBal = oldTargetBal - amount;
    await setBalance(kv, targetUid, newTargetBal);

    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `——裁决之钟敲响。
    审判厅的【${safeUserName}】宣读神圣制令：
    自【${targetLabel}】处收取 ${amount} 💰，奉献艾丽莎宝库。
    【${targetLabel}】之余额：${newTargetBal} 💰。
    艾丽莎宝库盈余增长至 ${treasuryBal + amount} 💰。
命运之秤，得以维系。`,
      parse_mode: "HTML",
      message_thread_id: threadId
    });
    return;
  }


  // /coin take <amount> — 从艾丽莎宝库取款：不带回复则给自己，回复某人则给被回复的人（仅 ADMIN_UIDS）
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
    let targetLabel = escapeHtml(userName);
    if (parsedMessage.isReply && parsedMessage.message?.reply_to_message?.from) {
      const r = parsedMessage.message.reply_to_message.from;
      targetUid = String(r.id);
      targetLabel = escapeHtml(String(r.first_name ?? r.username ?? targetUid));
    }

    const treasuryBal = await getTreasury(kv);
    if (treasuryBal < amount) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ 艾丽莎宝库余额不足，当前只有 ${treasuryBal} 💰。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    // 扣除艾丽莎宝库并增加目标账户
    await takeFromTreasury(kv, amount);
    const oldTargetBal = await getBalance(kv, targetUid);
    const newTargetBal = oldTargetBal + amount;
    await setBalance(kv, targetUid, newTargetBal);

    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `✅ ${safeUserName} 已从艾丽莎宝库取出 ${amount} 💰，并转入账户 ${targetLabel}（新余额 ${newTargetBal} 💰）。艾丽莎宝库剩余 ${treasuryBal - amount} 💰。`,
      parse_mode: "HTML",
      message_thread_id: threadId
    });
    return;
  }

  // /coin create <amount>
  if (sub === "create") {
    const callerNum = Number(userId);
    if (!ADMIN_UIDS_CREATE.includes(callerNum)) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${safeUserName}，你没有权限使用 /coin create。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    const amount = parseInt(args[1] || "", 10);
    if (isNaN(amount) || amount <= 0) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${safeUserName}，请指定正确的注入数量，例如：<code>/coin create 1000</code>。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    await addToTreasury(kv, amount);
    const newTre = await getTreasury(kv);
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `✨ ${safeUserName} 从虚空中召唤出了 ${amount} 💰，投入了艾丽莎宝库。<blockquote>「能力越大，责任亦随之而来……」虚空造币，或将撕裂秩序，引来无法逆转的通胀风暴。不过，你一定是经过深思熟虑才踏出了这一步吧。</blockquote>艾丽莎宝库的结余，如今已达 ${newTre} 💰。`,
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
      `<code>/coin check</code> （管理员查询艾丽莎宝库/用户合计/回复某人查看其余额）\n` +
      `<code>/coin take 100</code> （管理员从艾丽莎宝库取款）\n` +
      `<code>/coin create 1000</code> （管理员向艾丽莎宝库注入）`,
    parse_mode: "HTML",
    message_thread_id: threadId
  });
  return;
}

export default handleCoin;
