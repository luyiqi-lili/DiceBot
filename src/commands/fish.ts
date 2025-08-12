// src/commands/fish.ts
export function handleFish(msg: any, env: any): Record<string, any> {
    const botName = env.BOT_USERNAME;
    const getId = (u: any) => u.first_name || "钓鱼者";

    // 兼容 message 和 callback_query
    const chat_id = msg.chat?.id ?? msg.message.chat.id;
    const thread_id = msg.message_thread_id ?? msg.message?.message_thread_id;

    // —— Callback 阶段：用户点了拉杆按钮，callback_data 格式： "fish_pull:<ownerId>:<strength>" ——
    if (msg.data?.startsWith("fish_pull:")) {
        const parts = msg.data.split(":");
        // parts[0] = "fish_pull"
        const ownerIdStr = parts[1];
        const strengthStr = parts[2] || "1";

        const ownerId = parseInt(ownerIdStr, 10);
        const strength = Math.max(1, parseInt(strengthStr, 10) || 1);

        const clickerId = msg.from?.id;
        const clickerName = getId(msg.from);

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
        let catchText = "";
        if (score < 50) {
            catchText = "🪱 一条小虾（小渔获）";
        } else if (score < 200) {
            catchText = "🐟 一条小鲫鱼";
        } else if (score < 500) {
            catchText = "🐠 一条鲤鱼";
        } else if (score < 1000) {
            catchText = "🦈 一条海鲈（罕见）";
        } else {
            catchText = "🐋 传说中的巨型鱼获！你太幸运了！";
        }

        const resultText =
            `${getId(msg.from)} 拉杆！\n` +
            `拉杆用时：<b>${seconds}</b> 秒 × 力度 <b>${strength}</b> = 得分 <b>${score}</b>\n\n` +
            `🎉 获得：${catchText}`;

        return {
            method: "editMessageText",
            chat_id,
            message_id: msg.message.message_id,
            parse_mode: "HTML",
            text: resultText,
            reply_markup: { inline_keyboard: [] } // 移除按钮
        };
    }

    // —— 发起阶段：@Bot /fish 50 —— 
    // 支持写法：@BOT_USERNAME /fish 50
    const m = msg.text?.match(new RegExp(`@${botName}\\s+/fish\\s+(\\d+)`, "i"));
    if (m) {
        const strength = Math.max(1, parseInt(m[1], 10) || 1);
        const userName = getId(msg.from);
        const ownerId = msg.from.id;

        const castDesc = (() => {
            if (strength <= 10) {
                return "轻轻一抛，水面只泛起细碎涟漪，仿佛在对你低声耳语。";
            } else if (strength <= 20) {
                return "抛出一线，浮漂微颤，风中夹着松香与海盐的气息。";
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
            `${userName} 抛出渔线，${castDesc}\n\n` +
            `点击下方的「🎣 拉杆」以收紧鱼线，迎接命运的回响（仅 ${userName} 本人可操作）。`;

        // callback_data 里存 ownerId 和 strength，实际计算时使用 msg.message.date（由 Telegram 提供）
        const callbackData = `fish_pull:${ownerId}:${strength}`;

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
        text: `命令格式不正确。\n正确用法：@${botName} /fish 【力度（正整数）】\n例如：@${botName} /fish 50`,
        parse_mode: "HTML"
    };
}
