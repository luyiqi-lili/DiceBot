/**
 * @file commands/fate.ts
 * @description 塔罗占卜命令处理器（/fate）。
 *   功能：
 *   - 抽牌：从大阿尔卡纳中随机抽取 3 张牌，对应昨天/今天/明天
 *   - 解析：回复已抽牌的消息，调用 DeepSeek API 进行 AI 牌义解读（消耗 5 💰）
 */

import TgMessage, { ParsedUpdate } from "../lib/tgMessage";
import { MAJOR_ARCANA } from "../lib/liveConfig";
import { escapeHtml } from "../lib/util";
import { callDeepSeekChat } from "../lib/deepseekClient";

// 从 coin 模块复用 KV 操作函数
import { getBalance, addToTreasury } from "../lib/coinService";
 
import type { Env } from '../index';


export async function handleFate(parsed: ParsedUpdate, env: Env): Promise<void> {
    console.log("🔮 [handleFate] invoked, parsed.command:", parsed.command, "textPreview:", parsed.textPreview);

     const msg = parsed.message;
    if (!msg) {
        console.log("🔮 [handleFate] parsed.message 缺失，忽略");
        return;
    }

    const text = parsed.text ?? "";
    const replied = parsed.replyToMessage;
    const cap = (replied && (replied as any).caption) ? (replied as any).caption : "";

    console.log("🔍 [handleFate] text =", text);
    console.log("🔍 [handleFate] replied exists =", !!replied);
    console.log("🔍 [handleFate] cap =", cap);

    // 判断是否为解析请求：要求回复包含 昨天/今天/明天 三个关键词
    const isInterpret =
        /^(?:\/fate(?:@\w+)?|@\w+\s*\/fate(?:@\w+)?)/i.test(text) &&
        cap.includes("昨天") &&
        cap.includes("今天") &&
        cap.includes("明天");

    const chatId = parsed.chatId!;
    const threadId = parsed.threadId;
    const fromId = parsed.from?.id;
    const fromName = parsed.from?.first_name || "某人";

    // === 流式解析分支：替换你原来的 isInterpret 分支 ===
    if (isInterpret) {
        // 权限/线程判断（保留你原有的限制）
        const allowed =
            (chatId === -1002848481881 && [66].includes(threadId as number)) ||
            (chatId === -1002970430696 && [89].includes(threadId as number)) ||
            (chatId === -1002970430696 && [160].includes(threadId as number)) ||
            (chatId === -1002742074355 && [345].includes(threadId as number));
        if (!allowed) {
            await TgMessage.sendText(env, {
                chat_id: chatId,
                text: `✨这里的魔力有些稀薄……要不要回到莉莉熟悉的地方，让占卜的力量更完整地展现呢？...`,
                parse_mode: "HTML",
                message_thread_id: threadId
            });
            return;
        }

        // 先发一条“处理中”消息，后续用 editMessageText 更新为解析结果或错误提示
        let processingMsgId: number | undefined = undefined;
        try {
            const processingRes: any = await TgMessage.sendText(env, {
                chat_id: chatId,
                text: `🔮 ${escapeHtml(fromName)}，骰娘正在解析你的命运中，请稍等...`,
                parse_mode: "HTML",
                message_thread_id: threadId
            });
            // 从 TgMessage 返回值中取 message_id（兼容不同实现）
            processingMsgId = processingRes?.result?.message_id ?? processingRes?.result?.message?.message_id ?? undefined;
        } catch (e) {
            console.warn("🔮 [handleFate] 发送处理提示失败，继续执行解析流程", e);
            processingMsgId = undefined;
        }

        // 组装 prompt 并调用 DeepSeek API
        const systemInstruction =
            "你是一个精通塔罗牌牌义解析的骰娘名叫莉莉，使用幽默诙谐,使用带有感情比喻的日式RPG风格的口气，自然的输出内容，绝对不要使用Markdown格式，不要假定用户的性别，使用更加中性的用户称谓。";
        const userPrompt = `下面是一组 ${fromName} 抽取的三张大阿卡那塔罗牌及位置：\n${cap}\n请首先分别对"昨天"、"今天"、"明天"位置上的塔罗牌含义进行基本解读，然后综合三张卡片给出一个包括[占卜结果、建议、谶语、未来趋势及注意事项]的解析。绝对不要使用Markdown格式。`;

        let textOut: string | undefined;
        try {
            textOut = await callDeepSeekChat(env, {
                messages: [
                    { role: "system", content: systemInstruction },
                    { role: "user", content: userPrompt },
                ],
                temperature: 0.8,
                maxTokens: 1800,
                timeoutMs: 90000,
            });
        } catch (err) {
            console.error("🔮 [handleFate] 调用 DeepSeek API 失败", err);
            const failText = `❌ 解析服务调用失败，请稍后重试。`;
            if (processingMsgId) {
                await TgMessage.editMessageText(env, { chat_id: chatId, message_id: processingMsgId, text: failText, parse_mode: "HTML" });
            } else {
                await TgMessage.sendText(env, { chat_id: chatId, text: failText, parse_mode: "HTML", message_thread_id: threadId });
            }
            return;
        }

        if (!textOut) {
            const failText = `❌ 解析未返回有效内容，请稍后重试。`;
            if (processingMsgId) {
                await TgMessage.editMessageText(env, { chat_id: chatId, message_id: processingMsgId, text: failText, parse_mode: "HTML" });
            } else {
                await TgMessage.sendText(env, { chat_id: chatId, text: failText, parse_mode: "HTML", message_thread_id: threadId });
            }
            return;
        }

        // 解析成功后尝试从用户扣费并把钱转入国库
        try {
            const deducted = await addToTreasury(env, env.COIN_DO, String(fromId), 5, "占卜费");
            if (!deducted) {
                const failText = `❌ 扣费失败（余额不足或系统错误），解析已生成但未能扣款。请先充值后重试。`;
                if (processingMsgId) {
                    await TgMessage.editMessageText(env, { chat_id: chatId, message_id: processingMsgId, text: failText, parse_mode: "HTML" });
                } else {
                    await TgMessage.sendText(env, { chat_id: chatId, text: failText, parse_mode: "HTML", message_thread_id: threadId });
                }
                return;
            }


            // 获取新余额用于提示
            const newBal = await getBalance(env.COIN_DO, String(fromId));

            const cardList = cap
                .split("\n")
                .map((line: string) => line.split("：")[1])
                .filter(Boolean)
                .join("、");

            const resultText = textOut || "解析失败，请稍后重试。";
            const final = `${escapeHtml(fromName)} 消耗了 5 💰（新余额 ${newBal}），请骰娘为三张牌 ${escapeHtml(cardList)} 进行解析，解析如下： <blockquote expandable>` +
                resultText +
                `</blockquote>`;

            if (processingMsgId) {
                await TgMessage.editMessageText(env, {
                    chat_id: chatId,
                    message_id: processingMsgId,
                    parse_mode: "HTML",
                    text: final
                });
            } else {
                await TgMessage.sendText(env, {
                    chat_id: chatId,
                    text: final,
                    parse_mode: "HTML",
                    message_thread_id: threadId
                });
            }
            return;
        } catch (err) {
            console.error("🔮 [handleFate] 扣费或入国库过程中出错", err);
            // 尝试提示并（如果可能）返还（这里简单提示）
            const failText = `❌ 解析完成但扣费/入库时发生错误，已记录。请联系管理员。`;
            if (processingMsgId) {
                await TgMessage.editMessageText(env, { chat_id: chatId, message_id: processingMsgId, text: failText, parse_mode: "HTML" });
            } else {
                await TgMessage.sendText(env, { chat_id: chatId, text: failText, parse_mode: "HTML", message_thread_id: threadId });
            }
            return;
        }
    }

    // --- 抽牌流程 ---
    console.log("🎴 [handleFate] 执行抽牌流程");
    const pickCount = 3;
    const indices: number[] = [];
    while (indices.length < pickCount) {
        const idx = Math.floor(Math.random() * MAJOR_ARCANA.length);
        if (!indices.includes(idx)) {
            indices.push(idx);
            console.log(`🎲 [handleFate] 选中牌索引: ${idx} (${MAJOR_ARCANA[idx].name})`);
        }
    }

    const positions = ["昨天", "今天", "明天"];
    const order = [1, 0, 2]; // 发送顺序为：今天、昨天、明天

    const media = order.map((posIdx, j) => {
        const card = MAJOR_ARCANA[indices[posIdx]];
        const entry: any = { type: "photo", media: card.file };
        if (j === 0) {
            const captionText = positions.map((pos, k) => `${pos}：${MAJOR_ARCANA[indices[k]].name}`).join("\n");
            entry.caption = captionText;
            entry.parse_mode = "HTML";
        }
        return entry;
    });

    try {
        await TgMessage.sendMediaGroup(env, {
            chat_id: chatId,
            media,
            message_thread_id: threadId
        });
    } catch (e) {
        console.error("🎴 [handleFate] 发送媒体组失败", e);
        // 若 sendMediaGroup 失败，可选择回退为逐张发送，这里保留日志并结束
    }
}
