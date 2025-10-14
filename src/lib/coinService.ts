// lib/coinService.ts
import TgMessage, { EnvLike } from "../lib/tgMessage";

/**
 * coinService (DO-based)
 *
 * Exposes:
 *  - getBalance(doNs, id, name?)
 *  - transfer(envOrNull, doNs, from, to, amount, allowNegativeTreasury?, name?)
 *  - addToTreasury(envOrNull, doNs, from, amount, event?, name?)
 *  - takeFromTreasury(envOrNull, doNs, to, amount, event?, allowNegativeTreasury?, name?)
 *  - mintToTreasury(envOrNull, doNs, amount, name?)   <-- 新增：直接向国库虚空注入（不扣任何账户）
 *  - getTreasury(doNs, name?)
 *  - sumAllUserBalances(doNs, name?)
 *  - addRoomCount(envOrNull, doNs, roomKey, delta, name?)
 *
 * All state-changing ops use the DO atomic endpoints (/transfer or /incr).
 */

export const TREASURY_KEY = "__treasury__";

function getDOStub(doNs: DurableObjectNamespace, name = "coins") {
  if (!doNs) throw new Error("Durable Object namespace (doNs) is required");
  const id = doNs.idFromName(name);
  return doNs.get(id);
}

export async function getBalance(doNs: DurableObjectNamespace, id: string, name = "coins"): Promise<number> {
  try {
    const stub = getDOStub(doNs, name);
    const url = `https://do/get?key=${encodeURIComponent(id)}`;
    const res = await stub.fetch(url, { method: "GET" });
    if (!res.ok) {
      console.warn("[coinService] getBalance: DO responded non-ok", await res.text());
      return 0;
    }
    const text = await res.text();
    if (!text) return 0;
    const n = parseInt(text, 10);
    return Number.isFinite(n) ? n : 0;
  } catch (e) {
    console.error("[coinService] getBalance failed", e);
    return 0;
  }
}

export async function transfer(
  envOrNull: EnvLike | null,
  doNs: DurableObjectNamespace,
  from: string,
  to: string,
  amount: number,
  allowNegativeTreasury = false,
  name = "coins"
): Promise<{ ok: boolean; reason?: string; fromNew?: number; toNew?: number }> {
  try {
    if (!doNs) throw new Error("doNs required");
    const stub = getDOStub(doNs, name);
    const url = `https://do/transfer`;
    const body = JSON.stringify({ from, to, amount, allowNegativeTreasury });
    const res = await stub.fetch(url, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" }
    });

    const json = await res.json().catch(async () => {
      const txt = await res.text().catch(() => "");
      return { ok: false, reason: `invalid response: ${txt}` };
    });

    if (!json || typeof json.ok === "undefined") {
      return { ok: false, reason: "invalid_response" };
    }

    return json as { ok: boolean; reason?: string; fromNew?: number; toNew?: number };
  } catch (e: any) {
    console.error("[coinService] transfer failed", e);
    try {
      if (envOrNull) {
        TgMessage.sendText(envOrNull, {
          chat_id: -1002848481881,
          text: `⚠️ coin transfer failed: ${String(e?.message ?? e)}\nfrom=${from} to=${to} amount=${amount}`,
          parse_mode: "HTML"
        }).catch(() => {});
      }
    } catch { /* ignore */ }
    return { ok: false, reason: "internal_error" };
  }
}

export async function addToTreasury(
  envOrNull: EnvLike | null,
  doNs: DurableObjectNamespace,
  from: string,
  amount: number,
  event?: string,
  name = "coins"
): Promise<{ ok: boolean; reason?: string; fromNew?: number; toNew?: number }> {
  return await transfer(envOrNull, doNs, from, TREASURY_KEY, amount, false, name);
}

export async function takeFromTreasury(
  envOrNull: EnvLike | null,
  doNs: DurableObjectNamespace,
  to: string,
  amount: number,
  event?: string,
  allowNegativeTreasury = false,
  name = "coins"
): Promise<{ ok: boolean; reason?: string; fromNew?: number; toNew?: number }> {
  return await transfer(envOrNull, doNs, TREASURY_KEY, to, amount, allowNegativeTreasury, name);
}

/**
 * mintToTreasury
 *  - 将指定 amount 直接原子地增加到 国库 (TREASURY_KEY)
 *  - 不从任何账户扣钱（虚空造币）
 *  - 使用 DO 的 POST /incr { key: TREASURY_KEY, delta: amount }
 *
 * 返回 { ok: true, new: number } 或 { ok: false, reason }
 */
