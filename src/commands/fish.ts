import TgMessage, { ParsedUpdate } from "../lib/tgMessage";
import { getBalance as coinGetBalance, addToTreasury, takeFromTreasury } from "../lib/coinService";
import { fishList, getCastDesc } from "../lib/liveConfig";
import { escapeHtml, stripHtml } from "../lib/util";


const maxRecode = 20;


/**
 * 扩展 env：在 CoinEnv 基础上需要 FISHING_RECORD_KV
 */
export type FishEnv = Env & {
    FISHING_RECORD_KV: KVNamespace;
    COIN_DO: DurableObjectNamespace;
    TOKEN: string;

};


function nowDateYMD(): string {
    return new Date().toISOString().split("T")[0];
}

function hasProcessedMessage(record: FishingRecord, messageId?: number | undefined): boolean {
    if (messageId === undefined) return false;
    return record.results.some(r => r.messageId === messageId);
}

/**
 * 池塘汇总记录，用同一个 KV（FISHING_RECORD_KV），key 前缀为 pond:YYYY-MM-DD
 */
type PondRecord = {
    date: string;
    totalBait: number;    // 当天消耗的鱼饵总量
    totalPayout: number;  // 国库当天支付给玩家的总额（钓中时）
    totalHooked: number;  // 当天钓中次数
    totalAttempts: number; // 当天发起的抛竿次数（包括失手/跑鱼）
};

async function getPondRecord(kv: KVNamespace, date: string): Promise<PondRecord> {
    const key = `pond:${date}`;
    const raw = await kv.get(key);
    if (!raw) {
        return { date, totalBait: 0, totalPayout: 0, totalHooked: 0, totalAttempts: 0 };
    }
    try {
        const parsed = JSON.parse(raw) as PondRecord;
        if (parsed.date !== date) {
            return { date, totalBait: 0, totalPayout: 0, totalHooked: 0, totalAttempts: 0 };
        }
        return parsed;
    } catch (e) {
        console.warn("[fish] 解析 pond record 失败，重置", e);
        return { date, totalBait: 0, totalPayout: 0, totalHooked: 0, totalAttempts: 0 };
    }
}

async function setPondRecord(kv: KVNamespace, date: string, rec: PondRecord) {
    const key = `pond:${date}`;
    await kv.put(key, JSON.stringify(rec));
}

async function addToPondBait(kv: KVNamespace, date: string, bait: number) {
    const rec = await getPondRecord(kv, date);
    rec.totalBait += bait;
    rec.totalAttempts += 1;
    await setPondRecord(kv, date, rec);
}

async function addToPondPayout(kv: KVNamespace, date: string, payout: number, hooked: boolean) {
    const rec = await getPondRecord(kv, date);
    rec.totalPayout += payout;
    if (hooked) rec.totalHooked += 1;
    await setPondRecord(kv, date, rec);
}

function showPondRecordHTML(rec: PondRecord): string {
    return `<blockquote expandable><b>鱼塘汇总 — ${escapeHtml(rec.date)}</b>：\n` +
        `• 今日鱼饵消耗：<b>${rec.totalBait}</b> 💰\n` +
        `• 今日国库支付（渔获发放）：<b>${rec.totalPayout}</b> 💰\n` +
        `• 今日钓中次数：<b>${rec.totalHooked}</b> 次\n` +
        `• 今日抛竿次数：<b>${rec.totalAttempts}</b> 次\n` +
        `</blockquote>`;
}

/* ------------------------- 钓鱼记录 KV 操作 ------------------------- */
type FishingRecord = {
    date: string;
    count: number;
    results: Array<{
        messageId: any; baitCost: number; hooked: boolean; fishValue: string | number
    }>;
};

async function getFishingRecord(kv: KVNamespace, id: string): Promise<FishingRecord> {
    const raw = await kv.get(id);
    const today = nowDateYMD();
    if (!raw) {
        return { date: today, count: 0, results: [] };
    }
    try {
        const parsed = JSON.parse(raw) as FishingRecord;
        if (parsed.date !== today) {
            return { date: today, count: 0, results: [] };
        }
        return parsed;
    } catch (e) {
        console.warn("[fish] 解析 fishing record 失败，重置", e);
        return { date: today, count: 0, results: [] };
    }
}

