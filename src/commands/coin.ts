// commands/coin.ts
import TgMessage, { ParsedUpdate, EnvLike } from "../lib/tgMessage";
import { deleteMarkup, escapeHtml } from "../lib/util";
import { payConfigs } from "../lib/liveConfig";
import {
  getBalance,
  getTreasury,
  addToTreasury,
  takeFromTreasury,
  TREASURY_KEY,
  sumAllUserBalances,
  transfer
} from "../lib/coinService";

type CoinEnv = EnvLike & {
  BOT_USERNAME?: string;
  COIN_DO: DurableObjectNamespace;
  DB: D1Database;
};

/* ------------------------- 全局配置（统一在顶部） ------------------------- */

// 管理员白名单（可分权限）
const ADMIN_UIDS_CHECK: number[] = [8080375150, 5621587953, 7804622477, 7476641553, 1019896885, 6367789964];
const ADMIN_UIDS_TAKE: number[] = [8080375150, 5621587953, 7804622477];
const ADMIN_UIDS_CREATE: number[] = [8080375150, 5621587953];
const ADMIN_UIDS_REMOVE: number[] = [8080375150, 5621587953, 7476641553, 1019896885];

/** 费率计算 */

/** ease-in-out 300 -> 0.1, 3000 -> 0.3，端点导数为0 */
function calcTransferFeeRate(targetBal: number): number {
  if (targetBal < 300) return 0;
  if (targetBal >= 3000) return 0.5;
  const t = (targetBal - 300) / (3000 - 300); // 0..1
  const ease = 3 * t * t - 2 * t * t * t; // cubic ease-in-out
  return 0.1 + ease * (0.3 - 0.1);
}


/* ------------------------- DO 低级封装（仅用于祈祷记录） ------------------------- */

function getCoinsStub(doNs: DurableObjectNamespace) {
  const id = doNs.idFromName("coins");
  return doNs.get(id);
}

// 仅用于祈祷记录的读写（不涉及货币操作）
async function doGetRaw(doNs: DurableObjectNamespace, key: string): Promise<string | null> {
  const stub = getCoinsStub(doNs);
  const base = "https://do";
  const url = `${base}/get?key=${encodeURIComponent(key)}`;
  try {
    const res = await stub.fetch(url, { method: "GET" });
    if (!res.ok) return null;
    const text = await res.text();
    return text === "" ? null : text;
  } catch (e) {
    console.error("[coin] doGetRaw failed", e);
    return null;
  }
}

// 仅用于祈祷记录的写入
async function doPutRaw(doNs: DurableObjectNamespace, key: string, value: string): Promise<boolean> {
  const stub = getCoinsStub(doNs);
  const base = "https://do";
  const url = `${base}/put`;
  try {
    const res = await stub.fetch(url, {
      method: "POST",
      body: JSON.stringify({ key, value }),
      headers: { "Content-Type": "application/json" }
    });
    return res.ok;
  } catch (e) {
    console.error("[coin] doPutRaw failed", e);
    return false;
  }
}

/* ------------------------- 使用 coinService 的高级封装 ------------------------- */

/**
 * atomicTransferUserToUser
 * - 先读取发起人余额以做前置检查（避免在中间出现因余额不足导致部分转账）
 * - 对于 fee = 0，直接尝试 single transfer (from -> to)
 * - 对于 fee > 0，先从 sender -> treasury 扣除 fee，再执行 sender -> recipient(amount - fee)
 *   （在极少数第二步失败时会尝试回滚已扣的手续费）
 *
 * 返回 { ok, reason?, fee?, fromNew?, toNew? }
 */
