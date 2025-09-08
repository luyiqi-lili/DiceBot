// lib/coinService.ts
import { EnvLike } from "../lib/tgMessage";

/**
 * 扩展 env 类型（至少需要 COIN_KV 和 BOT_USERNAME）
 */
export type CoinEnv = EnvLike & {
  COIN_KV: KVNamespace;
  BOT_USERNAME?: string;
};

/* ------------------------- 全局配置（统一在顶部） ------------------------- */
// 艾丽莎宝库键
export const TREASURY_KEY = "__treasury__";

/** 读取余额（KV） */
export async function getBalance(kv: KVNamespace, id: string): Promise<number> {
  try {
    const raw = await kv.get(id);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch (e) {
    console.warn("[coin] getBalance KV 读取失败", e);
    return 0;
  }
}

/** 写入余额（KV） */
export async function setBalance(kv: KVNamespace, id: string, bal: number): Promise<void> {
  try {
    await kv.put(id, String(bal));
  } catch (e) {
    console.error("[coin] setBalance KV 写入失败", e);
  }
}

/** 增加账户余额，返回新余额 */
export async function addToBalance(kv: KVNamespace, id: string, delta: number): Promise<number> {
  const cur = await getBalance(kv, id);
  const next = cur + delta;
  await setBalance(kv, id, next);
  return next;
}

/** 从账户扣款，若余额不足返回 false，否则扣款并返回 true */
export async function deductFromBalance(kv: KVNamespace, id: string, amount: number): Promise<boolean> {
  const cur = await getBalance(kv, id);
  if (cur < amount) return false;
  await setBalance(kv, id, cur - amount);
  return true;
}

/* 艾丽莎宝库相关操作 */
export async function getTreasury(kv: KVNamespace): Promise<number> {
  return await getBalance(kv, TREASURY_KEY);
}
export async function addToTreasury(kv: KVNamespace, amount: number): Promise<number> {
  return await addToBalance(kv, TREASURY_KEY, amount);
}
export async function takeFromTreasury(kv: KVNamespace, amount: number): Promise<boolean> {
  return await deductFromBalance(kv, TREASURY_KEY, amount);
}
/**
 * 从国库支付（允许出现负值）
 * - 返回新的国库余额（可能小于0）
 */
export async function payoutFromTreasuryAllowNegative(kv: KVNamespace, amount: number): Promise<number> {
  const curRaw = await kv.get(TREASURY_KEY);
  const cur = curRaw ? parseInt(curRaw, 10) || 0 : 0;
  const next = cur - amount;
  await kv.put(TREASURY_KEY, String(next));
  return next;
}

/** 计算所有“用户”余额合计（把“纯数字”键视为用户账户，排除含 '||' 的房间键和艾丽莎宝库键） */
export async function sumAllUserBalances(kv: KVNamespace): Promise<number> {
  let total = 0;
  let cursor: string | undefined = undefined;
  do {
    const opts: any = cursor ? { cursor } : {};
    const res = await (kv as any).list(opts);
    cursor = res.cursor;
    for (const k of (res.keys || [])) {
      const name: string = k.name;
      if (name === TREASURY_KEY) continue;
      if (name.includes("||")) continue;
      if (/^\d+$/.test(name)) {
        const v = await getBalance(kv, name);
        total += v;
      }
    }
  } while (cursor);
  return total;
}