async function setFishingRecord(kv: KVNamespace, id: string, record: FishingRecord) {
    await kv.put(id, JSON.stringify(record));
}

/* ------------------------- 展示钓鱼记录（HTML） ------------------------- */
function showFishingRecord(record: FishingRecord): string {
    const todayCount = record.count;
    let resultText = `<blockquote expandable><b>今日钓鱼记录</b>：\n`;
    if (record.results.length > 0) {
        // 最新的显示在最上面
        const rev = [...record.results].reverse();
        rev.forEach((r, idx) => {
            resultText += `<b>第${todayCount - idx}次:</b> 花费 ${r.baitCost}💰, `;
            if (r.hooked) {
                const cleanFishTest = stripHtml(String(r.fishValue));
                resultText += `钓到  ${cleanFishTest}`;
            } else {
                resultText += `未钓到鱼`;
            }
            resultText += `\n`;
        });
    } else {
        resultText += `今天还没有任何渔获哦~\n`;
    }
    resultText += `</blockquote>今日已钓次数：<b>${todayCount}</b>次（最多 ${maxRecode} 次）`;
    return resultText;
}


/* ------------------------- callback 处理函数 ------------------------- */
/**
 * 处理 callback_query（parsedMessage.callbackQuery 的内容）
 * callbackData 可以是已解析的 object，也可以是字符串（JSON）；
 * 预期结构： { type: "fish", ownerId: number, strength: number, baitCost: number, startTs?: number }
 */
