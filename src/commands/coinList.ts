/**
 * @file src/commands/coinList.ts
 * @description /coin list 子命令 — 财富榜 + 群组状态 + 最后发言时间
 *   从 coin.ts 中提取以减小主文件体积（1224 → ~700 行）
 */

import TgMessage, { EnvLike } from '../lib/telegram';
import { deleteMarkup, escapeHtml } from "../lib/util";
import { ADMIN_UIDS_CHECK } from "../lib/liveConfig";
import {
  getBalance,
  getTreasury,
  TREASURY_KEY,
  sumAllUserBalances,
} from "../lib/coinService";
import type { Env } from "../index";
type CoinEnv = Env;

export async function handleCoinList(
  sub: string,
  chatId: number,
  threadId: number | undefined,
  userId: string,
  userName: string,
  doNs: DurableObjectNamespace,
  env: CoinEnv,
): Promise<void> {
  const callerNum = Number(userId);
  if (!ADMIN_UIDS_CHECK.includes(callerNum)) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `❌ ${userName}，你没有权限使用 /coin list。`,
      parse_mode: "HTML",
      message_thread_id: threadId,
    });
    return;
  }

  if (sub === "repair") {
    await handleCoinListRepair(chatId, threadId, userId, userName, doNs, env);
    return;
  }
  if (sub === "confirm") {
    await handleCoinListConfirm(chatId, threadId, userId, userName, doNs, env);
    return;
  }

  // ══════ 原始 list 逻辑 ══════
  const TARGET_CHAT_ID = -1002970430696;

  try {
    const id = doNs.idFromName("coins");
    const stub = doNs.get(id);

    let allBalances: Record<string, number> = {};
    let prayRecords: Record<string, string> = {};
    let cursor = "";

    while (true) {
      const res = await stub.fetch(`https://do/list?limit=1000&cursor=${encodeURIComponent(cursor)}`);
      const data = await res.json() as { keys?: { name: string }[]; cursor?: string };
      const keys: { name: string }[] = data.keys || [];
      cursor = data.cursor || "";

      for (const { name } of keys) {
        if (name.includes("||") || name === TREASURY_KEY) continue;
        if (name.startsWith("coin_pray:")) {
          const prayUserId = name.replace("coin_pray:", "");
          const prayDate = await doGetRawFromStub(stub, name);
          if (prayDate) prayRecords[prayUserId] = prayDate;
          continue;
        }
        const bal = await getBalance(doNs, name);
        if (bal === 0) continue;
        allBalances[name] = bal;
      }
      if (!cursor) break;
    }

    const top = Object.entries(allBalances)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 200);

    if (top.length === 0) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: "📭 暂无余额记录。",
        parse_mode: "HTML",
        reply_markup: deleteMarkup,
        message_thread_id: threadId,
      });
      return;
    }

    const pageSize = 50;
    const totalPages = Math.ceil(top.length / pageSize);

    for (let page = 0; page < totalPages; page++) {
      const startIdx = page * pageSize;
      const endIdx = Math.min(startIdx + pageSize, top.length);
      const pageData = top.slice(startIdx, endIdx);

      const textLines: string[] = [];
      const globalStartIdx = startIdx + 1;

      let userLastActiveTimes: Record<string, string | null> = {};
      try {
        if (env.DB) {
          const userIds = pageData.map(([uid]) => uid).filter(uid => !isNaN(Number(uid)));
          if (userIds.length > 0) {
            const placeholders = userIds.map(() => "?").join(",");
            const query = `SELECT user_id, last_active_at FROM user_last_active WHERE user_id IN (${placeholders})`;
            let stmt = env.DB.prepare(query);
            stmt = stmt.bind(...userIds);
            const result = await stmt.all();
            result.results.forEach((row: any) => {
              userLastActiveTimes[String(row.user_id)] = row.last_active_at;
            });
          }
        }
      } catch (e) {
        console.error("[coin] 批量查询最后发言时间失败:", e);
        if (env.DB) {
          for (const [uid] of pageData) {
            if (isNaN(Number(uid))) continue;
            try {
              const result = await env.DB.prepare(
                "SELECT last_active_at FROM user_last_active WHERE user_id = ?",
              ).bind(uid).first();
              if (result) {
                userLastActiveTimes[uid] = (result as any).last_active_at;
              }
            } catch (singleError) {
              console.error(`[coin] 查询用户 ${uid} 最后发言时间失败:`, singleError);
            }
          }
        }
      }

      const memberChecks = await Promise.all(
        pageData.map(async ([uid, bal], idx) => {
          const globalIdx = globalStartIdx + idx;
          let inTargetGroup = false;
          let userDisplayName = `用户${uid}`;
          let lastActiveTime = userLastActiveTimes[uid] || null;

          if (!isNaN(Number(uid))) {
            try {
              const member = await TgMessage.fetchChatMember(env, chatId, Number(uid));
              userDisplayName = member.first_name || userDisplayName;
              inTargetGroup = await TgMessage.isUserInChat(env, TARGET_CHAT_ID, Number(uid));
            } catch (e) {
              console.log(`[coin] 获取用户 ${uid} 信息失败:`, (e as Error).message);
            }
          }

          let lastActiveText = "从未发言";
          if (lastActiveTime) {
            try {
              const diffMs = Date.now() - new Date(lastActiveTime).getTime();
              const diffMins = Math.floor(diffMs / 60000);
              const diffHours = Math.floor(diffMs / 3600000);
              const diffDays = Math.floor(diffMs / 86400000);
              if (diffMins < 1) lastActiveText = "刚刚";
              else if (diffMins < 60) lastActiveText = `${diffMins}分钟前`;
              else if (diffHours < 24) lastActiveText = `${diffHours}小时前`;
              else if (diffDays < 7) lastActiveText = `${diffDays}天前`;
              else lastActiveText = new Date(lastActiveTime).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
            } catch {
              lastActiveText = "时间未知";
            }
          }

          return { uid, bal, globalIdx, userDisplayName, inTargetGroup, prayDate: prayRecords[uid], lastActiveText };
        }),
      );

      for (const check of memberChecks) {
        const prayInfo = check.prayDate ? ` | 最后祈祷: ${check.prayDate}` : " | 从未祈祷";
        const groupStatus = check.inTargetGroup ? "✅" : "❌";
        textLines.push(
          `${check.globalIdx}. ${check.userDisplayName} ${check.uid} :${check.bal}💰 ${groupStatus} | 最后发言: ${check.lastActiveText}${prayInfo}`,
        );
      }

      const pageInfo = totalPages > 1 ? `（第 ${page + 1}/${totalPages} 页）` : "";
      const out =
        `🏆 财富榜${pageInfo}\n` +
        `目标群组: ${TARGET_CHAT_ID} 成员检查\n` +
        `✅ = 在群组中 | ❌ = 不在群组中\n` +
        `<blockquote expandable>${textLines.join("\n")}</blockquote>`;

      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: out,
        parse_mode: "HTML",
        reply_markup: deleteMarkup,
        message_thread_id: threadId,
      });

      if (page < totalPages - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  } catch (e) {
    console.error("[coin] /coin list error", e);
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: "❌ 查询失败：无法列出余额，请稍后重试。",
      parse_mode: "HTML",
      reply_markup: deleteMarkup,
      message_thread_id: threadId,
    });
  }
}

