// src/commands/fish.ts
/**
 * 重构说明：
 * - 接受 ParsedUpdate（来自 lib/tgMessage.parseUpdate）和一个 env（包含 COIN_KV 与 FISHING_RECORD_KV）。
 * - 所有与 Telegram 的交互都使用 TgMessage 封装函数（sendText / editMessageText / answerCallbackQuery）。
 * - 鱼饵费用会加入国库（addToTreasury）。
 * - 钓到鱼时由国库支付：我们读取国库余额并用 coin.setBalance 写回 treasury - payout，
 *   这样允许国库出现负值（赤字）。如果你不想允许赤字，可改为先判断余额并拒绝支付。
 *
 * 依赖：
 *   - lib/tgMessage.ts 中的 TgMessage 与 ParsedUpdate
 *   - commands/coin.ts 中导出的函数（getBalance, setBalance, addToTreasury, getTreasury, TREASURY_KEY）
 * 环境（env）要求：
 *   - env.COIN_KV: KVNamespace (用于 coin.ts 提供的函数)
 *   - env.FISHING_RECORD_KV: KVNamespace (用于保存钓鱼记录)
 *   - env.BOT_USERNAME?: string
 *
 * 返回值：函数直接使用 TgMessage 发送/编辑消息并返回 void。
 */

import TgMessage, { ParsedUpdate } from "../lib/tgMessage";
import {
  CoinEnv,
  TREASURY_KEY,
  getBalance as coinGetBalance,
  setBalance as coinSetBalance,
  addToTreasury,
  getTreasury
} from "../commands/coin";

type FishEnv = CoinEnv & {
  FISHING_RECORD_KV: KVNamespace;
};

