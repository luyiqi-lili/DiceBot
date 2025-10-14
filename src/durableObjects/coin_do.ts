// src/durableObjects/coin_do.ts
import TgMessage, { EnvLike } from "../lib/tgMessage";

/**
 * Durable Object: CoinDO
 * - 提供原子接口：
 *    GET  /get?key=...
 *    POST /transfer  { from, to, amount, allowNegativeTreasury? }
 *    POST /incr      { key, delta }    <-- 原子自增（用于房间计数等）
 *
 * - 其它（/put、/list）保留为调试/迁移用，但业务逻辑应基于上面原子接口。
 */

export class CoinDO {
  state: DurableObjectState;
  env: any;

  static TREASURY_KEY = "__treasury__";

  // 可显示化的一些名称映射（房间/特殊键）
  // 如果需要可以在这里扩充或把映射放到 env
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
   * 尝试把 key 解析为更可读的名字（优先：纯数字 -> fetchChatMember；其次 nameMap；最后原始 key）
   * 注意：fetchChatMember 需要一个 chatId 作为上下文；这里沿用你项目里常用的管理群 -1002742074355。
   * 若需要其它逻辑（或把 chatId 作为 env 配置），可以再调整。
   */
  private async resolveDisplayName(key: string): Promise<string> {
    // exact numeric user id
    if (/^\d+$/.test(key)) {
      try {
        // 尝试在一个已知群里查 member 名（注意这个群 id 可按需调整到你常用的群）
        const numericId = parseInt(key, 10);
        const chatIdForLookup = -1002742074355; // 这里沿用原项目中常见的群 id，如需改请替换
        const member = await TgMessage.fetchChatMember(this.env as EnvLike, chatIdForLookup, numericId);
        const name = member?.first_name || member?.username || (`用户${key}`);
        // 若返回的名字仍然像数字（极小概率），回退到 key
        if (name && !/^\d+$/.test(String(name))) return String(name);
      } catch (e) {
        // 忽略 fetch 错误（可能该 userid 不在群内或接口权限问题）
      }
    }

    // 非数字或 fetch 失败 -> 检查 nameMap
    if (this.nameMap[key]) return this.nameMap[key];

    // 最后回退到原始 key
    return key;
  }

  /**
   * 发送审计日志（非阻塞）：把 human-friendly id/name 与事件写入管理频道
   * amount 表示此次变动的主要数值（例如 incr 的 delta，或 transfer 的 amount）
   */
  private async sendTransLog(amount: number, idKey: string, event: string) {
    try {
      const disp = await this.resolveDisplayName(idKey);
      await TgMessage.sendText(this.env as EnvLike, {
        chat_id: -1002848481881,
        text: `${disp} (${idKey})\n${event}\n变动量: ${amount}`,
        parse_mode: "HTML",
        message_thread_id: 12084
      });
    } catch (e) {
      // 日志失败不应中断主流程
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

    // 记录日志（fire-and-forget）
    this.sendTransLog(amount, `${from}->${to}`, `transfer: ${from} (${fromBal}) -> ${to} (${toBal}), amount=${amount}, result: ${newFrom} -> ${newTo}`);

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

    // 日志（房间计数也记录），把增前/增量/增后值都写清楚
    this.sendTransLog(delta, key, `incr (before=${cur} delta=${delta} after=${next})`);

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