// ── 辅助：DurableObject stub 原始值读取 ──
async function doGetRawFromStub(stub: any, key: string): Promise<string | null> {
  const res = await stub.fetch(`https://do/get?key=${encodeURIComponent(key)}`, { method: "GET" });
  if (!res.ok) return null;
  const text = await res.text();
  return text === "" ? null : text;
}

// ── handleCoinListRepair — 从 coin.ts 原样迁移 ──
async function handleCoinListRepair(chatId: number, threadId: number | undefined, userId: string, userName: string, doNs: DurableObjectNamespace, env: CoinEnv) {
  const TARGET_CHAT_ID = -1002742074355;
  await TgMessage.sendText(env, { chat_id: chatId, text: "🔧 开始清理无效数据...\n正在进行用户状态检查和余额调整...", parse_mode: "HTML", message_thread_id: threadId });

  try {
    const id = doNs.idFromName("coins");
    const stub = doNs.get(id);
    let allBalances: Record<string, number> = {};
    let cursor = "";
    const usersToClean: Array<{ uid: string; bal: number; reason: "invalid_id" | "negative_balance" | "not_in_group" }> = [];

    while (true) {
      const res = await stub.fetch(`https://do/list?limit=1000&cursor=${encodeURIComponent(cursor)}`);
      const data = await res.json() as { keys?: { name: string }[]; cursor?: string };
      const keys: { name: string }[] = data.keys || [];
      cursor = data.cursor || "";
      for (const { name } of keys) {
        if (name.includes("||") || name === TREASURY_KEY || name.startsWith("coin_pray:")) continue;
        const bal = await getBalance(doNs, name);
        const uidNum = Number(name);
        const isUidValid = !isNaN(uidNum) && uidNum > 0;
        if (!isUidValid) { usersToClean.push({ uid: name, bal, reason: "invalid_id" }); continue; }
        if (bal < 0) { usersToClean.push({ uid: name, bal, reason: "negative_balance" }); continue; }
        if (bal > 0) {
          try {
            const inTargetGroup = await TgMessage.isUserInChat(env, TARGET_CHAT_ID, uidNum);
            if (!inTargetGroup) usersToClean.push({ uid: name, bal, reason: "not_in_group" });
          } catch {
            usersToClean.push({ uid: name, bal, reason: "not_in_group" });
          }
        }
        allBalances[name] = bal;
      }
      if (!cursor) break;
    }

    if (usersToClean.length === 0) {
      await TgMessage.sendText(env, { chat_id: chatId, text: "✅ 没有发现需要清理的数据。", parse_mode: "HTML", message_thread_id: threadId });
      return;
    }

    const byReason = {
      invalid_id: usersToClean.filter(u => u.reason === "invalid_id"),
      negative_balance: usersToClean.filter(u => u.reason === "negative_balance"),
      not_in_group: usersToClean.filter(u => u.reason === "not_in_group"),
    };

    let reportText = `📋 清理计划\n────────────────\n`;
    reportText += `无效用户ID: ${byReason.invalid_id.length} 个\n`;
    reportText += `负余额用户: ${byReason.negative_balance.length} 个\n`;
    reportText += `不在群组用户: ${byReason.not_in_group.length} 个\n`;
    reportText += `总计: ${usersToClean.length} 个用户需要清理\n\n`;
    reportText += `⚠️ 确认执行清理吗？此操作不可逆。\n回复 "确认清理" 开始执行。`;

    await TgMessage.sendText(env, { chat_id: chatId, text: reportText, parse_mode: "HTML", message_thread_id: threadId });
  } catch (e) {
    console.error("[coin] /coin list repair error", e);
    await TgMessage.sendText(env, { chat_id: chatId, text: "❌ 分析失败：无法读取用户数据，请稍后重试。", parse_mode: "HTML", message_thread_id: threadId });
  }
}

