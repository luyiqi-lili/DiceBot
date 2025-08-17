type Env = {
  CONFIG_KV: KVNamespace;
};

export async function GetliveConfig(msg: any, env: Env): Promise<Record<string, any> | null> {
  const key = msg?.key ?? "default-config";
  // 直接让 KV 返回 json 并做泛型断言
  const cfg = await env.CONFIG_KV.get<Record<string, any>>(key, "json");
  return cfg ?? null;
}