async function atomicTransferUserToUser(env: CoinEnv, fromId: string, toId: string, amount: number): Promise<{ ok: boolean; reason?: string; fee?: number; fromNew?: number; toNew?: number }> {
  const doNs = env.COIN_DO;
  if (!doNs) return { ok: false, reason: "no_do_namespace" };
  if (amount <= 0) return { ok: false, reason: "invalid amount" };

  // 前置余额检查
  const senderBal = await getBalance(doNs, fromId);
  if (senderBal < amount) return { ok: false, reason: "insufficient" };

  const targetBal = await getBalance(doNs, toId);
  const rate = calcTransferFeeRate(targetBal);
  const fee = Math.floor(amount * rate);

  // if no fee -> single atomic transfer (from -> to amount)
  if (fee === 0) {
    const res = await transfer(env, doNs, fromId, toId, amount);
    if (!res.ok) return { ok: false, reason: res.reason || "transfer_failed" };
    return { ok: true, fee: 0, fromNew: res.fromNew, toNew: res.toNew };
  }

  // fee > 0: sequence: 1) from->treasury fee ; 2) from->to (amount - fee)
  // Step1: 支付手续费到国库
  const step1 = await transfer(env, doNs, fromId, TREASURY_KEY, fee);
  if (!step1.ok) {
    return { ok: false, reason: step1.reason || "charge_fee_failed" };
  }

  // Step2: 转账给接收者
  const transferAmount = amount - fee;
  const step2 = await transfer(env, doNs, fromId, toId, transferAmount);
  if (!step2.ok) {
    // 极端回滚尝试：把已扣的 fee 从宝库退回给发送者
    try {
      await transfer(env, doNs, TREASURY_KEY, fromId, fee, true);
      console.warn("[coin] transfer step2 failed, rollback fee attempted");
    } catch (e) {
      console.error("[coin] rollback failed", e);
    }
    return { ok: false, reason: step2.reason || "transfer_recipient_failed" };
  }

  // 获取最新余额
  const newFrom = await getBalance(doNs, fromId);
  const newTo = await getBalance(doNs, toId);

  return { ok: true, fee, fromNew: newFrom, toNew: newTo };
}

