// src/durableObjects/coin_do.ts
import TgMessage, { EnvLike } from "../lib/tgMessage";

/**
 * Durable Object: CoinDO (修正版)
 * - 原子接口：
 *    GET  /get?key=...
 *    POST /transfer  { from, to, amount, allowNegativeTreasury? }
 *    POST /incr      { key, delta }    <-- 原子自增（用于房间计数等）
 *
 * - 改进：incr 前后会额外发送单独的 TG 日志消息，打印 key 与对应的值，便于排查并发/一致性问题。
 */

export class CoinDO {
  state: DurableObjectState;
  env: any;

  static TREASURY_KEY = "__treasury__";

  private nameMap: Record<string, string> = {
    '__treasury__': "艾莉莎宝库",
    '-1002742074355||62': "紫罗兰教堂的募捐箱",
    '-1002742074355||182': "天狐宫的祈愿箱",
    '-1002848481881||66': "紫罗兰教堂的募捐箱(测试)"
  };

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

  /**
   * 解析 key -> 可读名称（优先 numeric fetch -> nameMap -> 原始 key）
   */
  private async resolveDisplayName(key: string): Promise<string> {
    if (!key) return key;
    if (/^\d+$/.test(key)) {
      try {
        const numericId = parseInt(key, 10);
        const chatIdForLookup = -1002742074355;
        const member = await TgMessage.fetchChatMember(this.env as EnvLike, chatIdForLookup, numericId);
        const name = member?.first_name || member?.username;
        if (name && !/^\d+$/.test(String(name))) return String(name);
      } catch (e) {
        // ignore
      }
    }
    if (this.nameMap[key]) return this.nameMap[key];
    return key;
  }

  /**
   * 结构化转账日志
   */
  private async sendTransLogTransfer(
    fromKey: string,
    toKey: string,
    amount: number,
    preFrom: number,
    preTo: number,
    newFrom: number,
    newTo: number
  ) {
    try {
      const fromName = await this.resolveDisplayName(fromKey);
      const toName = await this.resolveDisplayName(toKey);
      const text =
        `${fromName} (${fromKey}) -> ${toName} (${toKey})\n` +
        `transfer amount=${amount}\n` +
        `before: ${fromName}=${preFrom}, ${toName}=${preTo}\n` +
        `after:  ${fromName}=${newFrom}, ${toName}=${newTo}`;
      await TgMessage.sendText(this.env as EnvLike, {
        chat_id: -1002970430696,
        text,
        parse_mode: "HTML",
        message_thread_id: 413483
      });
    } catch (e) {
      console.warn("[CoinDO] sendTransLogTransfer failed", e);
    }
  }

  /**
   * 单键 incr 日志（before/delta/after）
   */
  private async sendTransLogIncr(key: string, delta: number, before: number, after: number) {
    try {
      const name = await this.resolveDisplayName(key);
      const text = `${name} (${key})\n` + `incr (before=${before} delta=${delta} after=${after})`;
      await TgMessage.sendText(this.env as EnvLike, {
        chat_id: -1002848481881,
        text,
        parse_mode: "HTML",
        message_thread_id: 12084
      });
    } catch (e) {
      console.warn("[CoinDO] sendTransLogIncr failed", e);
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

    // 结构化日志
    this.sendTransLogTransfer(from, to, amount, fromBal, toBal, newFrom, newTo);

    return { ok: true, fromNew: newFrom, toNew: newTo };
  }

  private async atomicIncr(map: Record<string, string>, key: string, delta: number) {
    if (!key) return { ok: false, reason: "missing key" };
    if (!Number.isFinite(delta) || Math.floor(delta) !== delta) return { ok: false, reason: "invalid delta" };

    const cur = await this.getNumericBalance(map, key);
    const next = cur + delta;
    this.setNumericBalance(map, key, next);

    // 使用更清晰日志（内部）
    this.sendTransLogIncr(key, delta, cur, next);

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

      // 读取当前 map（在 DO 内，读写合并保证原子性）
      const map = await this.readMap();

      // === 额外日志：在 incr 前发送单独的 TG 消息，打印 key 与当前值 ===
      try {
        const beforeVal = await this.getNumericBalance(map, key);
        const disp = await this.resolveDisplayName(key);
        const preText = `INCR START: ${disp} (${key}) current=${beforeVal}`;
        await TgMessage.sendText(this.env as EnvLike, {
          chat_id: -1002848481881,
          text: preText,
          parse_mode: "HTML",
          message_thread_id: 12084
        });
      } catch (e) {
        console.warn("[CoinDO] pre-incr log failed", e);
      }

      // 执行原子自增（在同一 map 上）
      const res = await this.atomicIncr(map, key, delta);
      if (!res.ok) {
        return new Response(JSON.stringify(res), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      // 持久化
      try {
        await this.writeMap(map);
      } catch (e) {
        console.error("[CoinDO] writeMap(incr) failed", e);
        return new Response(JSON.stringify({ ok: false, reason: "persist failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
      }

      // === 额外日志：在 incr 后发送单独的 TG 消息，打印 key 与新值 ===
      try {
        const newVal = res.new;
        const disp2 = await this.resolveDisplayName(key);
        const postText = `INCR END: ${disp2} (${key}) new=${newVal}`;
        await TgMessage.sendText(this.env as EnvLike, {
          chat_id: -1002848481881,
          text: postText,
          parse_mode: "HTML",
          message_thread_id: 12084
        });
      } catch (e) {
        console.warn("[CoinDO] post-incr log failed", e);
      }

      // 原有内部日志也会发送（sendTransLogIncr）
      return new Response(JSON.stringify({ ok: true, new: res.new }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // legacy: put
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
