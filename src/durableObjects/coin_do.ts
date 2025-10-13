// src/durableObjects/coin_do.ts
import TgMessage, { EnvLike } from "../lib/tgMessage";

/**
 * Durable Object: CoinDO
 *
 * 目的：
 *  - 提供两个原子操作：GET /get 和 POST /transfer
 *  - 所有涉及余额变更的业务逻辑应基于这两个原子操作组合实现
 *
 * 注意：
 *  - 要求所有账户键都路由到同一个 DO 实例（例如使用 doNamespace.idFromName("coins")）。
 *  - transfer 在本 DO 实例内是原子的（读->校验->写 在单线程处理流程中顺序执行）。
 */

export class CoinDO {
  state: DurableObjectState;
  env: any;

  // 特殊键：艾莉莎宝库
  static TREASURY_KEY = "__treasury__";

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }

  // internal: read the whole map (string->string)
  private async readMap(): Promise<Record<string, string>> {
    const m = (await this.state.storage.get<Record<string, string>>("__MAP__")) || {};
    return m;
  }

  private async writeMap(map: Record<string, string>) {
    await this.state.storage.put("__MAP__", map);
  }

  // helper: numeric balance (always return number)
  private async getNumericBalance(map: Record<string, string>, key: string): Promise<number> {
    const raw = map[key];
    if (raw === undefined || raw === null || raw === "") return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  }

  // helper: set numeric balance in map
  private setNumericBalance(map: Record<string, string>, key: string, value: number) {
    map[key] = String(value);
  }
 
  // Primary atomic transfer implementation:
  // Attempts to move `amount` (positive integer) from `from` -> `to`.
  // - if amount <= 0 -> reject
  // - normal accounts: require fromBalance >= amount
  // - if from === TREASURY_KEY and allowNegativeTreasury === true -> allow treasury to go negative
  // Returns { ok: boolean, reason?: string, fromNew?: number, toNew?: number }
  private async atomicTransfer(map: Record<string, string>, from: string, to: string, amount: number, allowNegativeTreasury = false) {
    if (!from || !to) {
      return { ok: false, reason: "missing from or to" };
    }
    if (!Number.isFinite(amount) || amount <= 0 || Math.floor(amount) !== amount) {
      return { ok: false, reason: "invalid amount" };
    }

    const fromBal = await this.getNumericBalance(map, from);
    const toBal = await this.getNumericBalance(map, to);

    // same-account transfer is a noop but return current balances
    if (from === to) {
      return { ok: true, fromNew: fromBal, toNew: toBal };
    }

    // Treasury allow negative special-case
    if (from === CoinDO.TREASURY_KEY && allowNegativeTreasury) {
      // allow treasury to go negative
    } else {
      if (fromBal < amount) {
        return { ok: false, reason: "insufficient" };
      }
    }

    const newFrom = fromBal - amount;
    const newTo = toBal + amount;

    this.setNumericBalance(map, from, newFrom);
    this.setNumericBalance(map, to, newTo);

    // write map is done by caller (atomic at DO level because we write after modifications)
    // log asynchronously (fire-and-forget)
 
    return { ok: true, fromNew: newFrom, toNew: newTo };
  }

  // fetch handler: expose GET /get and POST /transfer
  async fetch(req: Request) {
    const url = new URL(req.url);
    const path = url.pathname;

    // GET /get?key=xxx
    if (path === "/get" && req.method === "GET") {
      const key = url.searchParams.get("key") || "";
      if (!key) return new Response("", { status: 200 });

      const map = await this.readMap();
      const v = map[key];
      // 返回 string（保持兼容：空返回空字符串）
      return new Response(v ?? "", { status: 200 });
    }

    // POST /transfer
    // body: { from: string, to: string, amount: number, allowNegativeTreasury?: boolean }
    if (path === "/transfer" && req.method === "POST") {
      let data: any = {};
      try {
        data = await req.json();
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, reason: "invalid json" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }

      const from = String(data.from ?? "");
      const to = String(data.to ?? "");
      const amount = Number(data.amount);
      const allowNegativeTreasury = Boolean(data.allowNegativeTreasury ?? false);

      if (!from || !to) {
        return new Response(JSON.stringify({ ok: false, reason: "missing from or to" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        return new Response(JSON.stringify({ ok: false, reason: "invalid amount" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }

      // Read-modify-write inside DO -> atomic relative to this DO instance
      const map = await this.readMap();
      const res = await this.atomicTransfer(map, from, to, amount, allowNegativeTreasury);
      if (!res.ok) {
        return new Response(JSON.stringify(res), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      // Persist the modified map atomically
      try {
        await this.writeMap(map);
      } catch (e) {
        console.error("[CoinDO] writeMap failed", e);
        // If persist failed, we should revert in-memory? but since we haven't returned, it's safer to report failure.
        return new Response(JSON.stringify({ ok: false, reason: "persist failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ ok: true, fromNew: res.fromNew, toNew: res.toNew }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // Optional: 为方便迁移/调试保留 list/put 接口（但建议业务仅使用 GET/TRANSFER）
    if (path === "/put" && req.method === "POST") {
      // legacy helper: { key, value }
      let data: any = {};
      try { data = await req.json(); } catch (e) { /* ignore */ }
      if (!data.key) return new Response("missing key", { status: 400 });
      const map = await this.readMap();
      map[data.key] = data.value ?? "";
      await this.writeMap(map);
      return new Response("OK", { status: 200 });
    }

    if (path === "/list" && req.method === "GET") {
      // 简单分页实现：cursor=lastKey, limit
      const cursor = url.searchParams.get("cursor") || "";
      const limit = parseInt(url.searchParams.get("limit") || "1000", 10);
      const map = await this.readMap();
      const keys = Object.keys(map).sort();
      let start = 0;
      if (cursor) {
        const idx = keys.indexOf(cursor);
        start = idx >= 0 ? idx + 1 : 0;
      }
      const page = keys.slice(start, start + limit).map((k) => ({ name: k }));
      const nextCursor = (start + page.length) < keys.length ? page[page.length - 1].name : "";
      return new Response(JSON.stringify({ keys: page, cursor: nextCursor }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    return new Response("not found", { status: 404 });
  }
}
