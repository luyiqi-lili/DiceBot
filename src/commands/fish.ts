// src/commands/fish.ts
import TgMessage, { ParsedUpdate } from "../lib/tgMessage";
import { CoinEnv, TREASURY_KEY, getBalance as coinGetBalance, setBalance as coinSetBalance, addToTreasury } from "./coin";

/**
 * 扩展 env：在 CoinEnv 基础上需要 FISHING_RECORD_KV
 */
export type FishEnv = CoinEnv & {
  FISHING_RECORD_KV: KVNamespace;
};

/* ------------------------- 辅助函数 ------------------------- */
function escapeHtml(text: string) {
  return (text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function nowDateYMD(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * 从国库支付（允许出现负值）
 * - 返回新的国库余额（可能小于0）
 */
async function payoutFromTreasuryAllowNegative(kv: KVNamespace, amount: number): Promise<number> {
  const curRaw = await kv.get(TREASURY_KEY);
  const cur = curRaw ? parseInt(curRaw, 10) || 0 : 0;
  const next = cur - amount;
  await kv.put(TREASURY_KEY, String(next));
  return next;
}

/* ------------------------- 钓鱼记录 KV 操作 ------------------------- */
type FishingRecord = {
  date: string;
  count: number;
  results: Array<{ baitCost: number; hooked: boolean; fishValue: string | number }>;
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
      resultText += `<b>第${idx + 1}次:</b> 花费 ${r.baitCost}💰, `;
      if (r.hooked) {
        resultText += `钓到 ${escapeHtml(String(r.fishValue))}`;
      } else {
        resultText += `未钓到鱼`;
      }
      resultText += `\n`;
    });
  } else {
    resultText += `今天还没有任何渔获哦~\n`;
  }
  resultText += `</blockquote>今日已钓次数：<b>${todayCount}</b>次（最多 10 次）`;
  return resultText;
}

/* ------------------------- 鱼表（保留你原先数据 & 索引化） ------------------------- */
const fishList = [
  { name: "🍾破损漂流瓶", hookRate: 0.60, value: 1 },
  { name: "🪵浮木", hookRate: 0.60, value: 1 },
  { name: "👢没用的靴子", hookRate: 0.60, value: 1 },
  { name: "🌿绿海草", hookRate: 0.60, value: 1 },
  { name: "<tg-spoiler>🩸用过的避孕套</tg-spoiler>", hookRate: 0.60, value: 1 },

  { name: "🐚回音海螺", hookRate: 0.40, value: 2 },
  { name: "🦀三钳蟹", hookRate: 0.40, value: 2 },
  { name: "🦐樱花虾", hookRate: 0.40, value: 2 },
  { name: "🌿蓝海草", hookRate: 0.40, value: 2 },
  { name: "🐟沙丁鱼", hookRate: 0.40, value: 2 },
  { name: "<tg-spoiler>🔵跳蛋</tg-spoiler>", hookRate: 0.40, value: 2 },

  { name: "🐡红刺豚", hookRate: 0.35, value: 2 },
  { name: "🐟蓝鳍鱼", hookRate: 0.35, value: 2 },
  { name: "🐠带刺石斑", hookRate: 0.35, value: 2 },
  { name: "🐟石楠花鱼", hookRate: 0.35, value: 2 },
  { name: "🐟穴鱼", hookRate: 0.35, value: 2 },
  { name: "🐡球绒鱼", hookRate: 0.35, value: 2 },
  { name: "🐟芒果鱼", hookRate: 0.35, value: 2 },
  { name: "<tg-spoiler>📿项圈</tg-spoiler>", hookRate: 0.35, value: 2 },

  { name: "🐟弧光鱼", hookRate: 0.30, value: 3 },
  { name: "🐟兔鱼", hookRate: 0.30, value: 3 },
  { name: "🪼夜光水母", hookRate: 0.30, value: 3 },
  { name: "<tg-spoiler>⚡震动棒</tg-spoiler>", hookRate: 0.30, value: 3 },
  { name: "<tg-spoiler>🍆假阳具</tg-spoiler>", hookRate: 0.30, value: 3 },

  { name: "🐟岩崖飞鱼", hookRate: 0.25, value: 5 },
  { name: "<tg-spoiler>🛏️充气娃娃</tg-spoiler>", hookRate: 0.25, value: 5 },
  { name: "🦑毒刺乌贼", hookRate: 0.25, value: 5 },
  { name: "🐝海蜻蜓", hookRate: 0.25, value: 5 },
  { name: "🦭尖牙海豹", hookRate: 0.25, value: 5 },
  { name: "🐟双塔金枪鱼", hookRate: 0.25, value: 5 },
  { name: "🦐猎人巨虾", hookRate: 0.25, value: 5 },
  { name: "🌭深海肉茎", hookRate: 0.25, value: 5 },
  { name: "🪼黏液海触手", hookRate: 0.25, value: 5 },
  { name: "🦑骆驼乌贼", hookRate: 0.25, value: 5 },
  { name: "🪙金币鱼", hookRate: 0.25, value: 5 },
  { name: "🐟巨嘴金鱼", hookRate: 0.25, value: 5 },

  { name: "🐬彩虹海豚", hookRate: 0.20, value: 7 },
  { name: "🌊风暴海鲈", hookRate: 0.20, value: 7 },
  { name: "🌹玫瑰海胆", hookRate: 0.20, value: 7 },
  { name: "🐟冰原鲳", hookRate: 0.20, value: 7 },
  { name: "🪸珊瑚海马", hookRate: 0.20, value: 7 },
  { name: "🛡️骑士鱼", hookRate: 0.20, value: 7 },
  { name: "💖爱心鱼", hookRate: 0.20, value: 7 },
  { name: "🐠阴蒂鱼", hookRate: 0.20, value: 7 },

  { name: "🐉红蛟", hookRate: 0.15, value: 11 },
  { name: "🧬远古海马", hookRate: 0.15, value: 11 },
  { name: "☯️阴阳鱼", hookRate: 0.15, value: 11 },
  { name: "🌺牡丹海参", hookRate: 0.15, value: 11 },
  { name: "🐢银龟", hookRate: 0.15, value: 11 },
  { name: "☀️太阳鲨鱼", hookRate: 0.15, value: 11 },
  { name: "🌋岩浆鳗鱼", hookRate: 0.15, value: 11 },
  { name: "⚡雷电鮟鱇鱼", hookRate: 0.15, value: 11 },
  { name: "🌊潮汐鱼人", hookRate: 0.15, value: 11 },
  { name: "🦑黄金乌贼", hookRate: 0.15, value: 11 },
  { name: "🐋触须鲸", hookRate: 0.15, value: 11 },

  { name: "🦈龙牙鲨", hookRate: 0.10, value: 13 },
  { name: "🐍巨角蟒", hookRate: 0.10, value: 13 },
  { name: "🐱猫鱼", hookRate: 0.10, value: 13 }
];