function escapeHtml(text: string) {
  return (text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function nowDateYMD(): string {
  return new Date().toISOString().split("T")[0];
}

async function readFishingRecord(kv: KVNamespace, id: string) {
  const raw = await kv.get(id);
  const today = nowDateYMD();
  if (!raw) {
    return { date: today, count: 0, results: [] as any[] };
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed.date !== today) {
      parsed.date = today;
      parsed.count = 0;
      parsed.results = [];
    }
    return parsed;
  } catch (e) {
    return { date: today, count: 0, results: [] as any[] };
  }
}

async function writeFishingRecord(kv: KVNamespace, id: string, rec: any) {
  await kv.put(id, JSON.stringify(rec));
}

function showFishingRecord(fishingRecord: any): string {
  const todayCount = fishingRecord.count || 0;
  let resultText = `<blockquote expandable><b>今日钓鱼记录</b>：\n`;
  if (Array.isArray(fishingRecord.results) && fishingRecord.results.length > 0) {
    // 最近的放到最前面
    const list = fishingRecord.results.slice().reverse();
    list.forEach((r: any, idx: number) => {
      resultText += `<b>第${idx + 1}次：</b>花费 ${escapeHtml(String(r.baitCost))} 💰，`;
      if (r.hooked) {
        // r.fishValue 可能是名称或数字，兼容显示
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

export async function handleFish(parsed: ParsedUpdate, env: FishEnv): Promise<void> {
  const kvCoin = env.COIN_KV;
  const kvRecord = env.FISHING_RECORD_KV;
  const botName = env.BOT_USERNAME || "";

  const chatId = parsed.chatId;
  const threadId = parsed.threadId;
  const from = parsed.from ?? parsed.message?.from;
  if (!chatId || !from) {
    console.error("[fish] 缺少 chatId 或 from，跳过");
    return;
  }
  const userIdStr = String(from.id);
  const userNameSafe = escapeHtml(String(from.first_name ?? from.username ?? "钓鱼者"));

  // 仅在特定房间/主题允许钓鱼（保留原逻辑的房间/主题判断）
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

  // ---- 回调阶段：用户点了拉杆按钮（callback_query） ----
  if (parsed.type === "callback_query") {
    // parsed.callbackData 可能是字符串或 object；我们需要字符串 "fish_pull:ownerId:strength:baitCost"
    const rawData = typeof parsed.callbackData === "string" ? parsed.callbackData : undefined;
    if (!rawData || !rawData.startsWith("fish_pull:")) {
      // 不是我们的回调，忽略
      return;
    }

    // parse data
    const parts = rawData.split(":");
    // parts: ["fish_pull", ownerId, strength, baitCost]
    const ownerIdStr = parts[1];
    const strength = Math.max(1, parseInt(parts[2] || "1", 10) || 1);
    const baitCost = Math.max(1, parseInt(parts[3] || "1", 10) || 1);

    const clickerId = parsed.callbackQuery?.from?.id;
    // 只有发起者本人可以拉杆
    if (clickerId !== Number(ownerIdStr)) {
      // 回应 callback 提示（带弹窗）
      await TgMessage.answerCallbackQuery(env, parsed.callbackQuery!.id, {
        text: `只有发起者本人可以拉杆哦！`,
        show_alert: true
      });
      return;
    }

    // 读取起始时间（机器人发送的“抛竿中”消息的 date），parsed.message.date 是秒级时间
    const startTs = parsed.message?.date ?? Math.floor(Date.now() / 1000);
    const nowTs = Math.floor(Date.now() / 1000);
    let seconds = nowTs - startTs;
    if (seconds < 0) seconds = 0;

    const rawScore = seconds * strength;
    const score = Math.floor(rawScore);

    // 读取用户余额与钓鱼记录
    const currentBal = await coinGetBalance(kvCoin, ownerIdStr);
    const fishingRecord = await readFishingRecord(kvRecord, ownerIdStr);

    // 先处理明显失败与过度失败
    if (score < 100) {
      fishingRecord.results.push({ baitCost, hooked: false, fishValue: 0 });
      fishingRecord.count = (fishingRecord.count || 0) + 1;
      await writeFishingRecord(kvRecord, ownerIdStr, fishingRecord);

      const fishingRecordText = showFishingRecord(fishingRecord);
      const resultText =
        `${userNameSafe} 拉杆！\n` +
        `😕 没有咬钩……这次空手而归。\n\n` +
        `本次花费 ${baitCost} 💰鱼饵，未获得渔获；最新余额 ${currentBal} 💰。\n\n` +
        fishingRecordText;

      await TgMessage.editMessageText(env, {
        chat_id: chatId,
        message_id: parsed.message!.message_id!,
        text: resultText,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [] }
      });
      return;
    }

    if (score > 1000) {
      fishingRecord.results.push({ baitCost, hooked: false, fishValue: 0 });
      fishingRecord.count = (fishingRecord.count || 0) + 1;
      await writeFishingRecord(kvRecord, ownerIdStr, fishingRecord);

      const fishingRecordText = showFishingRecord(fishingRecord);
      const resultText =
        `${userNameSafe} 鱼跑了！\n` +
        `💥 力道太大或等待太久，鱼儿挣脱了。\n\n` +
        `本次花费 ${baitCost} 💰鱼饵，未获得渔获；最新余额 ${currentBal} 💰。\n\n` +
        fishingRecordText;

      await TgMessage.editMessageText(env, {
        chat_id: chatId,
        message_id: parsed.message!.message_id!,
        text: resultText,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [] }
      });
      return;
    }

    // 中等分数：选鱼并判断上钩概率
    const fishList = [
      { name: "🍾破损漂流瓶", hookRate: 0.6, value: 1 },
      { name: "🪵浮木", hookRate: 0.6, value: 1 },
      { name: "👢没用的靴子", hookRate: 0.6, value: 1 },
      { name: "🌿绿海草", hookRate: 0.6, value: 1 },
      { name: "<tg-spoiler>🩸用过的避孕套</tg-spoiler>", hookRate: 0.6, value: 1 },

      { name: "🐚回音海螺", hookRate: 0.4, value: 2 },
      { name: "🦀三钳蟹", hookRate: 0.4, value: 2 },
      { name: "🦐樱花虾", hookRate: 0.4, value: 2 },
      { name: "🌿蓝海草", hookRate: 0.4, value: 2 },
      { name: "🐟沙丁鱼", hookRate: 0.4, value: 2 },
      { name: "<tg-spoiler>🔵跳蛋</tg-spoiler>", hookRate: 0.4, value: 2 },

      { name: "🐡红刺豚", hookRate: 0.35, value: 2 },
      { name: "🐟蓝鳍鱼", hookRate: 0.35, value: 2 },
      { name: "🐠带刺石斑", hookRate: 0.35, value: 2 },
      { name: "🐟石楠花鱼", hookRate: 0.35, value: 2 },
      { name: "🐟穴鱼", hookRate: 0.35, value: 2 },
      { name: "🐡球绒鱼", hookRate: 0.35, value: 2 },
      { name: "🐟芒果鱼", hookRate: 0.35, value: 2 },
      { name: "<tg-spoiler>📿项圈</tg-spoiler>", hookRate: 0.35, value: 2 },

      { name: "🐟弧光鱼", hookRate: 0.3, value: 3 },
      { name: "🐟兔鱼", hookRate: 0.3, value: 3 },
      { name: "🪼夜光水母", hookRate: 0.3, value: 3 },
      { name: "<tg-spoiler>⚡震动棒</tg-spoiler>", hookRate: 0.3, value: 3 },
      { name: "<tg-spoiler>🍆假阳具</tg-spoiler>", hookRate: 0.3, value: 3 },

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

      { name: "🐬彩虹海豚", hookRate: 0.2, value: 7 },
      { name: "🌊风暴海鲈", hookRate: 0.2, value: 7 },
      { name: "🌹玫瑰海胆", hookRate: 0.2, value: 7 },
      { name: "🐟冰原鲳", hookRate: 0.2, value: 7 },
      { name: "🪸珊瑚海马", hookRate: 0.2, value: 7 },
      { name: "🛡️骑士鱼", hookRate: 0.2, value: 7 },
      { name: "💖爱心鱼", hookRate: 0.2, value: 7 },
      { name: "🐠阴蒂鱼", hookRate: 0.2, value: 7 },

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

      { name: "🦈龙牙鲨", hookRate: 0.1, value: 13 },
      { name: "🐍巨角蟒", hookRate: 0.1, value: 13 },
      { name: "🐱猫鱼", hookRate: 0.1, value: 13 }
    ];

    // 将 score 归一化到 0..1（100 -> 0，1000 -> 1）
    const norm = (score - 100) / (1000 - 100);
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

    // 鱼饵对上钩概率的微幅提升（每 1 点 baitCost 提升 0.1）
    const jitter = 0.1 * baitCost;
    const finalHookProb = Math.max(0, Math.min(1, chosen.hookRate + jitter));
    const hooked = Math.random() < finalHookProb;

    // 处理结果：如果钓中 -> 用户余额 +value，国库 -= value；否则仅记录失败
    let resultText = `${userNameSafe} 拉杆！\n`;
    if (hooked) {
      // 用户加钱
      const userOld = await coinGetBalance(kvCoin, ownerIdStr);
      const userNew = userOld + chosen.value;
      await coinSetBalance(kvCoin, ownerIdStr, userNew);

      // 国库出钱（允许负数）：读取当前国库然后直接写回 treasury - payout
      const treOld = await getTreasury(kvCoin);
      const treNew = treOld - chosen.value;
      // 直接使用 coin.setBalance 修改国库余额（允许变成负数）
      await coinSetBalance(kvCoin, TREASURY_KEY, treNew);

      resultText += `🎉 成功钓上：<b>${chosen.name}</b>！本次花费 ${baitCost} 💰鱼饵，获得 ${chosen.value} 💰渔获。\n` +
        `你的新余额：${userNew} 💰。国库结余：${treNew} 💰。\n\n`;
      fishingRecord.results.push({ baitCost, hooked: true, fishValue: chosen.name });
    } else {
      resultText += `😣 有鱼咬住了，但它挣脱了！本次花费 ${baitCost} 💰鱼饵，未获得渔获；最新余额 ${currentBal} 💰。\n\n`;
      fishingRecord.results.push({ baitCost, hooked: false, fishValue: 0 });
    }

    fishingRecord.count = (fishingRecord.count || 0) + 1;
    await writeFishingRecord(kvRecord, ownerIdStr, fishingRecord);

    resultText += showFishingRecord(fishingRecord);

    // 编辑原始“抛竿中”消息显示结果
    await TgMessage.editMessageText(env, {
      chat_id: chatId,
      message_id: parsed.message!.message_id!,
      text: resultText,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [] }
    });

    return;
  }

  // ---- 发起阶段：命令 /fish N ----
  // 使用 parseCommand 的结果（parseUpdate 已把 command/args 放到 parsed）
  if (parsed.isCommand && parsed.command === "fish") {
    const arg = parsed.args && parsed.args[0] ? parsed.args[0] : null;
    const baitCost = Math.max(1, parseInt(String(arg || ""), 10) || 1);
    const ownerId = Number(from.id);

    // 检查今日钓鱼次数上限
    const fishingRecord = await readFishingRecord(kvRecord, String(ownerId));
    if ((fishingRecord.count || 0) >= 10) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${userNameSafe}，今天已经钓了 10 次，不能再钓了。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    // 检查余额是否足够支付鱼饵
    const currentBal = await coinGetBalance(kvCoin, String(ownerId));
    if (currentBal < baitCost) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${userNameSafe}，你的余额不足，当前只有 ${currentBal} 💰。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    // 扣除用户余额并把鱼饵费用加入国库
    const newUserBal = currentBal - baitCost;
    await coinSetBalance(kvCoin, String(ownerId), newUserBal);
    await addToTreasury(kvCoin, baitCost);

    // 随机 strength（原实现用随机 1..100）
    const strength = Math.floor(Math.random() * 100) + 1;

    const castDesc =
      strength <= 10 ? "轻轻一抛，水面只泛起细碎涟漪，仿佛在对你低声耳语。" :
      strength <= 20 ? "划出一道优雅的弧线，浮漂微颤，风中夹着松香与海盐的气息。" :
      strength <= 30 ? "动作稳健，鱼线划破空气，落点处闪过一丝银色光芒。" :
      strength <= 40 ? "一记有力的抛投，水面溅起弧形水花，仿佛惊动了湖底的守护灵。" :
      strength <= 50 ? "力道十足，鱼线如弓弦绷直，周遭的空气也为之一振。" :
      strength <= 60 ? "蛮力与技巧并存，抛出之处泛起层层涟漪，似乎呼唤着深处巨影。" :
      strength <= 70 ? "这一抛带着烈风，鱼线像流星穿过晨雾，远方水域开始不安。" :
      strength <= 80 ? "宛如英雄挥矛，鱼线直刺深海，水下传来低沉的回应。" :
      strength <= 100 ? "强势一挥，几乎卷起周遭的风声，水面裂出一道光缝，古老鱼群被惊起。" :
      "以超凡之力甩出渔线！饵远飞天际！";

    const initText =
      `${userNameSafe} 花费 ${baitCost} 💰 的鱼饵后，抛出渔线，${castDesc}\n\n` +
      `点击下方的「🎣 拉杆」以收紧鱼线，迎接命运的回响\n（仅 ${userNameSafe} 本人可操作）。`;

    const callbackData = `fish_pull:${ownerId}:${strength}:${baitCost}`;

    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: initText,
      parse_mode: "HTML",
      message_thread_id: threadId,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🎣 拉杆", callback_data: callbackData }
          ]
        ]
      }
    });

    return;
  }

  // 默认提示（命令格式不正确）
  await TgMessage.sendText(env, {
    chat_id: chatId,
    text: `命令格式不正确。\n正确用法：/fish 【鱼饵花费💰（正整数）】\n例如：/fish 3`,
    parse_mode: "HTML",
    message_thread_id: threadId
  });
}
export default handleFish;
