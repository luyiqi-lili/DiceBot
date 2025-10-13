// lib/coinService.ts
import TgMessage, { EnvLike } from "../lib/tgMessage";

/**
 * coinService - Durable Object (COIN_DO) based implementation
 *
 * 说明：
 *  - 所有余额变更通过 COIN_DO 的 POST /transfer 原子完成（保证同一 DO 实例内原子性）。
 *  - 查询通过 GET /get?key=... 完成。
 *  - 本文件不再假装为 KV（不要再使用 createDOAdapter 返回的 KV-like 对象）。
 *
 * 依赖：
 *  - 需要传入 DurableObjectNamespace（例如 env.COIN_DO）
 */

export type CoinEnv = EnvLike & {
  COIN_DO: DurableObjectNamespace;
  BOT_USERNAME?: string;
};

export const TREASURY_KEY = "__treasury__";

/** helper - get DO stub for the canonical coins instance (name: "coins") */
function getCoinsStub(doNs: DurableObjectNamespace) {
  const id = doNs.idFromName("coins");
  return doNs.get(id);
}

/** low-level: fetch GET /get?key=... from DO, return string|null */
async function doGetRaw(doNs: DurableObjectNamespace, key: string): Promise<string | null> {
  const stub = getCoinsStub(doNs);
  const base = "https://do";
  const url = `${base}/get?key=${encodeURIComponent(key)}`;
  try {
    const res = await stub.fetch(url, { method: "GET" });
    if (!res.ok) return null;
    const text = await res.text();
    // DO returns "" for missing key in our DO implementation — keep that behavior as null for clarity
    return text === "" ? null : text;
  } catch (e) {
    console.error("[coinService] doGetRaw fetch failed", e);
    return null;
  }
}

/** low-level: POST /transfer to DO, body should be JSON */
async function doTransferRaw(doNs: DurableObjectNamespace, body: Record<string, any>): Promise<any> {
  const stub = getCoinsStub(doNs);
  const base = "https://do";
  const url = `${base}/transfer`;
  try {
    const res = await stub.fetch(url, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }
    });
    const txt = await res.text();
    try {
      return JSON.parse(txt);
    } catch {
      // if not JSON, return raw text
      return txt;
    }
  } catch (e) {
    console.error("[coinService] doTransferRaw fetch failed", e);
    return { ok: false, reason: "do_transfer_error" };
  }
}

/** 日志：发送交易审计（尽量不阻塞主流程） */
async function SendTransLog(env: EnvLike, amount: number, id: string, event: string): Promise<void> {
  try {
    // 尽量不抛异常到上层
    await TgMessage.sendText(env, {
      chat_id: -1002848481881,
      text: `${id}  ${event}\nUID: <code>${id}</code>\n金额: ${amount}`,
      parse_mode: "HTML",
      message_thread_id: 12084
    });
  } catch (e) {
    console.warn("[coinService] SendTransLog failed", e);
  }
}