/* ------------------------- callback 处理函数 ------------------------- */
/**
 * 处理 callback_query（parsedMessage.callbackQuery 的内容）
 * callbackData 可以是已解析的 object，也可以是字符串（JSON）；
 * 预期结构： { action: "fish_pull", ownerId: number, strength: number, baitCost: number, startTs?: number }
 */
export async function handleFishCallback(callbackQuery: any, callbackData: any, env: FishEnv) {
  // 先停止 loading（如果需要）
  try {
    await TgMessage.answerCallbackQuery(env, callbackQuery.id);
  } catch (e) {
    // 忽略 answer 错误
  }

  // 尝试把 callbackData 变成 object
  let dataObj: any = callbackData;
  if (typeof dataObj === "string") {
    try {
      dataObj = JSON.parse(dataObj);
    } catch {
      dataObj = null;
    }
  }

  if (!dataObj || dataObj.action !== "fish_pull") {
    // 非本模块 callback，忽略
    return;
  }

  const ownerId = Number(dataObj.ownerId);
  const strength = Math.max(1, Number(dataObj.strength) || 1);
  const baitCost = Math.max(1, Number(dataObj.baitCost) || 1);
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
  const currentBal = await coinGetBalance(env.COIN_KV, ownerIdStr);
  const fishingRecord = await getFishingRecord(env.FISHING_RECORD_KV, ownerIdStr);

  // 计次上限（10 次）
  if (fishingRecord.count >= 10) {
    await TgMessage.editMessageText(env, {
      chat_id: chatId,
      message_id: messageId,
      text: `❌ ${escapeHtml(String(callbackQuery.from?.first_name ?? "你"))}，今天已经钓了10次，不能再钓了。`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [] }
    });
    return;
  }

  // 先判定失败 / 过强导致鱼跑了
  if (score < 100) {
    fishingRecord.results.push({ baitCost, hooked: false, fishValue: 0 });
    fishingRecord.count += 1;
    await setFishingRecord(env.FISHING_RECORD_KV, ownerIdStr, fishingRecord);

    const fishingRecordText = showFishingRecord(fishingRecord);
    const text =
      `${clickerName} 拉杆！\n` +
      `😕 没有咬钩……这次空手而归。\n\n 本次花费 ${baitCost}💰鱼饵，国库已记入。 当前余额 ${currentBal}💰 ` +
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
    fishingRecord.results.push({ baitCost, hooked: false, fishValue: 0 });
    fishingRecord.count += 1;
    await setFishingRecord(env.FISHING_RECORD_KV, ownerIdStr, fishingRecord);

    const fishingRecordText = showFishingRecord(fishingRecord);
    const text =
      `${clickerName} 鱼跑了！\n` +
      `💥 力道太大/时间太久。下次小心点～\n\n 本次花费 ${baitCost}💰鱼饵，国库已记入。 当前余额 ${currentBal}💰 ` +
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
    await coinSetBalance(env.COIN_KV, ownerIdStr, newOwnerBal);
    // 国库扣款（可能为负）
    const newTre = await payoutFromTreasuryAllowNegative(env.COIN_KV, payout);

    resultText += `🎉 成功钓上：<b>${chosen.name}</b>，本次花费 ${baitCost}💰鱼饵，获得 ${chosen.value} 💰渔获，最新余额 ${newOwnerBal}💰。\n`;
    resultText += `（国库支付 ${payout}💰；国库余额 ${newTre} 💰）\n`;
  } else {
    resultText += `😣 有鱼咬住了，但它挣脱了！～\n\n 本次花费 ${baitCost}💰鱼饵，没有渔获，最新余额 ${currentBal}💰 \n`;
  }

  fishingRecord.results.push({ baitCost, hooked, fishValue: hooked ? chosen.name : 0 });
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
 * env: FishEnv（要求有 COIN_KV, FISHING_RECORD_KV, BOT_USERNAME）
 */
