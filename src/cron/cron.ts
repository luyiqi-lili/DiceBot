// cron/cron.ts
/*
  每日定时执行：查询艾丽莎宝库与所有用户余额合计，并发送到指定的群组 topic
  - 可以作为独立 Worker 的入口（导出 default.scheduled）
  - 也可以在你的现有 index.ts 中 import { runCoinCheck } from './cron/cron' 并在 scheduled 中调用

*/

import TgMessage, { EnvLike } from "../lib/tgMessage";
import { getTreasury,sumAllUserBalances } from "../lib/coinService";
 
// 扩展 env 类型
type CronEnv = EnvLike & {
   BOT_USERNAME?: string;
   COIN_DO:DurableObjectNamespace
   TOKEN: string;
};

// 简单 logger
function log(...args: any[]) {
  console.log("🔔 [cron/coinCheck]", ...args);
}
 
/**
 * 执行一次 coin check，并把结果发送到指定 chat/thread
 * 默认目标：chat_id = -1002848481881, message_thread_id = 66
 */
export async function runCoinCheck(env: CronEnv, opts?: { chat_id?: number; message_thread_id?: number }) {
  const chatId = opts?.chat_id ?? -1002848481881;
  const threadId = opts?.message_thread_id ?? 8346;
 
  log("开始执行 coin check", { chatId, threadId });

  try {
    const treasuryBal = await getTreasury( env.COIN_DO);
    const totalUserBal = await sumAllUserBalances(env.COIN_DO);

    const text =
      `🏦 艾丽莎宝库：${treasuryBal} 💰。\n` +
      `👥 所有用户账户余额合计：${totalUserBal} 💰。\n` +
      `🔢 总计（宝库 + 用户）：${treasuryBal + totalUserBal} 💰。`;

    log("查询结果", { treasuryBal, totalUserBal });

    // 发送到群组 topic
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      message_thread_id: threadId
    });

    log("发送完成");
    return { ok: true, treasuryBal, totalUserBal };
  } catch (e) {
    log("runCoinCheck 异常", e);
    try {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ coin check 失败：${String(e)}`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
    } catch (e2) {
      log("发送失败通知也失败", e2);
    }
    return { ok: false, error: e };
  }
}

// 兼容 Cloudflare Worker 的 scheduled 入口：如果把本文件作为 Worker 的入口部署，则会被 Cron Trigger 调用
export default {
  async scheduled(controller: ScheduledController, env: CronEnv, ctx: ExecutionContext) {
    ctx.waitUntil(runCoinCheck(env));
  }
};