// ── handleCoinListConfirm — 从 coin.ts 原样迁移 ──
async function handleCoinListConfirm(chatId: number, threadId: number | undefined, userId: string, userName: string, doNs: DurableObjectNamespace, env: CoinEnv) {
  const TARGET_CHAT_ID = -1002742074355;
  await TgMessage.sendText(env, { chat_id: chatId, text: "🔄 开始执行清理操作...", parse_mode: "HTML", message_thread_id: threadId });

  try {
    const id = doNs.idFromName("coins");
    const stub = doNs.get(id);
    let cursor = "";
    let cleanedCount = 0;
    let totalAmount = 0;
    const cleanupLog: string[] = [];
    const originalTreasury = await getTreasury(doNs);

    while (true) {
      const res = await stub.fetch(`https://do/list?limit=1000&cursor=${encodeURIComponent(cursor)}`);
      const data = await res.json() as { keys?: { name: string }[]; cursor?: string };
      const keys: { name: string }[] = data.keys || [];
      cursor = data.cursor || "";

      for (const { name } of keys) {
        if (name.includes("||") || name === TREASURY_KEY || name.startsWith("coin_pray:")) continue;
        const bal = await getBalance(doNs, name);
        const uidNum = Number(name);
        const isUidValid = !isNaN(uidNum) && uidNum > 0;
        let needCleanup = false;
        let reason = "";

        if (!isUidValid) { needCleanup = true; reason = "无效ID"; }
        else if (bal < 0) { needCleanup = true; reason = "负余额"; }
        else if (bal > 0) {
          try {
            const inTargetGroup = await TgMessage.isUserInChat(env, TARGET_CHAT_ID, uidNum);
            if (!inTargetGroup) { needCleanup = true; reason = "不在群组"; }
          } catch { needCleanup = true; reason = "查询失败"; }
        }

        if (needCleanup) {
          const newTreasury = await getTreasury(doNs);
          const doGetRawFn = async (k: string) => {
            const r = await stub.fetch(`https://do/get?key=${encodeURIComponent(k)}`, { method: "GET" });
            return r.ok ? r.text() : null;
          };
          const doPutRawFn = async (k: string, v: string) => {
            await stub.fetch("https://do/put", { method: "POST", body: JSON.stringify({ key: k, value: v }), headers: { "Content-Type": "application/json" } });
          };
          await doPutRawFn(TREASURY_KEY, String(newTreasury + bal));
          await doPutRawFn(name, "0");
          cleanedCount++;
          totalAmount += Math.abs(bal);
          if (cleanedCount % 10 === 0) cleanupLog.push(`已清理 ${cleanedCount} 个用户，调整金额: ${totalAmount} 💰`);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      if (!cursor) break;
    }

    const finalTreasury = await getTreasury(doNs);
    const treasuryChange = finalTreasury - originalTreasury;
    let reportText = `✅ 清理完成\n────────────────\n`;
    reportText += `清理用户数: ${cleanedCount} 个\n`;
    reportText += `调整总金额: ${totalAmount} 💰\n`;
    reportText += `国库变化: ${treasuryChange > 0 ? "+" : ""}${treasuryChange} 💰\n`;
    reportText += `原始国库: ${originalTreasury} 💰\n`;
    reportText += `当前国库: ${finalTreasury} 💰\n`;
    if (cleanupLog.length > 0) reportText += `\n📝 清理记录:\n${cleanupLog.join("\n")}`;

    await TgMessage.sendText(env, { chat_id: chatId, text: reportText, parse_mode: "HTML", message_thread_id: threadId });
  } catch (e) {
    console.error("[coin] /coin list repair confirm error", e);
    await TgMessage.sendText(env, { chat_id: chatId, text: "❌ 清理失败：执行过程中出现错误。", parse_mode: "HTML", message_thread_id: threadId });
  }
}