export async function handleFishCallback(callbackQuery: any, callbackData: any, env: FishEnv) {
    // 解析 callbackData（可能是字符串）

    let dataObj: any = callbackData;
    if (typeof dataObj === "string") {
        try {
            dataObj = JSON.parse(dataObj);
        } catch {
            dataObj = null;
        }
    }

    const ownerId = Number(dataObj?.o);
    const strength = Math.max(1, Number(dataObj?.s) || 1);
    const baitCost = Math.max(1, Number(dataObj?.b) || 1);
    const chatId = callbackQuery.message?.chat?.id;
    const messageId = callbackQuery.message?.message_id;
    const clickerId = callbackQuery.from?.id;
    const clickerName = (await TgMessage.fetchChatMember(env, chatId, clickerId)).first_name;

    // 只有发起者本人可以拉杆
    if (clickerId !== ownerId) {
        await TgMessage.answerCallbackQuery(env, callbackQuery.id, { text: `只有发起者本人可以拉杆`, show_alert: true });
        return;
    }

    // 时间计算：使用机器人原始消息 date（秒）
    const startTs = callbackQuery.message?.date ?? Math.floor(Date.now() / 1000);
    const nowTs = Math.floor(Date.now() / 1000);
    let seconds = nowTs - startTs;
    if (seconds < 0) seconds = 0;

    const rawScore = seconds * strength;
    const score = Math.floor(rawScore);

    // 读取余额与记录
    const ownerIdStr = String(ownerId);
    const currentBal = await coinGetBalance(env.COIN_DO, ownerIdStr);
    const fishingRecord = await getFishingRecord(env.FISHING_RECORD_KV, ownerIdStr);

    const zeroCount = (fishingRecord.results || []).filter(r => r.fishValue === 0).length;
    const guaranteePending = (zeroCount >= 10) && !Boolean((fishingRecord as any).guaranteeUsed);

    if (fishingRecord.results.some(r => r.messageId === messageId)) {
        await TgMessage.answerCallbackQuery(env, callbackQuery.id, { text: `该次钓鱼已处理，忽略重复点击。`, show_alert: true });
        return;
    }

    // 计次上限
    if (fishingRecord.count >= maxRecode) {
        await TgMessage.editMessageText(env, {
            chat_id: chatId,
            message_id: messageId,
            text: `❌ ${escapeHtml(String(callbackQuery.from?.first_name ?? "你"))}，今天已经钓了${maxRecode}次，不能再钓了。`,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: [] }
        });
        return;
    }

    // 先判定失败 / 过强导致鱼跑了
    if (score < 100) {
        // 防止重复处理
        if (hasProcessedMessage(fishingRecord, messageId)) {
            await TgMessage.answerCallbackQuery(env, callbackQuery.id, { text: `该次钓鱼已处理，忽略重复点击。`, show_alert: true });
            return;
        }

        fishingRecord.results.push({ baitCost, hooked: false, fishValue: 0, messageId });
        fishingRecord.count += 1;
        await setFishingRecord(env.FISHING_RECORD_KV, ownerIdStr, fishingRecord);

        const fishingRecordText = showFishingRecord(fishingRecord);
        const text =
            `${clickerName} 拉杆！\n` +
            `😕 没有咬钩……这次空手而归。\n\n 本次花费 ${baitCost}💰鱼饵。当前余额 ${currentBal}💰 ` +
            fishingRecordText;

        await TgMessage.editMessageText(env, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML",
            text,
            reply_markup: { inline_keyboard: [] }
        });
        return;
    }

    if (score > 1000) {
        if (hasProcessedMessage(fishingRecord, messageId)) {
            await TgMessage.answerCallbackQuery(env, callbackQuery.id, { text: `该次钓鱼已处理，忽略重复点击。`, show_alert: true });
            return;
        }

        fishingRecord.results.push({ baitCost, hooked: false, fishValue: 0, messageId });
        fishingRecord.count += 1;
        await setFishingRecord(env.FISHING_RECORD_KV, ownerIdStr, fishingRecord);

        const fishingRecordText = showFishingRecord(fishingRecord);
        const text =
            `${clickerName} 鱼跑了！\n` +
            `💥 力道太大/时间太久。下次小心点～\n\n 本次花费 ${baitCost}💰鱼饵。 当前余额 ${currentBal}💰 ` +
            fishingRecordText;

        await TgMessage.editMessageText(env, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML",
            text,
            reply_markup: { inline_keyboard: [] }
        });
        return;
    }


    // 可配置的“value”范围起止；如果你希望把 1 和 13 作为参数，这里可以替换成配置变量（目前以 fishList 的实际 value 范围为准）
    const values = fishList.map(f => Number(f.value));
    const minValueAvailable = 0; // 例如 1（或者 0）
    const maxValueAvailable = Math.max(...values); // 例如 13

    // 如果满足保底条件并且 score 落在 100..1000，则直接触发保底（只触发一次/天）
    if (guaranteePending && score >= 100 && score <= 1000) {
        // 选取最大 value 的鱼（如果有多条相同 value，随机挑一条）
        const bestVal = maxValueAvailable;
        const bestCandidates = fishList.filter(f => Number(f.value) === bestVal);
        const chosen = bestCandidates[Math.floor(Math.random() * bestCandidates.length)];

        // 给用户发奖（允许国库赤字）
        const payout = Number(chosen.value) || 0;
        const newOwnerBal = currentBal + payout;
        await takeFromTreasury(env, env.COIN_DO, ownerIdStr, payout, "渔获（保底）");

        // 更新鱼塘当天 payout
        const today = nowDateYMD();
        await addToPondPayout(env.FISHING_RECORD_KV, today, payout, true);

        // 写入记录并标记保底已被使用（每天仅一次）
        (fishingRecord as any).guaranteeUsed = true;
        fishingRecord.results.push({ baitCost, hooked: true, fishValue: chosen.name, messageId });
        fishingRecord.count += 1;
        await setFishingRecord(env.FISHING_RECORD_KV, ownerIdStr, fishingRecord);

        const resultText =
            `${clickerName} 拉杆！\n` +
            `🎉 成功钓上：<b>${chosen.name}</b>，本次花费 ${baitCost}💰鱼饵，获得 ${payout} 💰渔获，最新余额 ${newOwnerBal}💰。\n`
            + showFishingRecord(fishingRecord);

        await TgMessage.editMessageText(env, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML",
            text: resultText,
            reply_markup: { inline_keyboard: [] }
        });
        return;
    }

    /* ---------------- 100..1000 区间：先决定目标 value（使用泊松分布），再从 fishList 中选鱼 ---------------- */

    // 计算 score 在 100..1000 的归一化位置（0..1）
    const norm = (score - 100) / (1000 - 100); // 0..1

    // 连续的期望 value（min..max）
    const meanValueContinuous = minValueAvailable + norm * (maxValueAvailable - minValueAvailable);

    // 将 baitCost 用作控制散列程度的放大系数：
    // baitMultiplier 越大，泊松 lambda 越大，获得更高 value 的概率越容易（即撒网更宽松）。
    // 这里的 scaleFactor 可调：若想让 baitCost=1 很窄，baitCost=10 明显放宽，选择 3~6 是比较合适的权衡。
    const SCALE_FACTOR = 3.0;
    // lambda 基于 meanValueContinuous，但相对于最小 value 我们只对“偏离最小值”的部分做泊松建模
    const lambdaBase = Math.max(0, meanValueContinuous - minValueAvailable);
    const lambda = lambdaBase * (baitCost / SCALE_FACTOR);

    // 泊松采样（Knuth 算法）
    function samplePoisson(lambdaNum: number) {
        if (lambdaNum <= 0) return 0;
        const L = Math.exp(-lambdaNum);
        let k = 0;
        let p = 1.0;
        while (p > L) {
            k++;
            p *= Math.random();
            // 保守防止死循环：如果 k 已经很大，直接返回 k
            if (k > 1e6) break;
        }
        return k - 1 >= 0 ? k - 1 : 0; // Knuth 返回的是 k-1
    }

    // 采样得到偏移量（相对于 minValueAvailable）
    const sampledOffset = samplePoisson(lambda);
    let targetValue = minValueAvailable + sampledOffset;

    // 限制到可用范围
    if (targetValue > maxValueAvailable) targetValue = maxValueAvailable;
    if (targetValue < minValueAvailable) targetValue = minValueAvailable;

    // 当 targetValue === 0（如果你的 fishList 中包含 value = 0），则判定为“没上鱼”
    const isNoCatchValue = (targetValue === 0);

    // 选择 fishList 中 value === targetValue 的候选项；若没有，则选取离 targetValue 最近的 value 集合
    let candidateFish = fishList.filter(f => Number(f.value) === targetValue);
    if (candidateFish.length === 0) {
        // 找出与 targetValue 最近的 value（绝对差最小），然后取那些具有该 value 的鱼
        let closestVal = values.reduce((acc, v) => {
            if (acc === null) return v;
            return (Math.abs(v - targetValue) < Math.abs(acc - targetValue)) ? v : acc;
        }, null as number | null) as number;
        candidateFish = fishList.filter(f => Number(f.value) === closestVal);
    }

    // 从候选鱼中随机选择一条
    // 决定是否“上鱼”（hooked）依旧由 chosen.hookRate + baitCost * jitter 决定
    // 但如果 isNoCatchValue 为 true（value===0），我们强制判定未上鱼
    let hooked = false;
    let chosen: any = null;

    if (isNoCatchValue) {
        // 没有渔获（value==0），直接记录未钓中（或按你的业务需要另作显示）
        hooked = false;

    } else {
        // 随机从候选池中挑一条鱼作为“目标鱼”（用于判断 hookRate）
        chosen = candidateFish[Math.floor(Math.random() * candidateFish.length)];

        // 微调抓上概率：沿用原逻辑用 baitCost 做 jitter 增益
        const jitter = 0.1 * baitCost;
        const finalHookProb = Math.max(0, Math.min(1, (Number(chosen.hookRate) || 0) + jitter));
        hooked = Math.random() < finalHookProb;
    }


    // 记录与国库操作：
    // - 发起者支付的 baitCost 在发起阶段已经扣除并加入国库（handleFish 已完成 addToTreasury）
    // - 如果钓中鱼：从国库支付给用户（允许国库赤字）
    let resultText = `${clickerName} 拉杆！\n`;

    if (hooked && chosen) {
        const payout = Number(chosen.value) || 0;
        const newOwnerBal = currentBal + payout;
        await takeFromTreasury(env, env.COIN_DO, ownerIdStr, payout, "渔获");

        // 更新鱼塘当日 payout
        const today = nowDateYMD();
        await addToPondPayout(env.FISHING_RECORD_KV, today, payout, true);

        resultText += `🎉 成功钓上：<b>${chosen.name}</b>，本次花费 ${baitCost}💰鱼饵，获得 ${payout} 💰渔获，最新余额 ${newOwnerBal}💰。\n`
        //           + ` 调试信息 \n strength ${strength} \n seconds ${seconds}  \n score ${score}  \n norm ${norm}  \n meanValueContinuous ${meanValueContinuous}  \n lambdaBase ${lambdaBase}  \n lambda ${lambda}  \n sampledOffset ${sampledOffset} \n targetValue ${targetValue}  `;
    } else {
        // 未钓中（包括 targetValue==0 或 hook 判定失败）
        resultText += `😣 有鱼接近，但这次没有上钩。\n\n 本次花费 ${baitCost}💰鱼饵，最新余额 ${currentBal}💰 \n`
        //            + ` 调试信息 \n strength ${strength} \n seconds ${seconds}  \n score ${score}  \n norm ${norm}  \n meanValueContinuous ${meanValueContinuous}  \n lambdaBase ${lambdaBase}  \n lambda ${lambda}  \n sampledOffset ${sampledOffset} \n targetValue ${targetValue}  `;
    }

    // 防止并发/重复处理的最后检查
    if (hasProcessedMessage(fishingRecord, messageId)) {
        await TgMessage.answerCallbackQuery(env, callbackQuery.id, { text: `该次钓鱼已处理，忽略重复点击。`, show_alert: true });
        return;
    }

    // 写入记录并回复
    fishingRecord.results.push({ baitCost, hooked, fishValue: hooked && chosen ? chosen.name : 0, messageId });
    fishingRecord.count += 1;
    await setFishingRecord(env.FISHING_RECORD_KV, ownerIdStr, fishingRecord);

    resultText += showFishingRecord(fishingRecord);

    await TgMessage.editMessageText(env, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "HTML",
        text: resultText,
        reply_markup: { inline_keyboard: [] }
    });
}