/* ------------------------- 命令处理 ------------------------- */

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
  const doNs = env.COIN_DO;
  const sub = (args[0] || "").toLowerCase();

  // helper: 获取指定 userId 在本 chat 的 first_name（优先使用 fetchChatMember）
  async function resolveFirstName(uid: string | number): Promise<string> {
    try {
      const mid = Number(uid);
      const member = await TgMessage.fetchChatMember(env, chatId, mid);
      return String(member.first_name ?? member.username ?? mid);
    } catch (e) {
      // fallback: 尝试直接用消息中的 from 字段或 uid 本身
      try {
        if (typeof uid === "string" && !isNaN(Number(uid))) return uid;
        return String(uid);
      } catch {
        return String(uid);
      }
    }
  }

  // 获取调用者名字（不进行 escapeHtml）
  const userName = await resolveFirstName(userId);

  // — 查询余额（默认无子命令）
  if (!sub) {
    const bal = await getBalance(doNs, userId);
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `${userName}，你目前有 ${bal} 💰。`,
      parse_mode: "HTML",
      message_thread_id: threadId
    });
    return;
  }

  // pray
  if (sub === "pray") {
    const allowed =
      (chatId === -1002848481881 && [66].includes(threadId ?? 0)) ||
      (chatId === -1002742074355 && [638714].includes(threadId ?? 0));
    if (!allowed) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `✨ 此间的祈愿仅是空洞的回响，是一卷未被真理照见的契约，静默地悬浮于法则的边缘。唯有当您的思绪浸入那卷宗与数字的殿堂，化作规整的讯号低语，智慧之王的意识方随之苏醒，其权能将于无形的因果网络中脉动，精确流向您的命运。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    // 修复：使用专门的祈祷记录存储，而不是余额
    const prayKey = `coin_pray:${userId}`;
    const today = new Date().toISOString().split("T")[0];

    const lastPrayDate = await doGetRaw(doNs, prayKey);

    if (lastPrayDate === today) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `🙏 ${userName}，你今天已经祈祷过了，明天再来吧！`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    const todayD = new Date();
    const duringEvent = todayD >= new Date("2025-08-12") && todayD <= new Date("2025-08-17");
    const gain = duringEvent ? randomInt(11, 20) : randomInt(8, 12);

    // 祈祷：从国库支付（允许国库为负）到用户账户
    const payoutSuccess = await takeFromTreasury(env, doNs, userId, gain, "祈祷", true);

    if (!payoutSuccess.ok) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${userName}，祈祷失败：国库支付出错。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    // 标记今天已祈祷（使用专门的存储，不是余额）
    await doPutRaw(doNs, prayKey, today);

    const newBal = await getBalance(doNs, userId);
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `✨ ${userName}，你祈祷获得了 ${gain} 💰，当前余额 ${newBal} 💰。`,
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
        text: `❌ ${userName}，此房间暂不支持投币 (pay)。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    const amount = parseInt(args[1] || "", 10);
    if (isNaN(amount)) {
      const roomKey = `${chatId}||${threadId ?? 0}`;
      const roomBal = await getBalance(doNs, roomKey);
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
        text: `❌ ${userName}，请指定正确的投币数量，例如：<code>/coin pay 1</code>。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    const senderBal = await getBalance(doNs, userId);
    if (senderBal < amount) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${userName}，你的余额不足，当前只有 ${senderBal} 💰。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    const roomKey = `${chatId}||${threadId ?? 0}`;
    const roomBalBefore = await getBalance(doNs, roomKey);

    // 扣除用户 -> 宝库
    const deducted = await addToTreasury(env, doNs, userId, amount, "祈福支出");
    if (!deducted.ok) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${userName}，投币失败（扣款失败）。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    // 把这笔钱计入房间余额
    //const roomIncr = await addRoomCount(env, doNs, roomKey, amount, "祈福计数");

    const roomBalAfter = roomBalBefore + amount;
    await doPutRaw(doNs, roomKey, String(roomBalAfter))


    const place = cfg.placeName || `房间 ${threadId}`;
    const template = cfg.successMessage || "${userName} 往${place}投入 ${amount} 💰。${place}现在有 ${total} 💰。";
    const textOut = template
      .replace(/\$\{userName\}/g, userName)
      .replace(/\$\{place\}/g, escapeHtml(place))
      .replace(/\$\{amount\}/g, String(amount))
      .replace(/\$\{total\}/g, String(roomBalAfter))
      .replace(/\$\{threadId\}/g, String(threadId));

    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: textOut,
      parse_mode: "HTML",
      message_thread_id: threadId
    });
    return;
  }

  // send (转账) - 保持不变
  if (sub === "send") {
    const amount = parseInt(args[1] || "", 10);
    if (isNaN(amount) || amount <= 0) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${userName}，请指定正确的转账数量，例如：<code>/coin send 50</code>。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    //如果传了UID
    const targetID = parseInt(args[2] || "", 10);
    if (!isNaN(targetID)) {
      const userInfo = await TgMessage.fetchChatMember(env, chatId, targetID);
      const targetName = String(userInfo.first_name ?? userInfo.username ?? targetID);
      if ((targetName === `用户${targetID}`)) {
        await TgMessage.sendText(env, { chat_id: chatId, text: `❌ 转账失败：${targetID} 查询用户失败`, parse_mode: "HTML", message_thread_id: threadId });
        return;
      }
      if ((targetID === parseInt(userId))) {
        await TgMessage.sendText(env, { chat_id: chatId, text: `❌ 转账失败，目标${targetID} 和转账${userId} 不能相同`, parse_mode: "HTML", message_thread_id: threadId });
        return;
      }

      // 使用原子化组合转账
      const res = await atomicTransferUserToUser(env, userId, String(targetID), amount);
      if (!res.ok) {
        await TgMessage.sendText(env, { chat_id: chatId, text: `❌ 转账失败：${res.reason || "未知原因"}`, parse_mode: "HTML", message_thread_id: threadId });
        return;
      }
      const feePercent = res.fee && amount ? Math.round((res.fee / amount) * 100) : 0;
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text:
          `💸 ${userName} 向 ${String(userInfo.first_name ?? userInfo.username ?? targetID)} 转账 ${amount} 💰。\n` +
          `📊 原有余额更新完毕，手续费 ${res.fee ?? 0} 💰（已入艾丽莎宝库）。\n` +
          `✅ 转账后 新余额：${res.toNew} 💰；\n` +
          `🪙 你的新余额：${res.fromNew} 💰。`,
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
        text: `❌ ${userName}，请在对方的消息下回复并使用 <code>/coin send ${amount}</code>。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    if (((repliedFrom.id) === parseInt(userId))) {
      await TgMessage.sendText(env, { chat_id: chatId, text: `❌ 转账失败，目标${repliedFrom.id} 和转账${userId} 不能相同`, parse_mode: "HTML", message_thread_id: threadId });
      return;
    }

    const targetFirstName = await resolveFirstName(String(repliedFrom.id));
    const res = await atomicTransferUserToUser(env, userId, String(repliedFrom.id), amount);
    if (!res.ok) {
      await TgMessage.sendText(env, { chat_id: chatId, text: `❌ 转账失败：${res.reason || "未知原因"}`, parse_mode: "HTML", message_thread_id: threadId });
      return;
    }

    const targetName = String(targetFirstName ?? "TA");
    const feePercent = res.fee && amount ? Math.round((res.fee / amount) * 100) : 0;
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text:
        `💸 ${userName} 向 ${targetName} 转账 ${amount} 💰。\n` +
        `📊 手续费 ${res.fee ?? 0} 💰（已入艾丽莎宝库）。\n` +
        `✅ 转账后 ${targetName} 新余额：${res.toNew} 💰；\n` +
        `🪙 你的新余额：${res.fromNew} 💰。`,
      parse_mode: "HTML",
      message_thread_id: threadId
    });
    return;
  }

  /* ------------------------- 管理命令：check / take / create / remove ------------------------- */

  // /coin check - 保持不变
  if (sub === "check") {
    const callerNum = Number(userId);
    if (!ADMIN_UIDS_CHECK.includes(callerNum)) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${userName}，你没有权限使用 /coin check。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    // 如果回复某人：查询该人余额
    const repliedFrom = parsedMessage.message?.reply_to_message?.from;
    if (repliedFrom && parsedMessage.isReply) {
      const targetId = String(repliedFrom.id);
      const bal = await getBalance(doNs, targetId);
      const targetName = await resolveFirstName(targetId);
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
      const treasuryBal = await getTreasury(doNs);
      const totalUserBal = await sumAllUserBalances(doNs);

      const text =
        `🏦 艾丽莎宝库：${treasuryBal} 💰。\n` +
        `👥 所有用户账户余额合计：${totalUserBal} 💰。\n` +
        ` 📊 总计（宝库 + 用户）：${treasuryBal + totalUserBal} 💰。`;

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

  // /coin remove - 保持不变
  if (sub === "remove") {
    const callerNum = Number(userId);
    if (!ADMIN_UIDS_REMOVE.includes(callerNum)) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${userName}，你没有权限使用 /coin remove。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    const amount = parseInt(args[1] || "", 10);
    if (isNaN(amount)) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${userName}，请指定正确的取款数量，例如：<code>/coin remove 100</code>。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    let targetUid;
    let targetLabel;
    targetUid = parseInt(args[2] || "", 10);
    if (!isNaN(targetUid)) {
      const userInfo = await TgMessage.fetchChatMember(env, chatId, targetUid);
      targetLabel = userInfo.first_name;

    } else if (parsedMessage.isReply && parsedMessage.message?.reply_to_message?.from) {
      const r = parsedMessage.message.reply_to_message.from;
      targetUid = String(r.id);
      targetLabel = await resolveFirstName(targetUid);
    }
    else {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ 请回复消息进行扣款 💰。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    // 从目标 -> 宝库（允许目标变为负值）
    const deducted = await addToTreasury(env, doNs, targetUid, amount, "内务部税款");

    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `
——裁决之钟敲响。
内务部:
　　自【${targetLabel}】处收缴 ${amount} 💰，感谢您缴纳税款，我们迫切期待下一次的贡献。
`,
      parse_mode: "HTML",
      message_thread_id: threadId
    });
    return;
  }

  // /coin take - 保持不变
  if (sub === "take") {
    const callerNum = Number(userId);
    if (!ADMIN_UIDS_TAKE.includes(callerNum)) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${userName}，你没有权限使用 /coin take。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    const amount = parseInt(args[1] || "", 10);
    if (isNaN(amount) || amount <= 0) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${userName}，请指定正确的取款数量，例如：<code>/coin take 100</code>。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    // 目标：如果是回复某人则转给被回复的人，否则给调用者
    let targetUid = userId;
    let targetLabel = userName;
    if (parsedMessage.isReply && parsedMessage.message?.reply_to_message?.from) {
      const r = parsedMessage.message.reply_to_message.from;
      targetUid = String(r.id);
      targetLabel = await resolveFirstName(targetUid);
    }

    const treasuryBal = await getTreasury(doNs);
    if (treasuryBal < amount) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ 艾丽莎宝库余额不足，当前只有 ${treasuryBal} 💰。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    // 直接把国库 -> 目标
    await takeFromTreasury(env, doNs, targetUid, amount, "宝库取款");
    const newTargetBal = await getBalance(doNs, targetUid);
    const newTreasuryBal = await getTreasury(doNs);

    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `✅ ${userName} 已从艾丽莎宝库取出 ${amount} 💰，并转入账户 ${targetLabel}（新余额 ${newTargetBal} 💰）。艾丽莎宝库剩余 ${newTreasuryBal} 💰。`,
      parse_mode: "HTML",
      message_thread_id: threadId
    });
    return;
  }

  // /coin create - 保持不变
  if (sub === "create") {
    const callerNum = Number(userId);
    if (!ADMIN_UIDS_CREATE.includes(callerNum)) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${userName}，你没有权限使用 /coin create。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    const amount = parseInt(args[1] || "", 10);
    if (isNaN(amount) || amount <= 0) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${userName}，请指定正确的注入数量，例如：<code>/coin create 1000</code>。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    // 直接注入国库

    const oldTre = await getTreasury(doNs);
    await doPutRaw(doNs, TREASURY_KEY, String(amount + oldTre))
    const newTre = await getTreasury(doNs);
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `✨ ${userName} 从虚空中召唤出了 ${amount} 💰，投入了艾丽莎宝库。<blockquote>「能力越大，责任亦随之而来……」虚空造币，或将撕裂秩序，引来无法逆转的通胀风暴。不过，你一定是经过深思熟虑才踏出了这一步吧。</blockquote>艾丽莎宝库的结余，如今已达 ${newTre} 💰。`,
      parse_mode: "HTML",
      message_thread_id: threadId
    });
    return;
  }

  // /coin list - 修改为分页发送
  // /coin list - 修改为分页发送并添加群组检查
  // /coin list - 修改为分页发送并添加群组检查和最后发言时间
  if (sub === "list") {
    const callerNum = Number(userId);
    if (!ADMIN_UIDS_CHECK.includes(callerNum)) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${userName}，你没有权限使用 /coin list。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    // 定义目标群组ID
    const TARGET_CHAT_ID = -1002742074355;

    try {
      const id = doNs.idFromName("coins");
      const stub = doNs.get(id);

      let allBalances: Record<string, number> = {};
      let prayRecords: Record<string, string> = {};
      let cursor = "";

      // 分页读取 DO 内所有 key
      while (true) {
        const res = await stub.fetch(`https://do/list?limit=1000&cursor=${encodeURIComponent(cursor)}`);
        const data = await res.json();
        const keys: { name: string }[] = data.keys || [];
        cursor = data.cursor || "";

        // 遍历 keys，分别处理余额和祈祷记录
        for (const { name } of keys) {
          // 跳过房间和宝库数据
          if (name.includes('||') || name === TREASURY_KEY) {
            continue;
          }

          if (name.startsWith("coin_pray:")) {
            // 处理祈祷记录
            const prayUserId = name.replace("coin_pray:", "");
            const prayDate = await doGetRaw(doNs, name);
            if (prayDate) {
              prayRecords[prayUserId] = prayDate;
            }
            continue;
          }

          // 处理余额
          const bal = await getBalance(doNs, name);
          if (bal === 0) continue; // 跳过0余额
          allBalances[name] = bal;
        }

        if (!cursor) break;
      }

      // 排序取前200
      const top = Object.entries(allBalances)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 200);

      if (top.length === 0) {
        await TgMessage.sendText(env, {
          chat_id: chatId,
          text: `📭 暂无余额记录。`,
          parse_mode: "HTML",
          reply_markup: deleteMarkup,
          message_thread_id: threadId
        });
        return;
      }

      // 分页处理：每页显示50个用户
      const pageSize = 50;
      const totalPages = Math.ceil(top.length / pageSize);

      for (let page = 0; page < totalPages; page++) {
        const startIdx = page * pageSize;
        const endIdx = Math.min(startIdx + pageSize, top.length);
        const pageData = top.slice(startIdx, endIdx);

        const textLines = [];
        const globalStartIdx = startIdx + 1;

        // 批量获取用户最后发言时间
        let userLastActiveTimes: Record<string, string | null> = {};

        try {
          // 批量查询最后发言时间
          if (env.DB) {
            const userIds = pageData.map(([uid]) => uid).filter(uid => !isNaN(Number(uid)));
            if (userIds.length > 0) {
              // 使用 IN 查询批量获取最后发言时间
              const placeholders = userIds.map(() => '?').join(',');
              const query = `SELECT user_id, last_active_at FROM user_last_active WHERE user_id IN (${placeholders})`;

              const stmt = env.DB.prepare(query);
              for (let i = 0; i < userIds.length; i++) {
                stmt.bind(i, userIds[i]);
              }

              const result = await stmt.all();
              result.results.forEach((row: any) => {
                userLastActiveTimes[row.user_id] = row.last_active_at;
              });
            }
          }
        } catch (e) {
          console.error("[coin] 批量查询最后发言时间失败:", e);
        }

        // 批量检查群组成员状态
        const memberChecks = await Promise.all(
          pageData.map(async ([uid, bal], idx) => {
            const globalIdx = globalStartIdx + idx;

            // 检查用户是否在目标群组
            let inTargetGroup = false;
            let userDisplayName = `用户${uid}`;
            let lastActiveTime = userLastActiveTimes[uid] || null;

            if (!isNaN(Number(uid))) {
              try {
                // 尝试获取用户在当前群组的信息
                const member = await TgMessage.fetchChatMember(env, chatId, Number(uid));
                userDisplayName = member.first_name || userDisplayName;

                // 检查用户是否在目标群组
                inTargetGroup = await TgMessage.isUserInChat(env, TARGET_CHAT_ID, Number(uid));
              } catch (e) {
                // 如果获取用户信息失败，记录日志但继续处理
                console.log(`[coin] 获取用户 ${uid} 信息失败:`, e.message);
              }
            }

            // 格式化最后发言时间
            let lastActiveText = "从未发言";
            if (lastActiveTime) {
              try {
                const lastActiveDate = new Date(lastActiveTime);
                const now = new Date();
                const diffMs = now.getTime() - lastActiveDate.getTime();
                const diffMins = Math.floor(diffMs / (1000 * 60));
                const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

                if (diffMins < 1) lastActiveText = "刚刚";
                else if (diffMins < 60) lastActiveText = `${diffMins}分钟前`;
                else if (diffHours < 24) lastActiveText = `${diffHours}小时前`;
                else if (diffDays < 7) lastActiveText = `${diffDays}天前`;
                else {
                  // 超过7天显示具体日期
                  lastActiveText = lastActiveDate.toLocaleDateString('zh-CN', {
                    month: 'numeric',
                    day: 'numeric'
                  });
                }
              } catch (e) {
                console.error(`[coin] 格式化最后发言时间失败 ${uid}:`, e);
                lastActiveText = "时间未知";
              }
            }

            return {
              uid,
              bal,
              globalIdx,
              userDisplayName,
              inTargetGroup,
              prayDate: prayRecords[uid],
              lastActiveText
            };
          })
        );

        // 构建文本行
        for (const check of memberChecks) {
          const prayInfo = check.prayDate ? ` | 最后祈祷: ${check.prayDate}` : ` | 从未祈祷`;
          const groupStatus = check.inTargetGroup ? "✅" : "❌";

          textLines.push(
            `${check.globalIdx}. ${check.userDisplayName} ${check.uid} :${check.bal}💰 ${groupStatus} | 最后发言: ${check.lastActiveText}${prayInfo}`
          );
        }

        const pageInfo = totalPages > 1 ? `（第 ${page + 1}/${totalPages} 页）` : '';
        const out = `🏆 财富榜${pageInfo}\n` +
          `目标群组: ${TARGET_CHAT_ID} 成员检查\n` +
          `✅ = 在群组中 | ❌ = 不在群组中\n` +
          `<blockquote expandable>` +
          textLines.join("\n") +
          `</blockquote>`;

        await TgMessage.sendText(env, {
          chat_id: chatId,
          text: out,
          parse_mode: "HTML",
          reply_markup: deleteMarkup,
          message_thread_id: threadId
        });

        // 如果不是最后一页，等待一下避免发送过快
        if (page < totalPages - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      return;
    } catch (e) {
      console.error("[coin] /coin list error", e);
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ 查询失败：无法列出余额，请稍后重试。`,
        parse_mode: "HTML",
        reply_markup: deleteMarkup,
        message_thread_id: threadId
      });
      return;
    }
  }
  // 在已有的 /coin list 命令之后，添加 /coin list repair 命令
  if (sub === "repair") {
    const callerNum = Number(userId);
    if (!ADMIN_UIDS_CHECK.includes(callerNum)) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${userName}，你没有权限使用 /coin list repair。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    // 定义目标群组ID
    const TARGET_CHAT_ID = -1002742074355;

    // 发送开始清理的消息
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `🔧 开始清理无效数据...\n正在进行用户状态检查和余额调整...`,
      parse_mode: "HTML",
      message_thread_id: threadId
    });

    try {
      const id = doNs.idFromName("coins");
      const stub = doNs.get(id);

      let allBalances: Record<string, number> = {};
      let cursor = "";

      // 需要清理的用户列表
      const usersToClean: Array<{
        uid: string;
        bal: number;
        reason: 'invalid_id' | 'negative_balance' | 'not_in_group';
      }> = [];

      // 分页读取 DO 内所有 key
      while (true) {
        const res = await stub.fetch(`https://do/list?limit=1000&cursor=${encodeURIComponent(cursor)}`);
        const data = await res.json();
        const keys: { name: string }[] = data.keys || [];
        cursor = data.cursor || "";

        // 遍历 keys
        for (const { name } of keys) {
          // 跳过房间和宝库数据
          if (name.includes('||') || name === TREASURY_KEY || name.startsWith("coin_pray:")) {
            continue;
          }

          // 获取余额
          const bal = await getBalance(doNs, name);

          // 检查用户ID是否有效（必须是数字且为正数）
          const uidNum = Number(name);
          const isUidValid = !isNaN(uidNum) && uidNum > 0;

          if (!isUidValid) {
            // 无效ID
            usersToClean.push({
              uid: name,
              bal,
              reason: 'invalid_id'
            });
            continue;
          }

          if (bal < 0) {
            // 负余额
            usersToClean.push({
              uid: name,
              bal,
              reason: 'negative_balance'
            });
            continue;
          }

          // 检查用户是否在目标群组（只有正余额才需要检查）
          if (bal > 0) {
            try {
              const inTargetGroup = await TgMessage.isUserInChat(env, TARGET_CHAT_ID, uidNum);
              if (!inTargetGroup) {
                usersToClean.push({
                  uid: name,
                  bal,
                  reason: 'not_in_group'
                });
              }
            } catch (error) {
              // 如果查询失败，也视为不在群组
              console.log(`[coin] 检查用户 ${name} 状态失败:`, error.message);
              usersToClean.push({
                uid: name,
                bal,
                reason: 'not_in_group'
              });
            }
          }

          // 正常用户，记录余额用于后续统计
          allBalances[name] = bal;
        }

        if (!cursor) break;
      }

      // 如果没有需要清理的用户
      if (usersToClean.length === 0) {
        await TgMessage.sendText(env, {
          chat_id: chatId,
          text: `✅ 没有发现需要清理的数据。所有用户数据都是有效的。`,
          parse_mode: "HTML",
          message_thread_id: threadId
        });
        return;
      }

      // 按原因分组
      const byReason = {
        invalid_id: usersToClean.filter(u => u.reason === 'invalid_id'),
        negative_balance: usersToClean.filter(u => u.reason === 'negative_balance'),
        not_in_group: usersToClean.filter(u => u.reason === 'not_in_group')
      };

      // 发送清理计划
      let reportText = `📋 清理计划\n`;
      reportText += `────────────────\n`;
      reportText += `无效用户ID: ${byReason.invalid_id.length} 个\n`;
      reportText += `负余额用户: ${byReason.negative_balance.length} 个\n`;
      reportText += `不在群组用户: ${byReason.not_in_group.length} 个\n`;
      reportText += `总计: ${usersToClean.length} 个用户需要清理\n\n`;
      reportText += `⚠️ 确认执行清理吗？此操作不可逆。\n`;
      reportText += `回复 "确认清理" 开始执行。`;

      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: reportText,
        parse_mode: "HTML",
        message_thread_id: threadId
      });

      // 等待用户确认
      // 这里需要配合一个确认机制，简单实现：用户需要回复"确认清理"
      // 在实际使用中，可能需要更复杂的确认机制（如按钮）
      // 这里我们简单处理，用户需要重新发送 /coin list repair confirm

    } catch (e) {
      console.error("[coin] /coin list repair error", e);
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ 分析失败：无法读取用户数据，请稍后重试。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }
  }

  // 添加确认执行的命令
  if (sub === "confirm") {
    const callerNum = Number(userId);
    if (!ADMIN_UIDS_CHECK.includes(callerNum)) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${userName}，你没有权限使用此命令。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    // 定义目标群组ID
    const TARGET_CHAT_ID = -1002742074355;

    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `🔄 开始执行清理操作...`,
      parse_mode: "HTML",
      message_thread_id: threadId
    });

    try {
      const id = doNs.idFromName("coins");
      const stub = doNs.get(id);

      let cursor = "";
      let cleanedCount = 0;
      let totalAmount = 0;
      let cleanupLog: string[] = [];

      // 先获取当前国库余额
      const originalTreasury = await getTreasury(doNs);

      // 分页读取 DO 内所有 key
      while (true) {
        const res = await stub.fetch(`https://do/list?limit=1000&cursor=${encodeURIComponent(cursor)}`);
        const data = await res.json();
        const keys: { name: string }[] = data.keys || [];
        cursor = data.cursor || "";

        for (const { name } of keys) {
          // 跳过房间和宝库数据
          if (name.includes('||') || name === TREASURY_KEY || name.startsWith("coin_pray:")) {
            continue;
          }

          const bal = await getBalance(doNs, name);

          // 检查是否需要清理
          const uidNum = Number(name);
          const isUidValid = !isNaN(uidNum) && uidNum > 0;
          let needCleanup = false;
          let reason = '';

          if (!isUidValid) {
            needCleanup = true;
            reason = '无效ID';
          } else if (bal < 0) {
            needCleanup = true;
            reason = '负余额';
          } else if (bal > 0) {
            try {
              const inTargetGroup = await TgMessage.isUserInChat(env, TARGET_CHAT_ID, uidNum);
              if (!inTargetGroup) {
                needCleanup = true;
                reason = '不在群组';
              }
            } catch (error) {
              needCleanup = true;
              reason = '查询失败';
            }
          }

          if (needCleanup) {
            // 调整国库余额
            const treasuryChange = bal; // 正余额加回国库，负余额从国库扣除
            const newTreasury = await getTreasury(doNs);
            await doPutRaw(doNs, TREASURY_KEY, String(newTreasury + treasuryChange));

            // 删除用户账户（设置为0）
            await doPutRaw(doNs, name, "0");

            cleanedCount++;
            totalAmount += Math.abs(bal);

            // 记录日志（每10个用户记录一次）
            if (cleanedCount % 10 === 0) {
              cleanupLog.push(`已清理 ${cleanedCount} 个用户，调整金额: ${totalAmount} 💰`);
            }

            // 避免请求过快
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        if (!cursor) break;
      }

      // 获取清理后的国库余额
      const finalTreasury = await getTreasury(doNs);
      const treasuryChange = finalTreasury - originalTreasury;

      // 发送清理报告
      let reportText = `✅ 清理完成\n`;
      reportText += `────────────────\n`;
      reportText += `清理用户数: ${cleanedCount} 个\n`;
      reportText += `调整总金额: ${totalAmount} 💰\n`;
      reportText += `国库变化: ${treasuryChange > 0 ? '+' : ''}${treasuryChange} 💰\n`;
      reportText += `原始国库: ${originalTreasury} 💰\n`;
      reportText += `当前国库: ${finalTreasury} 💰\n\n`;

      if (cleanupLog.length > 0) {
        reportText += `📝 清理记录:\n`;
        reportText += cleanupLog.join('\n');
      }

      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: reportText,
        parse_mode: "HTML",
        message_thread_id: threadId
      });

      return;

    } catch (e) {
      console.error("[coin] /coin list repair confirm error", e);
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ 清理失败：执行过程中出现错误。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }
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
    reply_markup: deleteMarkup,
    message_thread_id: threadId
  });
  return;
}

export default handleCoin;