export async function handleFish(parsedMessage: ParsedUpdate, env: FishEnv) {
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
  if (fishingRecord.count >= 10) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `❌ ${userName}，今天已经钓了10次，不能再钓了。`,
      parse_mode: "HTML",
      message_thread_id: threadId
    });
    return;
  }

  // 读取余额与扣除 baitCost（发起者先付鱼饵）
  const currentBal = await coinGetBalance(env.COIN_KV, ownerIdStr);
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
  const newBalAfterPay = currentBal - baitCost;
  await coinSetBalance(env.COIN_KV, ownerIdStr, newBalAfterPay);

  // 把鱼饵费用计入艾丽莎宝库（若要计费可使用 addToTreasury）
  await addToTreasury(env.COIN_KV, baitCost);

  // 随机 strength（或允许传入固定值），你原来用 random strength
  const strength = Math.floor(Math.random() * 100) + 1;

  // 生成抛竿描述（保留原文案）
  const castDesc = (() => {
    if (strength <= 10) {
      return "轻轻一抛，水面只泛起细碎涟漪，仿佛在对你低声耳语。";
    } else if (strength <= 20) {
      return "划出一道优雅的弧线，浮漂微颤，风中夹着松香与海盐的气息。";
    } else if (strength <= 30) {
      return "动作稳健，鱼线划破空气，落点处闪过一丝银色光芒。";
    } else if (strength <= 40) {
      return "一记有力的抛投，水面溅起弧形水花，仿佛惊动了湖底的守护灵。";
    } else if (strength <= 50) {
      return "力道十足，鱼线如弓弦绷直，周遭的空气也为之一振。";
    } else if (strength <= 60) {
      return "蛮力与技巧并存，抛出之处泛起层层涟漪，似乎呼唤着深处巨影。";
    } else if (strength <= 70) {
      return "这一抛带着烈风，鱼线像流星穿过晨雾，远方水域开始不安。";
    } else if (strength <= 80) {
      return "宛如英雄挥矛，鱼线直刺深海，水下传来低沉的回应。";
    } else if (strength <= 100) {
      return "强势一挥，几乎卷起周遭的风声，水面裂出一道光缝，古老鱼群被惊起。";
    } else {
      return "以超凡之力甩出渔线！饵远飞天际！";
    }
  })();

  const initText =
    `${userName} 花费 ${baitCost} 💰 的鱼饵后，抛出渔线，${castDesc}\n\n` +
    `点击下方的「🎣 拉杆」以收紧鱼线，迎接命运的回响\n（仅 ${userName} 本人可操作）。`;

  // callback_data 使用 JSON 字符串化
  const callbackDataObj = { action: "fish_pull", ownerId, strength, baitCost };
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
