import TgMessage, { ParsedUpdate } from "../lib/tgMessage";
import { CoinEnv, getBalance as coinGetBalance, addToBalance, addToTreasury, payoutFromTreasuryAllowNegative, deductFromBalance } from "../lib/coinService";
import { fishList, getCastDesc } from "../lib/liveConfig";
import { escapeHtml } from "../lib/util";
import { createDOAdapter } from "../lib/doAdapter";


const maxRecode=20;


/**
 * 扩展 env：在 CoinEnv 基础上需要 FISHING_RECORD_KV
 */
export type FishEnv = CoinEnv & {
    FISHING_RECORD_KV: KVNamespace;
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
                resultText += `钓到 ${r.fishValue}`;
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
 const kvBackend = createDOAdapter(env, env.COIN_DO, "coins");
    // 尝试把 callbackData 变成 object
    let dataObj: any = callbackData;
    if (typeof dataObj === "string") {
        try {
            dataObj = JSON.parse(dataObj);
        } catch {
            dataObj = null;
        }
    }


    const ownerId = Number(dataObj.o);
    const strength = Math.max(1, Number(dataObj.s) || 1);
    const baitCost = Math.max(1, Number(dataObj.b) || 1);
    const chatId = callbackQuery.message?.chat?.id;
    const messageId = callbackQuery.message?.message_id;
    const clickerId = callbackQuery.from?.id;
    const clickerName = escapeHtml(String(callbackQuery.from?.first_name ?? callbackQuery.from?.username ?? "你"));

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
    const currentBal = await coinGetBalance(kvBackend, ownerIdStr);
    const fishingRecord = await getFishingRecord(env.FISHING_RECORD_KV, ownerIdStr);

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
        if (hasProcessedMessage(fishingRecord, messageId)) {
            await TgMessage.answerCallbackQuery(env, callbackQuery.id, { text: `该次钓鱼已处理，忽略重复点击。`, show_alert: true });
            return;
        }

        fishingRecord.results.push({ baitCost, hooked: false, fishValue: 0, messageId }); fishingRecord.count += 1;
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

    // 介于 100 和 1000：挑鱼 & 钩上判定
    // 根据 score 偏向更稀有鱼
    const norm = (score - 100) / (1000 - 100); // 0..1
    const center = norm * (fishList.length - 1);
    const sigma = 1.0;
    const weights = fishList.map((_, i) => Math.exp(-Math.pow(i - center, 2) / (2 * sigma * sigma)));
    const weightSum = weights.reduce((a, b) => a + b, 0);
    const pick = Math.random() * weightSum;
    let acc = 0;
    let pickIndex = 0;
    for (let i = 0; i < weights.length; i++) {
        acc += weights[i];
        if (pick <= acc) {
            pickIndex = i;
            break;
        }
    }
    const chosen = fishList[pickIndex];

    // 鱼饵对抓上概率的微调（和你原来逻辑一致）
    const jitter = 0.1 * baitCost;
    const finalHookProb = Math.max(0, Math.min(1, chosen.hookRate + jitter));
    const hooked = Math.random() < finalHookProb;

    // 记录与国库操作：
    // - 发起者支付的 baitCost 在发起阶段已经扣除并加入国库（handleFish 已完成 addToTreasury）
    // - 如果钓中鱼：从国库支付给用户（允许国库赤字）
    let resultText = `${clickerName} 拉杆！\n`;
    if (hooked) {
        // 从国库扣款（允许负值）
        const payout = chosen.value;
        const newOwnerBal = currentBal + payout;
        // 给用户加钱（我们选择复用 coinSetBalance，注意 coinSetBalance 会直接写回用户 KV）
        await addToBalance(env,kvBackend, ownerIdStr, payout,"渔获");
        // 国库扣款（可能为负）
        const newTre = await payoutFromTreasuryAllowNegative(env,kvBackend, payout,"渔获");

        // 更新鱼塘当日 payout
        const today = nowDateYMD();
        await addToPondPayout(env.FISHING_RECORD_KV, today, payout, true);

        resultText += `🎉 成功钓上：<b>${chosen.name}</b>，本次花费 ${baitCost}💰鱼饵，获得 ${chosen.value} 💰渔获，最新余额 ${newOwnerBal}💰。\n`;
        // resultText += `（国库支付 ${payout}💰；国库余额 ${newTre} 💰）\n`;
    } else {
        // 即使未钓中，也把当天尝试计入 pond（totalAttempts 已在发起时计入）
        resultText += `😣 有鱼咬住了，但它挣脱了！～\n\n 本次花费 ${baitCost}💰鱼饵，没有渔获，最新余额 ${currentBal}💰 \n`;
    }


    if (hasProcessedMessage(fishingRecord, messageId)) {
        await TgMessage.answerCallbackQuery(env, callbackQuery.id, { text: `该次钓鱼已处理，忽略重复点击。`, show_alert: true });
        return;
    }

    fishingRecord.results.push({ baitCost, hooked, fishValue: hooked ? chosen.name : 0, messageId });
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
const kvBackend = createDOAdapter(env, env.COIN_DO, "coins");
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
    await deductFromBalance(env,kvBackend, ownerIdStr,  baitCost,"鱼饵");

    // 把鱼饵费用计入艾丽莎宝库（若要计费可使用 addToTreasury）
    await addToTreasury(env,kvBackend, baitCost,"鱼饵");

    // 同时把鱼饵消耗计入鱼塘当天汇总
    const today = nowDateYMD();
    await addToPondBait(env.FISHING_RECORD_KV, today, baitCost);

    // 随机 strength（或允许传入固定值），你原来用 random strength
    const strength = Math.floor(Math.random() * 100) + 11;

    // 生成抛竿描述（保留原文案）
    let castDesc: string;
    castDesc= getCastDesc(strength);


    const initText =
        `${userName} 花费 ${baitCost} 💰 的鱼饵后，抛出渔线，${castDesc}\n\n` +
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
