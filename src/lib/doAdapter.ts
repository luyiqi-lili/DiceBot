// lib/doAdapter.ts
/**
 * createDOAdapter - 返回一个“KV-like”对象，内部通过 Durable Object Stub 的 fetch 与 DO 通信。
 *
 * 用法示例：
 *   const kvLike = createDOAdapter(env, env.COIN_DO, "coins"); // env.COIN_DO 为 DO namespace binding
 *   await getBalance(kvLike, id); // 不需要改 coinService 代码
 */
export function createDOAdapter(env: any, doNamespace: DurableObjectNamespace, name = "coins") {
  if (!doNamespace) throw new Error("Durable Object namespace binding required");

  const id = doNamespace.idFromName(name);
  const stub = doNamespace.get(id);

  const base = "https://do"; // 远端 URL 主机对 stub.fetch 无实际依赖，只要是合法 url

  return {
    // get 返回字符串或 null（与 KVNamespace.get 的行为类似）
    async get(key: string): Promise<string | null> {
      const url = `${base}/get?key=${encodeURIComponent(key)}`;
      const res = await stub.fetch(url, { method: "GET" });
      if (!res.ok) return null;
      const text = await res.text();
      // KVNamespace.get 返回 null 而不是 '', 但你的现有代码把 raw ? parseInt(raw) 处理了；
      // 我这里返回 '' -> 当 raw falsy 则 coinService 的 getBalance 仍会判定为 0。
      return text === "" ? null : text;
    },

    // put(key, value)
    async put(key: string, value: string): Promise<void> {
      const url = `${base}/put`;
      await stub.fetch(url, {
        method: "POST",
        body: JSON.stringify({ key, value }),
        headers: { "Content-Type": "application/json" },
      });
    },

    // list(opts) -> 返回 { keys: [{ name }], cursor }
    async list(opts?: { cursor?: string; limit?: number }): Promise<{ keys: Array<{ name: string }>; cursor: string }> {
      const qs = new URLSearchParams();
      if (opts?.cursor) qs.set("cursor", opts.cursor);
      if (opts?.limit) qs.set("limit", String(opts.limit ?? 1000));
      const url = `${base}/list?${qs.toString()}`;
      const res = await stub.fetch(url, { method: "GET" });
      if (!res.ok) return { keys: [], cursor: "" };
      const json = await res.json();
      return json;
    }
  } as unknown as KVNamespace; // 强制断言为 KVNamespace 以方便现有代码传入
}
