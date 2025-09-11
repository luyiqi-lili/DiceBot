// lib/coinService.ts


import TgMessage, { EnvLike } from "../lib/tgMessage";

/**
 * 扩展 env 类型（至少需要 COIN_KV 和 BOT_USERNAME）
 */
export type CoinEnv = EnvLike & {
  COIN_KV: KVNamespace;
  BOT_USERNAME?: string;
};
const nameMap: Record<string, string> = {
  '__treasury__': "艾莉莎宝库",
  '-1002742074355||62': "紫罗兰教堂的募捐箱",
  '-1002742074355||182': "天狐宫的祈愿箱",
  '-1002848481881||66': "紫罗兰教堂的募捐箱(测试)"
};


/* ------------------------- 全局配置（统一在顶部） ------------------------- */
// 艾丽莎宝库键
export const TREASURY_KEY = "__treasury__";

/** 日志，user 因为 变动 amout coin */
async function SendTransLog(env: EnvLike, amount: number, id: string, event: String): Promise<boolean> {

  let uname
  console.log(`ID: ${id} `);
  console.log(`INT_ID: ${Number(id)} `);
  if (!isNaN(Number(id))) {
    uname = (await TgMessage.fetchChatMember(env, -1002742074355, parseInt(id, 10))).first_name
    if (!isNaN(Number(uname))) {
      uname = (await TgMessage.fetchChatMember(env, -1002848481881, parseInt(id, 10))).first_name
    }


    console.log(`uname: ${uname} `);

  } else {
    uname = nameMap[id] ?? id;
  }


  await TgMessage.sendText(env, {
    chat_id: -1002848481881,
    text: `UID:<code>${id}</code>  ${uname} 因为  ${event}  ${amount}`,
    parse_mode: "HTML",
    message_thread_id: 12084
  });


  return false;
}
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
async function setBalance(kv: KVNamespace, id: string, bal: number): Promise<void> {
  try {
    await kv.put(id, String(bal));
  } catch (e) {
    console.error("[coin] setBalance KV 写入失败", e);
  }
}

/** 增加账户余额，返回新余额 */
export async function addToBalance(env: EnvLike, kv: KVNamespace, id: string, delta: number, event: String): Promise<number> {
  const cur = await getBalance(kv, id);
  const next = cur + delta;
  await SendTransLog(env, delta, id, `${event} 增加`);
  await setBalance(kv, id, next);
  return next;
}

/** 从账户扣款，若余额不足返回 false，否则扣款并返回 true */
export async function deductFromBalance(env: EnvLike, kv: KVNamespace, id: string, amount: number, event: String): Promise<boolean> {
  const cur = await getBalance(kv, id);
  if (cur < amount) return false;
  await SendTransLog(env, amount, id, `${event} 扣减`);
  await setBalance(kv, id, cur - amount);
  return true;
}

/** 从账户扣款，若余额不足返回 false，否则扣款并返回 true */
export async function deductFromBalanceAllowNegative(env: EnvLike, kv: KVNamespace, id: string, amount: number, event: String): Promise<boolean> {
  const cur = await getBalance(kv, id);
  await SendTransLog(env, amount, id, `${event} 扣减`);
  await setBalance(kv, id, cur - amount);
  return true;
}


/* 艾丽莎宝库相关操作 */
export async function getTreasury(kv: KVNamespace): Promise<number> {
  return await getBalance(kv, TREASURY_KEY);
}
export async function addToTreasury(env: EnvLike, kv: KVNamespace, amount: number, event: String): Promise<number> {

  return await addToBalance(env, kv, TREASURY_KEY, amount, event);
}
export async function takeFromTreasury(env: EnvLike, kv: KVNamespace, amount: number, event: String): Promise<boolean> {

  return await deductFromBalance(env, kv, TREASURY_KEY, amount, event);
}
/**
 * 从国库支付（允许出现负值）
 * - 返回新的国库余额（可能小于0）
 */
export async function payoutFromTreasuryAllowNegative(env: EnvLike, kv: KVNamespace, amount: number, event: String): Promise<boolean> {

  return await deductFromBalanceAllowNegative(env, kv, TREASURY_KEY, amount, event);

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
