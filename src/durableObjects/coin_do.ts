// src/durableObjects/coin_do.ts
import TgMessage, { EnvLike } from "../lib/tgMessage";

/**
 * Durable Object: CoinDO
 * - 提供原子接口：
 *    GET  /get?key=...
 *    POST /transfer  { from, to, amount, allowNegativeTreasury? }
 *    POST /incr      { key, delta }    <-- 新增：原子自增（用于房间计数等）
 *
 * - 其它（/put、/list）保留为调试/迁移用，但业务逻辑应基于上面原子接口。
 */

export class CoinDO {
  state: DurableObjectState;
  env: any;

  static TREASURY_KEY = "__treasury__";

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }

  private async readMap(): Promise<Record<string, string>> {
    const m = (await this.state.storage.get<Record<string, string>>("__MAP__")) || {};
    return m;
  }

  private async writeMap(map: Record<string, string>) {
    await this.state.storage.put("__MAP__", map);
  }

  private async getNumericBalance(map: Record<string, string>, key: string): Promise<number> {
    const raw = map[key];
    if (raw === undefined || raw === null || raw === "") return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  }

  private setNumericBalance(map: Record<string, string>, key: string, value: number) {
    map[key] = String(value);
  }

  private async sendTransLog(amount: number, id: string, event: string) {
    try {
      await TgMessage.sendText(this.env as EnvLike, {
        chat_id: -1002848481881,
        text: `${id}  ${event}\nUID: <code>${id}</code>\n金额: ${amount}`,
        parse_mode: "HTML",
        message_thread_id: 12084
      });
    } catch (e) {
      console.warn("[CoinDO] sendTransLog failed", e);
    }
  }

  private async atomicTransfer(map: Record<string, string>, from: string, to: string, amount: number, allowNegativeTreasury = false) {
    if (!from || !to) {
      return { ok: false, reason: "missing from or to" };
    }
    if (!Number.isFinite(amount) || amount <= 0 || Math.floor(amount) !== amount) {
      return { ok: false, reason: "invalid amount" };
    }

    const fromBal = await this.getNumericBalance(map, from);
    const toBal = await this.getNumericBalance(map, to);

    if (from === to) {
      return { ok: true, fromNew: fromBal, toNew: toBal };
    }
 

    const newFrom = fromBal - amount;
    const newTo = toBal + amount;

    this.setNumericBalance(map, from, newFrom);
    this.setNumericBalance(map, to, newTo);

    this.sendTransLog(amount, `${from} -> ${to}`, `transfer ${amount} (from ${from} to ${to})`);

    return { ok: true, fromNew: newFrom, toNew: newTo };
  }

  // 原子自增端点：POST /incr { key, delta }
  // - delta 可以为正整数（也可以为 0 或负数，但业务层应避免负）
  // - 返回 { ok: true, new: number } 或 { ok:false, reason }
  private async atomicIncr(map: Record<string, string>, key: string, delta: number) {
    if (!key) return { ok: false, reason: "missing key" };
    if (!Number.isFinite(delta) || Math.floor(delta) !== delta) return { ok: false, reason: "invalid delta" };

    const cur = await this.getNumericBalance(map, key);
    const next = cur + delta;
    this.setNumericBalance(map, key, next);

    // 日志（房间计数也记录）
    this.sendTransLog(delta, key, `incr ${delta} (room counter)`);

    return { ok: true, new: next };
  }

  async fetch(req: Request) {
    const url = new URL(req.url);
    const path = url.pathname;

    // GET /get?key=...
    if (path === "/get" && req.method === "GET") {
      const key = url.searchParams.get("key") || "";
      if (!key) return new Response("", { status: 200 });
      const map = await this.readMap();
      const v = map[key];
      return new Response(v ?? "", { status: 200 });
    }

    // POST /transfer
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

      const map = await this.readMap();
      const res = await this.atomicTransfer(map, from, to, amount, allowNegativeTreasury);
      if (!res.ok) {
        return new Response(JSON.stringify(res), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      try {
        await this.writeMap(map);
      } catch (e) {
        console.error("[CoinDO] writeMap failed", e);
        return new Response(JSON.stringify({ ok: false, reason: "persist failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: true, fromNew: res.fromNew, toNew: res.toNew }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // POST /incr  -> 原子自增（新增）
    // body: { key: string, delta: number }
    if (path === "/incr" && req.method === "POST") {
      let data: any = {};
      try {
        data = await req.json();
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, reason: "invalid json" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      const key = String(data.key ?? "");
      const delta = Number(data.delta ?? 0);
      if (!key) {
        return new Response(JSON.stringify({ ok: false, reason: "missing key" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      if (!Number.isFinite(delta) || Math.floor(delta) !== delta) {
        return new Response(JSON.stringify({ ok: false, reason: "invalid delta" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }

      const map = await this.readMap();
      const res = await this.atomicIncr(map, key, delta);
      if (!res.ok) {
        return new Response(JSON.stringify(res), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      try {
        await this.writeMap(map);
      } catch (e) {
        console.error("[CoinDO] writeMap(incr) failed", e);
        return new Response(JSON.stringify({ ok: false, reason: "persist failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: true, new: res.new }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // legacy: put (保持兼容)
    if (path === "/put" && req.method === "POST") {
      const body = await req.text();
      let data: { key?: string; value?: string } = {};
      try { data = JSON.parse(body); } catch (e) { /* ignore */ }
      if (!data.key) return new Response("missing key", { status: 400 });
      const map = await this.readMap();
      map[data.key] = data.value ?? "";
      await this.writeMap(map);
      return new Response("OK", { status: 200 });
    }

    // legacy: list
    if (path === "/list" && req.method === "GET") {
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
      return new Response(JSON.stringify({ keys: page, cursor: nextCursor }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("not found", { status: 404 });
  }
}