/** 读取余额（返回 number），若出错则返回 0 */
export async function getBalance(doNs: DurableObjectNamespace, id: string): Promise<number> {
  try {
    const raw = await doGetRaw(doNs, id);
    if (raw === null) return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch (e) {
    console.warn("[coinService] getBalance error", e);
    return 0;
  }
}

/** 增加账户余额，基于 transfer(from=TREASURY_KEY, to=id)；返回新余额或 -1 表示失败 */
export async function addToBalance(env: EnvLike, doNs: DurableObjectNamespace, id: string, delta: number, event: String): Promise<number> {
  if (delta <= 0) return await getBalance(doNs, id); // no-op
  // use transfer treasury -> id, allow negative treasury so treasury can go below zero if desired
  const body = {
    from: TREASURY_KEY,
    to: id,
    amount: delta,
    allowNegativeTreasury: true
  };
  const res = await doTransferRaw(doNs, body);
  if (res && res.ok) {
    // log asynchronously (fire-and-forget)
    SendTransLog(env, delta, `${TREASURY_KEY} -> ${id}`, `${event} 增加 ${delta} 变更后 ${res.toNew}`);
    return res.toNew ?? (await getBalance(doNs, id));
  } else {
    console.error("[coinService] addToBalance failed", res);
    return -1;
  }
}

/** 从账户扣款（正常逻辑：如果余额不足则返回 false） */
export async function deductFromBalance(env: EnvLike, doNs: DurableObjectNamespace, id: string, amount: number, event: String): Promise<boolean> {
  if (amount <= 0) return true;
  // transfer id -> treasury
  const body = {
    from: id,
    to: TREASURY_KEY,
    amount,
    // by default do NOT allow negative from arbitrary user
  };
  const res = await doTransferRaw(doNs, body);
  if (res && res.ok) {
    SendTransLog(env, amount, `${id} -> ${TREASURY_KEY}`, `${event} 扣减 ${amount} 变更后 ${res.fromNew}`);
    return true;
  } else {
    // transfer failed (likely insufficient)
    return false;
  }
}

/**
 * 从账户扣款，允许目标变为负值（如果 DO 支持 allowNegativeFrom）
 * - 我这里会把 allowNegativeFrom 透传给 DO（DO 需实现对应逻辑）
 * - 如果 DO 不支持该 flag，调用可能失败；你可以选择在 DO 内实现 allowNegativeFrom
 */
export async function deductFromBalanceAllowNegative(env: EnvLike, doNs: DurableObjectNamespace, id: string, amount: number, event: String): Promise<boolean> {
  if (amount <= 0) return true;
  const body = {
    from: id,
    to: TREASURY_KEY,
    amount,
    allowNegativeFrom: true // 由 DO 端决定是否允许
  };
  const res = await doTransferRaw(doNs, body);
  if (res && res.ok) {
    SendTransLog(env, amount, `${id} -> ${TREASURY_KEY}`, `${event} 扣减(允许负值) ${amount} 变更后 ${res.fromNew}`);
    return true;
  } else {
    // 如果 DO 不支持 allowNegativeFrom，会返回错误；为了兼容，记录并返回 false
    console.error("[coinService] deductFromBalanceAllowNegative failed", res);
    return false;
  }
}

/* -------------------- 国库操作（基于 transfer） -------------------- */

/** 获取国库余额 */
export async function getTreasury(doNs: DurableObjectNamespace): Promise<number> {
  return await getBalance(doNs, TREASURY_KEY);
}

/** 把金额加入国库（treasury += amount），实现为 transfer from user->treasury 或 transfer from special->treasury */
export async function addToTreasury(env: EnvLike, doNs: DurableObjectNamespace, amount: number, event: String): Promise<number> {
  // If amount <= 0 just return current treasury
  if (amount <= 0) return await getTreasury(doNs);
  // We'll transfer from a virtual source (TREASURY_KEY) to TREASURY_KEY? That would be noop.
  // The typical caller uses addToTreasury(env, kv, amount, "reason") when funds should be moved into treasury.
  // Here we assume caller wants to credit treasury from "virtual source" (like game issuance), so simply perform:
  // transfer from TREASURY_KEY to TREASURY_KEY with negative amount is nonsense.
  // Simpler: call DO /transfer from TREASURY_KEY -> TREASURY_KEY? Instead, we'll read current value and write new value by transferring from TREASURY_KEY to target with allowNegativeTreasury true reversed.
  // Practical approach: perform transfer from TREASURY_KEY to a temporary account then from that account back? Ugly.
  // Better: ask DO to accept a transfer from a special issuer (we'll instruct DO to increase treasury by allowing negative treasury to go negative and then compensate).
  // Here we implement addToTreasury as transfer from a special "__issuer__" -> TREASURY_KEY with allowNegativeFrom true.
  const issuer = "__issuer__";
  const body = {
    from: issuer,
    to: TREASURY_KEY,
    amount,
    allowNegativeFrom: true
  };
  const res = await doTransferRaw(doNs, body);
  if (res && res.ok) {
    SendTransLog(env, amount, `${issuer} -> ${TREASURY_KEY}`, `${event} 注入 ${amount} 后 ${res.toNew}`);
    return res.toNew ?? (await getTreasury(doNs));
  } else {
    console.error("[coinService] addToTreasury failed", res);
    return await getTreasury(doNs);
  }
}

/** 从国库取出（默认不允许国库负数） */
export async function takeFromTreasury(env: EnvLike, doNs: DurableObjectNamespace, amount: number, event: String): Promise<boolean> {
  if (amount <= 0) return true;
  // transfer treasury -> __treasury_receiver__ (we'll transfer to an ephemeral account or caller should immediately transfer to target)
  // Typical caller does takeFromTreasury + addToBalance on target, but to keep semantics, implement simple treasury->__temp__ then return true.
  // Simpler: do a transfer from TREASURY_KEY -> "__burn__"? Not desired.
  // We'll implement takeFromTreasury as a transfer from TREASURY_KEY to "__treasury_pool__" that callers can then distribute.
  // However historically takeFromTreasury returned boolean if successful; here we simply attempt treasury -> "__pool__" with no allow negative.
  const pool = "__treasury_pool__";
  const body = {
    from: TREASURY_KEY,
    to: pool,
    amount,
    allowNegativeTreasury: false
  };
  const res = await doTransferRaw(doNs, body);
  if (res && res.ok) {
    SendTransLog(env, amount, `${TREASURY_KEY} -> ${pool}`, `${event} 取出 ${amount} 后国库 ${res.fromNew}`);
    return true;
  } else {
    return false;
  }
}

/**
 * 从国库支付（允许出现负值）
 * - 返回是否成功（如果 DO 支持 allowNegativeTreasury 会成功并使国库可为负）
 */
export async function payoutFromTreasuryAllowNegative(env: EnvLike, doNs: DurableObjectNamespace, amount: number, event: String): Promise<boolean> {
  if (amount <= 0) return true;
  // Here we interpret "payout" = treasury pays some account (caller should then addToBalance)
  // For compatibility with older behavior, implement as transfer from TREASURY_KEY -> "__payout_sink__" with allowNegativeTreasury true.
  const sink = "__payout_sink__";
  const body = {
    from: TREASURY_KEY,
    to: sink,
    amount,
    allowNegativeTreasury: true
  };
  const res = await doTransferRaw(doNs, body);
  if (res && res.ok) {
    SendTransLog(env, amount, `${TREASURY_KEY} -> ${sink}`, `${event} 支付 ${amount} 后 ${res.fromNew}`);
    return true;
  } else {
    console.error("[coinService] payoutFromTreasuryAllowNegative failed", res);
    return false;
  }
}

/** 计算所有“用户”余额合计（把“纯数字”键视为用户账户，排除含 '||' 的房间键和艾丽莎宝库键） */
export async function sumAllUserBalances(doNs: DurableObjectNamespace): Promise<number> {
  let total = 0;
  try {
    // DO 实现保留了 /list 接口（返回 { keys: [{ name }], cursor }）
    const stub = getCoinsStub(doNs);
    const base = "https://do";
    let cursor = "";
    do {
      const url = `${base}/list?cursor=${encodeURIComponent(cursor)}`;
      const res = await stub.fetch(url, { method: "GET" });
      if (!res.ok) break;
      const json = await res.json();
      cursor = json.cursor || "";
      for (const k of (json.keys || [])) {
        const name: string = k.name;
        if (name === TREASURY_KEY) continue;
        if (name.includes("||")) continue;
        if (/^\d+$/.test(name)) {
          const v = await getBalance(doNs, name);
          total += v;
        }
      }
      if (!cursor) break;
    } while (cursor);
  } catch (e) {
    console.error("[coinService] sumAllUserBalances failed", e);
  }
  return total;
}
