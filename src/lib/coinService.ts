// lib/coinService.ts
import TgMessage, { EnvLike } from '../lib/telegram';
import { COIN_LOG_CHAT_ID, COIN_LOG_THREAD_ID } from './coinLogTarget';
import { scopeKey } from './groupScope';

/**
 * coinService (DO-based) —— 按群组 chat_id 隔离
 *
 * Exposes:
 *  - getBalance(doNs, chatId, id, name?)
 *  - transfer(envOrNull, doNs, chatId, from, to, amount, allowNegativeTreasury?, name?)
 *  - addToTreasury(envOrNull, doNs, chatId, from, amount, event?, name?)
 *  - takeFromTreasury(envOrNull, doNs, chatId, to, amount, event?, allowNegativeTreasury?, name?)
 *  - getTreasury(doNs, chatId, name?)
 *  - sumAllUserBalances(doNs, chatId, name?)
 *
 * 账户 key 在 DO 内部按 `${chatId}:${id}` 作用域化（含 __treasury__）；
 * 已带 "||" 的房间募捐箱 key 保持原样（本身已含 chat 上下文）。
 *
 * All state-changing ops use the DO atomic endpoints (/transfer or /incr).
 */

export const TREASURY_KEY = "__treasury__";

type TransferResult = { ok: boolean; reason?: string; fromNew?: number; toNew?: number };
type BalanceListResponse = { keys?: Array<{ name?: string }>; cursor?: string };

function getDOStub(doNs: DurableObjectNamespace, name = "coins") {
  if (!doNs) throw new Error("Durable Object namespace (doNs) is required");
  const id = doNs.idFromName(name);
  return doNs.get(id);
}

export async function getBalance(doNs: DurableObjectNamespace, chatId: string | number, id: string, name = "coins"): Promise<number> {
  try {
    const stub = getDOStub(doNs, name);
    const url = `https://do/get?key=${encodeURIComponent(scopeKey(chatId, id))}`;
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
  chatId: string | number,
  from: string,
  to: string,
  amount: number,
  allowNegativeTreasury = false,
  name = "coins"
): Promise<TransferResult> {
  try {
    if (!doNs) throw new Error("doNs required");
    const stub = getDOStub(doNs, name);
    const url = `https://do/transfer`;
    const body = JSON.stringify({
      from: scopeKey(chatId, from),
      to: scopeKey(chatId, to),
      amount,
      allowNegativeTreasury,
    });
    const res = await stub.fetch(url, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" }
    });

    const json = await res.json().catch(async (): Promise<TransferResult> => {
      const txt = await res.text().catch(() => "");
      return { ok: false, reason: `invalid response: ${txt}` };
    }) as Partial<TransferResult> | null;

    if (!json || typeof json.ok !== "boolean") {
      return { ok: false, reason: "invalid_response" };
    }

    return {
      ok: json.ok,
      reason: json.reason,
      fromNew: json.fromNew,
      toNew: json.toNew
    };
  } catch (e: any) {
    console.error("[coinService] transfer failed", e);
    try {
      if (envOrNull) {
        TgMessage.sendText(envOrNull, {
          chat_id: COIN_LOG_CHAT_ID,
          text: `⚠️ coin transfer failed: ${String(e?.message ?? e)}\nchat=${chatId} from=${from} to=${to} amount=${amount}`,
          parse_mode: "HTML",
          message_thread_id: COIN_LOG_THREAD_ID
        }).catch(() => { });
      }
    } catch { /* ignore */ }
    return { ok: false, reason: "internal_error" };
  }
}

export async function addToTreasury(
  envOrNull: EnvLike | null,
  doNs: DurableObjectNamespace,
  chatId: string | number,
  from: string,
  amount: number,
  event?: string,
  name = "coins"
): Promise<TransferResult> {
  return await transfer(envOrNull, doNs, chatId, from, TREASURY_KEY, amount, false, name);
}

export async function takeFromTreasury(
  envOrNull: EnvLike | null,
  doNs: DurableObjectNamespace,
  chatId: string | number,
  to: string,
  amount: number,
  event?: string,
  allowNegativeTreasury = false,
  name = "coins"
): Promise<TransferResult> {
  return await transfer(envOrNull, doNs, chatId, TREASURY_KEY, to, amount, allowNegativeTreasury, name);
}


export async function getTreasury(doNs: DurableObjectNamespace, chatId: string | number, name = "coins"): Promise<number> {
  return await getBalance(doNs, chatId, TREASURY_KEY, name);
}

/**
 * sumAllUserBalances —— 仅统计本群（chatId 前缀）内的用户账户余额。
 */
export async function sumAllUserBalances(doNs: DurableObjectNamespace, chatId: string | number, name = "coins"): Promise<number> {
  let total = 0;
  const prefix = `${chatId}:`;
  const scopedTreasury = `${chatId}:${TREASURY_KEY}`;
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
      const json = await res.json().catch(() => ({ keys: [], cursor: "" })) as BalanceListResponse;
      const keys = json.keys || [];
      for (const k of keys) {
        if (typeof k.name !== "string") continue;
        const nameKey = k.name;
        if (nameKey === scopedTreasury) continue;
        if (nameKey.includes("||")) continue;
        if (!nameKey.startsWith(prefix)) continue;
        const rawId = nameKey.slice(prefix.length);
        if (/^\d+$/.test(rawId)) {
          const bal = await getBalance(doNs, chatId, rawId, name);
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

export default {
  TREASURY_KEY,
  getBalance,
  transfer,
  addToTreasury,
  takeFromTreasury,
   getTreasury,
  sumAllUserBalances,
 };
