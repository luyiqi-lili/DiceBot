// lib/coinService.ts

import TgMessage, { EnvLike } from "../lib/tgMessage";

/**
 */
export type CoinEnv = EnvLike & {
  COIN_DO:any;
  BOT_USERNAME?: string;
};
const nameMap: Record<string, string> = {
  '__treasury__': "艾莉莎宝库",
  '-1002742074355||62': "紫罗兰教堂的募捐箱",
  '-1002742074355||182': "天狐宫的祈愿箱",
  '-1002848481881||66': "紫罗兰教堂的募捐箱(测试)"
};


/* ------------------------- 全局配置（统一在顶部） ------------------------- */
// 艾丽莎宝库键
export const TREASURY_KEY = "__treasury__";

/** 日志，user 因为 变动 amout coin */
async function SendTransLog(env: EnvLike, amount: number, id: string, event: String, newBalance?: number): Promise<boolean> {

  let uname: string | undefined;
  try {
    if (!isNaN(Number(id))) {
      // 尝试在主群查用户名字（容错）
      const member = await TgMessage.fetchChatMember(env, -1002742074355, parseInt(id, 10));
      uname = member?.first_name;
      if (!uname || /^\d+$/.test(String(uname))) {
        const member2 = await TgMessage.fetchChatMember(env, -1002848481881, parseInt(id, 10));
        uname = member2?.first_name;
      }
    } else {
      uname = nameMap[id] ?? id;
    }
  } catch (e) {
    // 忽略 fetchChatMember 失败
  }

  const display = uname ?? id;
  const newBalStr = typeof newBalance === "number" ? ` 变更后 ${newBalance}` : "";
  await TgMessage.sendText(env, {
    chat_id: -1002848481881,
    text: `${display}  ${event} 变更量 ${amount}${newBalStr}\nUID: <code class="language-python">${id}</code>`,
    parse_mode: "HTML",
    message_thread_id: 12084
  });

  return false;
}

/** 读取余额（KV/DO） */
export async function getBalance(kv: KVNamespace, id: string): Promise<number> {
  try {
    const raw = await kv.get(id);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch (e) {
    console.warn("[coin] getBalance KV 读取失败", e);
    return 0;
  }
}

/** 写入余额（KV） - note: 仅在不支持 atomic 接口时回退使用 */
async function setBalance(kv: KVNamespace, id: string, bal: number): Promise<void> {
  try {
    await kv.put(id, String(bal));
  } catch (e) {
    console.error("[coin] setBalance KV 写入失败", e);
  }
}

/** 增加账户余额，返回新余额 — 使用 DO 的 atomicAdd（原子） */
export async function addToBalance(env: EnvLike, kv: any, id: string, delta: number, event: String): Promise<number> {
  // 优先使用 kv.atomicAdd（由 createDOAdapter 提供）
  if (typeof kv.atomicAdd === "function") {
    const res = await kv.atomicAdd(id, delta, event);
    const newBal = Number(res.balance || 0);
    // 日志（在原子写入后发送，保证日志与状态一致）
    try { await SendTransLog(env, delta, id, event, newBal); } catch (e) { /* ignore logging errors */ }
    return newBal;
  }

  // 回退到 KV-like 操作（非原子）——不推荐
  const cur = await getBalance(kv, id);
  const next = cur + delta;
  await SendTransLog(env, delta, id, `${event} 增加 ${delta} 变更前 ${cur} 变更后 ${next}`);
  await setBalance(kv, id, next);
  return next;
}

/** 从账户扣款，若余额不足返回 false，否则扣款并返回 true — 使用 DO 的 atomicDeduct（原子） */
export async function deductFromBalance(env: EnvLike, kv: any, id: string, amount: number, event: String): Promise<boolean> {
  if (typeof kv.atomicDeduct === "function") {
    const res = await kv.atomicDeduct(id, amount, event);
    if (!res.ok) return false;
    const newBal = Number(res.balance || 0);
    try { await SendTransLog(env, amount, id, event, newBal); } catch (e) { /* ignore */ }
    return true;
  }

  const cur = await getBalance(kv, id);
  if (cur < amount) return false;
  await SendTransLog(env, amount, id, `${event} 扣减 ${amount} 变更前 ${cur} 变更后 ${cur - amount}`);
  await setBalance(kv, id, cur - amount);
  return true;
}

/** 从账户扣款，允许负值（原子） */
export async function deductFromBalanceAllowNegative(env: EnvLike, kv: any, id: string, amount: number, event: String): Promise<boolean> {
  if (typeof kv.atomicDeductAllowNegative === "function") {
    const res = await kv.atomicDeductAllowNegative(id, amount, event);
    const newBal = Number(res.balance || 0);
    try { await SendTransLog(env, amount, id, event, newBal); } catch (e) { /* ignore */ }
    return true;
  }

  const cur = await getBalance(kv, id);
  await SendTransLog(env, amount, id, `${event} 扣减  ${amount}  变更前 ${cur} 变更后 ${cur - amount}`);
  await setBalance(kv, id, cur - amount);
  return true;
}


/* 艾丽莎宝库相关操作 */
export async function getTreasury(kv: KVNamespace): Promise<number> {
  return await getBalance(kv, TREASURY_KEY);
}
export async function addToTreasury(env: EnvLike, kv: any, amount: number, event: String): Promise<number> {
  // 使用 atomicAdd 对宝库键做原子 +amount
  if (typeof kv.atomicAdd === "function") {
    const res = await kv.atomicAdd(TREASURY_KEY, amount, event);
    const newBal = Number(res.balance || 0);
    try { await SendTransLog(env, amount, TREASURY_KEY, event, newBal); } catch (e) { /* ignore */ }
    return newBal;
  }
  return await addToBalance(env, kv, TREASURY_KEY, amount, event);
}
export async function takeFromTreasury(env: EnvLike, kv: any, amount: number, event: String): Promise<boolean> {
  if (typeof kv.atomicDeduct === "function") {
    const res = await kv.atomicDeduct(TREASURY_KEY, amount, event);
    if (!res.ok) return false;
    const newBal = Number(res.balance || 0);
    try { await SendTransLog(env, amount, TREASURY_KEY, event, newBal); } catch (e) { /* ignore */ }
    return true;
  }
  return await deductFromBalance(env, kv, TREASURY_KEY, amount, event);
}
/**
 * 从国库支付（允许出现负值）
 * - 返回新的国库余额（可能小于0）
 */
export async function payoutFromTreasuryAllowNegative(env: EnvLike, kv: any, amount: number, event: String): Promise<boolean> {
  if (typeof kv.atomicDeductAllowNegative === "function") {
    const res = await kv.atomicDeductAllowNegative(TREASURY_KEY, amount, event);
    const newBal = Number(res.balance || 0);
    try { await SendTransLog(env, amount, TREASURY_KEY, event, newBal); } catch (e) { /* ignore */ }
    return true;
  }
  return await deductFromBalanceAllowNegative(env, kv, TREASURY_KEY, amount, event);
}

/** 计算所有“用户”余额合计（把“纯数字”键视为用户账户，排除含 '||' 的房间键和艾丽莎宝库键） */
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
