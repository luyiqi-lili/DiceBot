// lib/doAdapter.ts
/**
 * createDOAdapter - 返回一个“KV-like”对象，内部通过 Durable Object Stub 的 fetch 与 DO 通信。
 *
 * 新增：atomicAdd / atomicDeduct / atomicDeductAllowNegative / transfer
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
    },

    /* ------------------ 原子操作接口 ------------------ */
    // atomicAdd: 在 DO 内对 key 原子 +delta，返回 { balance: number }
    async atomicAdd(key: string, delta: number, event?: string): Promise<{ balance: number }> {
      const url = `${base}/atomic`;
      const res = await stub.fetch(url, {
        method: "POST",
        body: JSON.stringify({ op: "add", key, delta, event }),
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("atomicAdd failed");
      return await res.json();
    },

    // atomicDeduct: 在 DO 内尝试原子扣款（检查余额），返回 { ok: boolean, balance: number, reason?: string }
    async atomicDeduct(key: string, amount: number, event?: string): Promise<{ ok: boolean; balance: number; reason?: string }> {
      const url = `${base}/atomic`;
      const res = await stub.fetch(url, {
        method: "POST",
        body: JSON.stringify({ op: "deduct", key, amount, event }),
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("atomicDeduct failed");
      return await res.json();
    },

    // atomicDeductAllowNegative: 在 DO 内扣款（允许负数），返回 { balance: number }
    async atomicDeductAllowNegative(key: string, amount: number, event?: string): Promise<{ balance: number }> {
      const url = `${base}/atomic`;
      const res = await stub.fetch(url, {
        method: "POST",
        body: JSON.stringify({ op: "deductAllowNegative", key, amount, event }),
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("atomicDeductAllowNegative failed");
      return await res.json();
    },

    // transfer: 在 DO 内执行原子转账（含手续费入宝库），返回 { ok, fee, fromNew, toNew }
    async transfer(from: string, to: string, amount: number): Promise<{ ok: boolean; fee?: number; fromNew?: number; toNew?: number; reason?: string }> {
      const url = `${base}/transfer`;
      const res = await stub.fetch(url, {
        method: "POST",
        body: JSON.stringify({ from, to, amount }),
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("transfer failed");
      return await res.json();
    },
  } as unknown as any; // 保持兼容旧代码（原来强制为 KVNamespace）
}
