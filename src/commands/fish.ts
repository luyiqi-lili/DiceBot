// src/commands/fish.ts
export async function handleFish(msg: any, env: any): Record<string, any> {
    // 余额读写
    async function getBalance(id: string): Promise<number> {
        const raw = await env.COIN_KV.get(id);
        return raw ? parseInt(raw, 10) : 0;
    }
    async function setBalance(id: string, bal: number) {
        await env.COIN_KV.put(id, bal.toString());
    }

    const botName = env.BOT_USERNAME;
    const getId = (u: any) => u.first_name || "钓鱼者";

    // 兼容 message 和 callback_query
    const chat_id = msg.chat?.id ?? msg.message.chat.id;
    const thread_id = msg.message_thread_id ?? msg.message?.message_thread_id;

    // —— Callback 阶段：用户点了拉杆按钮，callback_data 格式： "fish_pull:<ownerId>:<strength>:<baitCost>" ——
    if (msg.data?.startsWith("fish_pull:")) {
        const parts = msg.data.split(":");
        // parts[0] = "fish_pull"
        const ownerIdStr = parts[1];
        const strengthStr = parts[2] || "1";
        const baitCostStr = parts[3] || "1";

        const ownerId = parseInt(ownerIdStr, 10);
        const strength = Math.max(1, parseInt(strengthStr, 10) || 1);
        const baitCost = Math.max(1, parseInt(baitCostStr, 10) || 1);

        const clickerId = msg.from?.id;
        const clickerName = getId(msg.from);
        const currentBal = await getBalance(ownerIdStr);

        // 只有发起者本人可以拉杆
        if (clickerId !== ownerId) {
            return {
                method: "answerCallbackQuery",
                callback_query_id: msg.id,
                text: `只有发起者本人可以拉杆哦：${ownerId === clickerId ? clickerName : "不是你"}`,
                show_alert: true
            };
        }

        // 计算时间差（秒）：用 bot 原始消息的 date 字段作为起点
        // msg.message.date 是机器人发送那条“抛竿中”消息的 Unix 时间（秒）
        const startTs = msg.message?.date ?? Math.floor(Date.now() / 1000);
        const nowTs = Math.floor(Date.now() / 1000);
        let seconds = nowTs - startTs;
        if (seconds < 0) seconds = 0;

        const rawScore = seconds * strength;
        const score = Math.floor(rawScore);

        // 根据 score 决定鱼获（你可以按需改这个映射）
        if (score < 100) {
            const resultText =
                `${getId(msg.from)} 拉杆！\n` +
                //                `拉杆用时：<b>${seconds}</b> 秒 × 力度 <b>${strength}</b> = 得分 <b>${score}</b>\n\n` +
                `😕 没有咬钩……这次空手而归。/n/n 本次花费 ${baitCost}💰鱼饵，没有渔获，最新余额 ${currentBal}💰 `;
            return {
                method: "editMessageText",
                chat_id,
                message_id: msg.message.message_id,
                parse_mode: "HTML",
                text: resultText,
                reply_markup: { inline_keyboard: [] }
            };
        }

        if (score > 1000) {
            const resultText =
                `${getId(msg.from)} 鱼跑了！\n` +
                //              `拉杆用时：<b>${seconds}</b> 秒 × 力度 <b>${strength}</b> = 得分 <b>${score}</b>\n\n` +
                `💥 力道太大/时间太久。下次小心点～/n/n 本次花费 ${baitCost}💰鱼饵，没有渔获，最新余额 ${currentBal}💰 `;
            return {
                method: "editMessageText",
                chat_id,
                message_id: msg.message.message_id,
                parse_mode: "HTML",
                text: resultText,
                reply_markup: { inline_keyboard: [] }
            };
        }

        // 介于 100 和 1000：两步判定
        // 1) 定义 10 种鱼（从常见到稀有），并设置稀有鱼更难上钩的 hookRate
        const fishList = [
            { name: "🪱 小虾", hookRate: 0.95, value: 1 },
            { name: "🐟 小鲫鱼", hookRate: 0.90, value: 2 },
            { name: "🐠 鲤鱼", hookRate: 0.85, value: 3 },
            { name: "🐡 黄花鱼", hookRate: 0.75, value: 4 },
            { name: "🐟 鲈鱼", hookRate: 0.65, value: 5 },
            { name: "🦈 海鲈", hookRate: 0.50, value: 6 },
            { name: "🐟 石斑鱼", hookRate: 0.35, value: 7 },
            { name: "🐋 金枪鱼", hookRate: 0.20, value: 8 },
            { name: "🦈 大白鲨", hookRate: 0.10, value: 9 },
            { name: "🐳 传说之鲸", hookRate: 0.03, value: 10 }
        ];

        // 将 score 归一到 0..1，100 -> 0, 1000 -> 1
        const norm = (score - 100) / (1000 - 100);
        const center = norm * (fishList.length - 1); // 期望索引中心（0..9）

        // 使用高斯式权重，使得 score 越高越偏向稀有鱼（索引越大）
        const sigma = 1.0; // 控制分布宽度，值越小越集中（可调）
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

        // 2) 钩上判定：根据 chosen.hookRate 再做一次随机判定
        const jitter = 0.1 * baitCost;
        console.log("鱼饵提供的概率:", jitter);
        console.log("鱼本身的概率:", chosen.hookRate);

        const finalHookProb = Math.max(0, Math.min(1, chosen.hookRate + jitter));
        console.log("实际生效的概率:", finalHookProb);

        const hooked = Math.random() < finalHookProb;

        let resultText = `${getId(msg.from)} 拉杆！\n`
        //        +`拉杆用时：<b>${seconds}</b> 秒 × 力度 <b>${strength}</b> = 得分 <b>${score}</b>\n\n`;

        if (hooked) {
            const newBal = currentBal + chosen.value;
            await setBalance(ownerIdStr, newBal);
            resultText += `🎉 成功钓上：<b>${chosen.name}</b> 💰，本次花费 ${baitCost}💰鱼饵，获得${chosen.value}💰渔获，最新余额 ${newBal}💰 `
        } else {
            // 失败：鱼挣脱（稀有鱼更容易挣脱）
            resultText += `😣 有鱼咬住了，但它挣脱了！想想看是因为运气还是力度～/n/n 本次花费 ${baitCost}💰鱼饵，没有渔获，最新余额 ${currentBal}💰 `;
        }




        return {
            method: "editMessageText",
            chat_id,
            message_id: msg.message.message_id,
            parse_mode: "HTML",
            text: resultText,
            reply_markup: { inline_keyboard: [] } // 移除按钮
        };
    }

    // —— 发起阶段：@Bot /fish 3 —— 
    // 支持写法：@BOT_USERNAME /fish 3
    const m = msg.text?.match(new RegExp(`@${botName}\\s+/fish\\s+(\\d+)`, "i"));
    if (m) {
        const strength = Math.floor(Math.random() * 100) + 1;
        const baitCost = Math.max(1, parseInt(m[1], 10) || 1);
        const userName = getId(msg.from);
        const ownerId = msg.from.id;
        const currentBal = await getBalance(ownerId);
        if (currentBal < baitCost) {
            return {
                method: "sendMessage",
                chat_id: chat_id,
                text: `❌ ${userName}，你的余额不足，当前只有 ${currentBal} 💰。`,
                parse_mode: "HTML",
            };
        }
        const newBal = currentBal - baitCost;
        await setBalance(ownerId, newBal);

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
            `${userName} 花费${baitCost}💰的鱼饵后， 抛出渔线，${castDesc}\n\n` +
            `点击下方的「🎣 拉杆」以收紧鱼线，迎接命运的回响\n（仅 ${userName} 本人可操作）。`;

        // callback_data 里存 ownerId 和 strength，实际计算时使用 msg.message.date（由 Telegram 提供）
        const callbackData = `fish_pull:${ownerId}:${strength}:${baitCost}`;

        return {
            chat_id,
            text: initText,
            parse_mode: "HTML",
            ...(thread_id && { message_thread_id: thread_id }),
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "🎣 拉杆",
                            callback_data: callbackData
                        }
                    ]
                ]
            }
        };
    }

    // 默认：命令格式错误提示
    return {
        chat_id,
        text: `命令格式不正确。\n正确用法：@${botName} /fish 【鱼饵花费💰（正整数）】\n例如：@${botName} /fish 3`,
        parse_mode: "HTML"
    };
}