export async function mintToTreasury(
  envOrNull: EnvLike | null,
  doNs: DurableObjectNamespace,
  amount: number,
  name = "coins"
): Promise<{ ok: boolean; reason?: string; new?: number }> {
  try {
    if (!doNs) throw new Error("doNs required");
    if (!Number.isFinite(amount) || amount <= 0 || Math.floor(amount) !== amount) {
      return { ok: false, reason: "invalid_amount" };
    }

    const stub = getDOStub(doNs, name);
    const url = `https://do/incr`;
    const body = JSON.stringify({ key: TREASURY_KEY, delta: amount });
    const res = await stub.fetch(url, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" }
    });

    const json = await res.json().catch(async () => {
      const txt = await res.text().catch(() => "");
      return { ok: false, reason: `invalid response: ${txt}` };
    });

    if (!json || typeof json.ok === "undefined") {
      return { ok: false, reason: "invalid_response" };
    }

    return json as { ok: boolean; reason?: string; new?: number };
  } catch (e: any) {
    console.error("[coinService] mintToTreasury failed", e);
    try {
      if (envOrNull) {
        TgMessage.sendText(envOrNull, {
          chat_id: -1002848481881,
          text: `⚠️ coin mintToTreasury failed: ${String(e?.message ?? e)}\namount=${amount}`,
          parse_mode: "HTML"
        }).catch(() => {});
      }
    } catch { /* ignore */ }
    return { ok: false, reason: "internal_error" };
  }
}

export async function getTreasury(doNs: DurableObjectNamespace, name = "coins"): Promise<number> {
  return await getBalance(doNs, TREASURY_KEY, name);
}

/**
 * sumAllUserBalances
 */
export async function sumAllUserBalances(doNs: DurableObjectNamespace, name = "coins"): Promise<number> {
  let total = 0;
  try {
    const stub = getDOStub(doNs, name);
    let cursor = "";
    do {
      const qs = new URLSearchParams();
      if (cursor) qs.set("cursor", cursor);
      qs.set("limit", "1000");
      const url = `https://do/list?${qs.toString()}`;
      const res = await stub.fetch(url, { method: "GET" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.warn("[coinService] sumAllUserBalances: list failed:", txt);
        break;
      }
      const json = await res.json().catch(() => ({ keys: [], cursor: "" }));
      const keys: Array<{ name: string }> = json.keys || [];
      for (const k of keys) {
        const nameKey = k.name;
        if (nameKey === TREASURY_KEY) continue;
        if (nameKey.includes("||")) continue;
        if (/^\d+$/.test(nameKey)) {
          const bal = await getBalance(doNs, nameKey, name);
          total += bal;
        }
      }
      cursor = json.cursor || "";
    } while (cursor);
  } catch (e) {
    console.error("[coinService] sumAllUserBalances failed", e);
  }
  return total;
}

/**
 * addRoomCount
 *  - 原子地为房间/计数键增加 delta（可以是正数）
 *  - roomKey 示例: `${chatId}||${threadId}`
 *  - 不会从任何账户扣钱（只是计数）
 *  - 依赖 DO 的 POST /incr 接口（必须存在）
 *
 * 返回 { ok: true, new: number } 或 { ok: false, reason }
 */
export async function addRoomCount(
  envOrNull: EnvLike | null,
  doNs: DurableObjectNamespace,
  roomKey: string,
  delta: number,
  name = "coins"
): Promise<{ ok: boolean; reason?: string; new?: number }> {
  try {
    if (!doNs) throw new Error("doNs required");
    const stub = getDOStub(doNs, name);
    const url = `https://do/incr`;
    const body = JSON.stringify({ key: roomKey, delta });
    const res = await stub.fetch(url, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" }
    });

    const json = await res.json().catch(async () => {
      const txt = await res.text().catch(() => "");
      return { ok: false, reason: `invalid response: ${txt}` };
    });

    if (!json || typeof json.ok === "undefined") {
      return { ok: false, reason: "invalid_response" };
    }
    return json as { ok: boolean; reason?: string; new?: number };
  } catch (e: any) {
    console.error("[coinService] addRoomCount failed", e);
    try {
      if (envOrNull) {
        TgMessage.sendText(envOrNull, {
          chat_id: -1002848481881,
          text: `⚠️ coin addRoomCount failed: ${String(e?.message ?? e)}\nroom=${roomKey} delta=${delta}`,
          parse_mode: "HTML"
        }).catch(() => {});
      }
    } catch { /* ignore */ }
    return { ok: false, reason: "internal_error" };
  }
}

export default {
  TREASURY_KEY,
  getBalance,
  transfer,
  addToTreasury,
  takeFromTreasury,
  mintToTreasury,
  getTreasury,
  sumAllUserBalances,
  addRoomCount
};
