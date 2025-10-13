// src/durableObjects/coin_do.ts
export class CoinDO {
  state: DurableObjectState;
  env: any;
  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }

  // helper: read the whole map object
  private async readMap(): Promise<Record<string, string>> {
    const m = (await this.state.storage.get<Record<string, string>>("__MAP__")) || {};
    return m;
  }

  private async writeMap(map: Record<string, string>) {
    await this.state.storage.put("__MAP__", map);
  }

  // fee rate logic（与外层保持一致）
  private calcTransferFeeRate(targetBal: number): number {
    if (targetBal < 100) return 0;
    if (targetBal < 300) return 0.1;
    if (targetBal < 500) return 0.3;
    if (targetBal < 700) return 0.5;
    if (targetBal < 900) return 0.7;
    return 0.9;
  }

  async fetch(req: Request) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/get") {
      const key = url.searchParams.get("key") || "";
      if (!key) return new Response("", { status: 200 });
      const map = await this.readMap();
      const v = map[key];
      return new Response(v ?? "", { status: 200 });
    }

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

    if (path === "/list") {
      const cursor = url.searchParams.get("cursor") || "";
      const limit = parseInt(url.searchParams.get("limit") || "1000", 10);
      const map = await this.readMap();
      const keys = Object.keys(map).sort(); // stable order
      let start = 0;
      if (cursor) {
        // cursor is the last key returned previously; start after it
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

    /* ------------------ 原子操作接口 ------------------ */
    if (path === "/atomic" && req.method === "POST") {
      const body = await req.text();
      let data: any = {};
      try { data = JSON.parse(body); } catch (e) { /* ignore */ }
      const op = data.op;
      const map = await this.readMap();

      if (op === "add") {
        const key: string = String(data.key ?? "");
        const delta: number = Number(data.delta ?? 0);
        if (!key) return new Response(JSON.stringify({ error: "missing key" }), { status: 400 });
        const cur = parseInt(map[key] ?? "0", 10) || 0;
        const next = cur + delta;
        map[key] = String(next);
        await this.writeMap(map);
        return new Response(JSON.stringify({ balance: next }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      if (op === "deduct") {
        const key: string = String(data.key ?? "");
        const amount: number = Number(data.amount ?? 0);
        if (!key) return new Response(JSON.stringify({ error: "missing key" }), { status: 400 });
        const cur = parseInt(map[key] ?? "0", 10) || 0;
        if (cur < amount) {
          return new Response(JSON.stringify({ ok: false, balance: cur, reason: "insufficient" }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        const next = cur - amount;
        map[key] = String(next);
        await this.writeMap(map);
        return new Response(JSON.stringify({ ok: true, balance: next }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      if (op === "deductAllowNegative") {
        const key: string = String(data.key ?? "");
        const amount: number = Number(data.amount ?? 0);
        if (!key) return new Response(JSON.stringify({ error: "missing key" }), { status: 400 });
        const cur = parseInt(map[key] ?? "0", 10) || 0;
        const next = cur - amount;
        map[key] = String(next);
        await this.writeMap(map);
        return new Response(JSON.stringify({ balance: next }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ error: "unknown op" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    // transfer: 在 DO 内执行原子转账（含手续费入宝库）
    if (path === "/transfer" && req.method === "POST") {
      const body = await req.text();
      let data: any = {};
      try { data = JSON.parse(body); } catch (e) { /* ignore */ }
      const from: string = String(data.from ?? "");
      const to: string = String(data.to ?? "");
      const amount: number = Number(data.amount ?? 0);

      if (!from || !to || isNaN(amount) || amount <= 0) {
        return new Response(JSON.stringify({ ok: false, reason: "invalid params" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }

      const map = await this.readMap();
      const fromCur = parseInt(map[from] ?? "0", 10) || 0;
      if (fromCur < amount) {
        return new Response(JSON.stringify({ ok: false, reason: "insufficient", fromBalance: fromCur }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      const toCur = parseInt(map[to] ?? "0", 10) || 0;

      // 费用计算（与外层保持一致）
      const rate = this.calcTransferFeeRate(toCur);
      const fee = Math.floor(amount * rate);

      // 执行变更（全部写回 map）
      map[from] = String(fromCur - amount);
      map[to] = String(toCur + (amount - fee));

      // 手续费写入宝库 __treasury__
      const treKey = "__treasury__";
      const treCur = parseInt(map[treKey] ?? "0", 10) || 0;
      map[treKey] = String(treCur + fee);

      await this.writeMap(map);

      return new Response(JSON.stringify({
        ok: true,
        fee,
        fromNew: Number(map[from]),
        toNew: Number(map[to])
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // fallback: not found
    return new Response("not found", { status: 404 });
  }
}
