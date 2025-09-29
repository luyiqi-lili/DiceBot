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

    // fallback: not found
    return new Response("not found", { status: 404 });
  }
}