/* ------------------------- 主入口：handleFish(parsedMessage, env) ------------------------- */
/**
 * parsedMessage: ParsedUpdate（由 TgMessage.parseUpdate 返回）
 */
export async function handleFish(parsedMessage: ParsedUpdate, env: FishEnv) {
    const kvBackend = env.COIN_DO
    // 如果是 callback_query，转给 callback handler
    if (parsedMessage.type === "callback_query" && parsedMessage.callbackQuery) {
        // parsedMessage.callbackData 可能已被 parseCallbackData 转成 object；也可能是字符串
        const callbackData = parsedMessage.callbackData;
        await handleFishCallback(parsedMessage.callbackQuery, callbackData, env);
        return;
    }

    // 只在普通消息/命令时处理发起
    const isCommand = !!parsedMessage.isCommand && parsedMessage.command === "fish";
    if (!isCommand) {
        // 非本命令，忽略（或者返回帮助提示）
        // 这里我们选择不发送任何消息（由上层命令分发系统决定）
        return;
    }

    // 解析参数：鱼饵花费在 args[0]
    const args = parsedMessage.args ?? [];

    // 新增：/fish check [YYYYMMDD|YYYY-MM-DD]
    if (args[0] === "check") {
        const dateArg = args[1];
        let date = nowDateYMD();
        if (dateArg) {
            // 接受 20250830 或 2025-08-30 两种格式
            const raw = dateArg.replace(/[^0-9]/g, "");
            if (raw.length === 8) {
                date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
            } else {
                // 非法格式，回复提示
                await TgMessage.sendText(env, {
                    chat_id: parsedMessage.chatId!,
                    text: `❌ 日期格式错误。请使用 /fish check 或 /fish check YYYYMMDD（例如 /fish check 20250830）`,
                    parse_mode: "HTML",
                    message_thread_id: parsedMessage.threadId
                });
                return;
            }
        }

        const pondRec = await getPondRecord(env.FISHING_RECORD_KV, date);
        const html = showPondRecordHTML(pondRec);
        await TgMessage.sendText(env, {
            chat_id: parsedMessage.chatId!,
            text: html,
            parse_mode: "HTML",
            message_thread_id: parsedMessage.threadId
        });
        return;
    }

    const baitCost = Math.max(1, parseInt(args[0] || "", 10) || 1);

    const chatId = parsedMessage.chatId!;
    const threadId = parsedMessage.threadId;
    const from = parsedMessage.from!;
    const ownerId = Number(from.id);
    const ownerIdStr = String(ownerId);
    const userName = escapeHtml(String(from.first_name ?? from.username ?? "你"));

    // 检查是否在允许钓鱼的房间（使用你原来的 allowed 规则）
    const allowed =
        (chatId === -1002848481881 && [66].includes(threadId ?? 0)) ||
        (chatId === -1002970430696 && [89].includes(threadId ?? 0)) ||
        (chatId === -1002970430696 && [166].includes(threadId ?? 0)) ||
        (chatId === -1002742074355 && [454656].includes(threadId ?? 0));
    if (!allowed) {
        await TgMessage.sendText(env, {
            chat_id: chatId,
            text: `🎣 这里不适合钓鱼。或许前往群岛，才能收获渔获……`,
            parse_mode: "HTML",
            message_thread_id: threadId
        });
        return;
    }

    // 读取记录、检查次数
    const fishingRecord = await getFishingRecord(env.FISHING_RECORD_KV, ownerIdStr);
    if (fishingRecord.count >= maxRecode) {
        await TgMessage.sendText(env, {
            chat_id: chatId,
            text: `❌ ${userName}，今天已经钓了${maxRecode}次，不能再钓了。`,
            parse_mode: "HTML",
            message_thread_id: threadId
        });
        return;
    }

    // 读取余额与扣除 baitCost（发起者先付鱼饵）
    const currentBal = await coinGetBalance(kvBackend, ownerIdStr);
    if (currentBal < baitCost) {
        await TgMessage.sendText(env, {
            chat_id: chatId,
            text: `❌ ${userName}，你的余额不足，当前只有 ${currentBal} 💰。`,
            parse_mode: "HTML",
            message_thread_id: threadId
        });
        return;
    }

    // 扣除用户余额（直接用 coinSetBalance）

    // 把鱼饵费用计入艾丽莎宝库（若要计费可使用 addToTreasury）
    await addToTreasury(env, env.COIN_DO, ownerIdStr, baitCost, "鱼饵");

    // 同时把鱼饵消耗计入鱼塘当天汇总
    const today = nowDateYMD();
    await addToPondBait(env.FISHING_RECORD_KV, today, baitCost);

    // 随机 strength（或允许传入固定值），你原来用 random strength
    const strength = Math.floor(Math.random() * 100) + 11;

    // 生成抛竿描述（保留原文案）
    let castDesc: string;
    castDesc = getCastDesc(strength);
    const bestSec = 1000 / strength;


    const initText =
        `${userName} 花费 ${baitCost} 💰 的鱼饵后，抛出渔线，${castDesc}\n\n` +
        //       ` bestSec ${bestSec}\n` +
        `点击下方的「🎣 拉杆」以收紧鱼线，迎接命运的回响\n（仅 ${userName} 本人可操作）。`;

    // callback_data 使用 JSON 字符串化
    const callbackDataObj = { type: "fish", o: ownerId, s: strength, b: baitCost };
    const callbackData = JSON.stringify(callbackDataObj);

    // 发送含按钮的消息（由 TgMessage 发送）
    await TgMessage.sendText(env, {
        chat_id: chatId,
        text: initText,
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [[{ text: "🎣 拉杆", callback_data: callbackData }]]
        },
        message_thread_id: threadId
    });

    // 同时更新并保存钓鱼记录（仅更新次数不会写入本次结果，结果在拉杆阶段记录）
    // 这里不立即增加 count，count 在拉杆阶段增加，保持与原逻辑一致
    return;
}

export default handleFish;
