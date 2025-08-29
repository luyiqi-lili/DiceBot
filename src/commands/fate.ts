// commands/fate.ts
import TgMessage, { ParsedUpdate } from "../lib/tgMessage";
import { MAJOR_ARCANA } from "../lib/liveConfig";

// 从 coin 模块复用 KV 操作函数
import { getBalance, deductFromBalance, addToTreasury } from "./coin";

type Env = {
    TOKEN: string;
    BOT_USERNAME?: string;
    COIN_KV: KVNamespace;
    GOOGLE_API_KEYS?: string[];
};

function escapeHtml(s: string) {
    if (!s) return "";
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

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
        // 发一条占位消息（用户会马上看到），保留 message_id 用于后续 edit
        const placeholderRes = await TgMessage.sendText(env, {
            chat_id: chatId,
            text: `🔮 莉莉正在解读牌义，开始准备解析……`,
            parse_mode: "HTML",
            message_thread_id: threadId
        });

        const message_id =
            placeholderRes?.result?.message_id ??
            placeholderRes?.result?.message?.message_id;

        // 立即从用户扣费（用户要求：开始解析就扣款）
        // 如果扣款失败（余额不足或其他原因），编辑占位消息并返回
        const deducted = await deductFromBalance(env.COIN_KV, String(fromId), 5);
        if (!deducted) {
            try {
                await TgMessage.editMessageText(env, {
                    chat_id: chatId,
                    message_id,
                    parse_mode: "HTML",
                    text: `❌ ${escapeHtml(fromName)} 的余额不足，解析一次需 5 💰。请充值后再试。`
                });
            } catch (e) {
                console.error("[fate][stream] edit insufficent-balance failed", e);
            }
            return;
        }

        // 把这笔钱记入国库（国库操作不影响用户体验；若失败仅记录日志）
        try {
            await addToTreasury(env.COIN_KV, 5);
        } catch (e) {
            console.error("[fate][stream] addToTreasury failed (non-fatal)", e);
            // 不回滚用户（按你要求：一旦开始即扣款），仅记录错误
        }

        // 获取新余额用于最终提示
        const newBal = await getBalance(env.COIN_KV, String(fromId));

        // 发送占位消息的同时开始流式请求到 Google Generative API
        const apiKeys: string[] = (env.GOOGLE_API_KEYS as any) || [];
        if (!apiKeys.length) {
            // 无 API key：告诉用户并结束（钱已扣）
            await TgMessage.editMessageText(env, {
                chat_id: chatId,
                message_id,
                parse_mode: "HTML",
                text: `❌ 抱歉，当前无法进行牌义解析（缺少 API Key）。已扣除的 5 💰 将进入国库。`
            });
            return;
        }

        const randomKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];
        const model = "gemini-2.5-flash"; // 可替换为你实际使用的 model 名称
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent`;
        const systemInstruction = '你是一个精通塔罗牌牌义解析的雌小鬼骰娘名叫莉莉，使用幽默诙谐,带有情色比喻的日式HRPG风格的口气，自然的输出内容，绝对不要使用Markdown格式，不要假定用户的性别，使用更加中性的用户称谓。';
        const userPrompt = '下面是一组 ${fromName} 抽取的三张大阿卡那塔罗牌及位置：\n${cap}\n请首先分别对"昨天"、"今天"、"明天"位置上的塔罗牌含义进行基本解读，然后综合三张卡片给出一个包括[占卜结果、建议、谶语、未来趋势及注意事项]的解析。绝对不要使用Markdown格式。';
        const streamBody = {
            contents: [{ parts: [{ text: userPrompt }] }],
            systemInstruction: { parts: [{ text: systemInstruction }] },
            generationConfig: { thinkingConfig: { thinkingBudget: -1 } }
        };

        let streamRes: Response;
        try {
            streamRes = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": randomKey
                },
                body: JSON.stringify(streamBody)
            });
        } catch (err) {
            console.error("[fate][stream] fetch error", err);
            await TgMessage.editMessageText(env, {
                chat_id: chatId,
                message_id,
                parse_mode: "HTML",
                text: `❌ 连接解析服务失败（网络异常）。已扣除的 5 💰 将进入国库。`
            });
            return;
        }

        if (!streamRes.ok || !streamRes.body) {
            const bodyText = await streamRes.text().catch(() => "");
            console.error("[fate][stream] stream endpoint returned non-ok:", streamRes.status, bodyText);
            await TgMessage.editMessageText(env, {
                chat_id: chatId,
                message_id,
                parse_mode: "HTML",
                text: `❌ 解析服务不可用（${streamRes.status}）。已扣除的 5 💰 将进入国库。`
            });
            return;
        }

        // 准备读取流并按块编辑 Telegram 消息
        const reader = streamRes.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let carry = "";
        let accumulated = ""; // 最终累积文本（未经 HTML 转义）
        let lastEditTs = 0;
        const EDIT_INTERVAL_MS = 800; // 最短编辑间隔
        const MIN_DELTA_CHARS = 50; // 累计多少新字符触发一次编辑
        let lastSentLength = 0;
        const TG_MAX = 3800; // 给 Telegram 留余地，4096 限制以内

        // helper: 安全编辑（节流 + 截断）
        async function tryEdit(force = false) {
            const now = Date.now();
            if (!message_id) return;
            const delta = accumulated.length - lastSentLength;
            if (!force && delta < MIN_DELTA_CHARS && now - lastEditTs < EDIT_INTERVAL_MS) return;
            // 截断过长内容
            let safe = accumulated;
            if (safe.length > TG_MAX) {
                safe = safe.slice(0, TG_MAX) + "\n\n（已截断，完整结果将保存在私聊或稍后补发）";
            }
            // HTML 转义
            safe = escapeHtml(safe);
            // 拼合提示（显示已扣款与余额）
            const header = `🔮 莉莉的解析（进行中） — 已扣 5 💰，剩余 ${newBal} 💰\n\n`;
            try {
                await TgMessage.editMessageText(env, {
                    chat_id: chatId,
                    message_id,
                    parse_mode: "HTML",
                    text: `${header}${safe}`
                });
                lastSentLength = accumulated.length;
                lastEditTs = now;
            } catch (e) {
                console.error("[fate][stream] edit error", e);
            }
        }

        // 读取流：兼容 SSE（data: ...）或纯 JSON 片段或纯文本
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                if (!value) continue;
                carry += decoder.decode(value, { stream: true });

                // 常见：SSE 风格以双换行分隔 events
                const parts = carry.split("\n\n");
                // 最后一个可能是不完整的片段，保留到 carry
                carry = parts.pop() || "";

                for (const part of parts) {
                    const lines = part.split("\n").map((l) => l.trim());
                    // 抽取 data: 开头的行（SSE）
                    const dataLines = lines.filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
                    const chunkStr = dataLines.length ? dataLines.join("\n") : part;

                    // 尝试解析为 JSON
                    let parsedChunk: string | null = null;
                    try {
                        const j = JSON.parse(chunkStr);
                        // 兼容几种可能结构
                        if (j.delta?.content && typeof j.delta.content === "string") parsedChunk = j.delta.content;
                        else if (j.candidates && j.candidates[0]?.content?.parts?.[0]?.text) parsedChunk = j.candidates[0].content.parts[0].text;
                        else if (typeof j.text === "string") parsedChunk = j.text;
                        else if (typeof j === "string") parsedChunk = j;
                    } catch (e) {
                        // 不是 JSON，则把 chunkStr 当纯文本片段
                        if (chunkStr && chunkStr.trim()) parsedChunk = chunkStr;
                    }

                    if (parsedChunk) {
                        // 合并到累计文本
                        accumulated += parsedChunk;
                        // 按阈值节流编辑
                        await tryEdit(false);
                    }
                }
            }

            // 流读取结束，做最终编辑（force）
            await tryEdit(true);

            // 最终结果（已转义）
            const finalSafe = escapeHtml(accumulated.slice(0, TG_MAX));
            const finalText =
                `${escapeHtml(fromName)} 消耗了 5 💰（新余额 ${newBal}），莉莉的解析如下：\n\n${finalSafe}`;

            // 最终编辑（清除“进行中”提示并展示完整结果）
            await TgMessage.editMessageText(env, {
                chat_id: chatId,
                message_id,
                parse_mode: "HTML",
                text: finalText
            });

            // 完成后可选择记录到 KV 或其它（此处不做）
            return;
        } catch (err) {
            console.error("[fate][stream] stream read/processing error", err);
            // 流中断或处理异常：告诉用户并保留已生成片段（已扣款，不回滚）
            const partial = escapeHtml(accumulated.slice(0, TG_MAX));
            await TgMessage.editMessageText(env, {
                chat_id: chatId,
                message_id,
                parse_mode: "HTML",
                text: `⚠️ 解析过程中发生错误，已保存部分结果（已扣 5 💰，新余额 ${newBal}）：\n\n${partial}\n\n（解析中断，请稍后重试或联系管理员。）`
            });
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
