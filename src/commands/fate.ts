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

    if (isInterpret) {
        // --- 完整的 if (isInterpret) 分支（直接替换你现有文件中的同一段） ---
        if (isInterpret) {
            // 权限/线程判断（保留你原有的限制）
            const allowed =
                (chatId === -1002848481881 && [66].includes(threadId as number)) ||
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

            // 检查余额（提示但不立即扣款；扣款在解析完成后执行）
            try {
                const coinBal = await getBalance(env.COIN_KV, String(fromId));
                console.log(`💳 [handleFate] ${fromName} 当前余额 ${coinBal} 💰`);
                if (coinBal < 5) {
                    await TgMessage.sendText(env, {
                        chat_id: chatId,
                        text: `❌ ${fromName} 的余额不足，解析一次需要 5 💰，当前余额 ${coinBal} 💰。`,
                        parse_mode: "HTML",
                        message_thread_id: threadId
                    });
                    return;
                }
            } catch (e) {
                console.warn("🔮 [handleFate] 检查余额失败，允许继续尝试解析但会在结算时报错", e);
            }

            // --- 构造 prompt ---
            const systemInstruction =
                "你是一个精通塔罗牌牌义解析的骰娘名叫莉莉，使用幽默诙谐,使用带有感情比喻的日式RPG风格的口气，自然的输出内容，绝对不要使用Markdown格式，不要假定用户的性别，使用更加中性的用户称谓。";
            const userPrompt = `下面是一组 ${fromName} 抽取的三张大阿卡那塔罗牌及位置：\n${cap}\n请首先分别对"昨天"、"今天"、"明天"位置上的塔罗牌含义进行基本解读，然后综合三张卡片给出一个包括[占卜结果、建议、谶语、未来趋势及注意事项]的解析。绝对不要使用Markdown格式。`;

            // 发送占位消息（用于后续 edit）
            let placeholderRes;
            try {
                placeholderRes = await TgMessage.sendText(env, {
                    chat_id: chatId,
                    text: `🔮 莉莉正在解读牌义，请稍候……`,
                    parse_mode: "HTML",
                    message_thread_id: threadId
                });
            } catch (e) {
                console.error("🔮 [handleFate] 发送占位消息失败，放弃流式解析", e);
                // 回退：告知用户失败
                await TgMessage.sendText(env, {
                    chat_id: chatId,
                    text: `❌ 无法开始解析（发送占位消息失败），请稍后重试。`,
                    parse_mode: "HTML",
                    message_thread_id: threadId
                });
                return;
            }

            // 提取 message_id（兼容不同返回结构）
            const messageId =
                (placeholderRes && (placeholderRes as any).result && (placeholderRes as any).result.message_id) ||
                (placeholderRes && (placeholderRes as any).result && (placeholderRes as any).result.message && (placeholderRes as any).result.message.message_id) ||
                undefined;

            // 如果 messageId 无法获取，也继续，但不能做 edit（日志记录）
            if (!messageId) {
                console.warn("🔮 [handleFate] 占位消息发送成功但未取到 message_id，后续无法编辑占位消息");
            }

            // 选择 model 与 api key
            const model = "gemini-2.5-flash";
            const apiKeys: string[] = (env.GOOGLE_API_KEYS as any) || [];
            if (!apiKeys.length) {
                // 无 API key：编辑占位为失败提示并返回
                if (messageId) {
                    await TgMessage.editMessageText(env, {
                        chat_id: chatId,
                        message_id: messageId,
                        text: `❌ 抱歉，当前无法进行牌义解析（未配置 API Key）。`,
                        parse_mode: "HTML"
                    });
                } else {
                    await TgMessage.sendText(env, {
                        chat_id: chatId,
                        text: `❌ 抱歉，当前无法进行牌义解析（未配置 API Key）。`,
                        parse_mode: "HTML",
                        message_thread_id: threadId
                    });
                }
                return;
            }
            const randomKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];

            // 构造 body（和非流式大体相同）
            const streamBody = {
                contents: [{ parts: [{ text: userPrompt }] }],
                systemInstruction: { parts: [{ text: systemInstruction }] },
                generationConfig: { thinkingConfig: { thinkingBudget: -1 } }
            };

            // 发起 stream 请求（使用 streamGenerateContent endpoint）
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent`;
            let res: Response;
            try {
                res = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-goog-api-key": randomKey
                    },
                    body: JSON.stringify(streamBody)
                    // 注意：在 Cloudflare Workers 中，长连接可能会受到平台限制
                });
            } catch (e) {
                console.error("🔮 [handleFate] 发起 stream 请求失败", e);
                if (messageId) {
                    await TgMessage.editMessageText(env, {
                        chat_id: chatId,
                        message_id: messageId,
                        text: `❌ 解析请求发起失败，请稍后重试。`,
                        parse_mode: "HTML"
                    });
                } else {
                    await TgMessage.sendText(env, {
                        chat_id: chatId,
                        text: `❌ 解析请求发起失败，请稍后重试。`,
                        parse_mode: "HTML",
                        message_thread_id: threadId
                    });
                }
                return;
            }

            if (!res.ok || !res.body) {
                console.error("🔮 [handleFate] stream 请求返回非 200 或无 body", await res.text().catch(() => "<no-body>"));
                if (messageId) {
                    await TgMessage.editMessageText(env, {
                        chat_id: chatId,
                        message_id: messageId,
                        text: `❌ 解析服务返回异常，请稍后重试。`,
                        parse_mode: "HTML"
                    });
                } else {
                    await TgMessage.sendText(env, {
                        chat_id: chatId,
                        text: `❌ 解析服务返回异常，请稍后重试。`,
                        parse_mode: "HTML",
                        message_thread_id: threadId
                    });
                }
                return;
            }

            // --- 开始流式读取并周期性 edit Telegram 消息 ---
            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let carry = "";
            let buffer = "";
            let lastEditTs = 0;
            const EDIT_INTERVAL_MS = 800; // 节流：每多少 ms 最多一次 edit
            const MIN_DELTA_CHARS = 30; // 当累计新增字符超过多少才 edit
            let lastSentLen = 0;

            // helper: 执行一次 edit（自动做 HTML 转义 & 长度限制）
            async function doEdit(force = false) {
                if (!messageId) return;
                const now = Date.now();
                if (!force && now - lastEditTs < EDIT_INTERVAL_MS) return;
                const delta = buffer.length - lastSentLen;
                if (!force && delta < MIN_DELTA_CHARS) return;
                // Telegram 文本长度限制 4096 字符，预留空间给尾注
                const MAX_LEN = 3900;
                let out = buffer;
                if (out.length > MAX_LEN) {
                    out = out.slice(0, MAX_LEN) + "…（输出已截断）";
                }
                const safe = escapeHtml(out);
                lastSentLen = buffer.length;
                lastEditTs = now;
                try {
                    await TgMessage.editMessageText(env, {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: "HTML",
                        text: `🔮 莉莉的解析（生成中）：\n\n${safe}`
                    });
                } catch (e) {
                    console.error("🔮 [handleFate] editMessageText 失败", e);
                }
            }

            // 逐 chunk 读取 SSE/NDJSON 风格流（兼容多种格式）
            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    carry += decoder.decode(value, { stream: true });

                    // SSE 风格：以 "\n\n" 分隔 event，NDJSON 可能以 "\n" 分隔 JSON
                    // 我们先按 "\n\n" 切分，最后那个可能是不完整片段，保留到 carry
                    const parts = carry.split("\n\n");
                    carry = parts.pop() || "";

                    for (const part of parts) {
                        // 每个 part 可能包含多行，取以 "data:" 开头的行合并
                        const lines = part.split("\n").map(l => l.trim()).filter(Boolean);
                        let dataStr = lines
                            .filter(l => l.startsWith("data:"))
                            .map(l => l.slice(5).trim())
                            .join("\n");

                        if (!dataStr) {
                            // 可能是直接纯文本片段
                            dataStr = lines.join("\n");
                        }

                        // 尝试解析 JSON，否则把其当成纯文本
                        let parsedChunk: string | null = null;
                        try {
                            const j = JSON.parse(dataStr);
                            // 常见可能的字段：
                            // - j.candidates[0].content.parts[0].text （最终或增量）
                            // - j.delta?.content 或 j.delta?.content?.parts...
                            if (j?.candidates && j.candidates[0]?.content?.parts?.[0]?.text) {
                                parsedChunk = j.candidates[0].content.parts[0].text;
                            } else if (typeof j?.delta === "string") {
                                parsedChunk = j.delta;
                            } else if (j?.delta?.content) {
                                // delta.content 可能为字符串或复杂结构
                                if (typeof j.delta.content === "string") parsedChunk = j.delta.content;
                                else if (Array.isArray(j.delta.content) && j.delta.content[0]?.parts?.[0]?.text) {
                                    parsedChunk = j.delta.content[0].parts[0].text;
                                } else if (j.delta.content?.parts?.[0]?.text) {
                                    parsedChunk = j.delta.content.parts[0].text;
                                }
                            } else if (typeof j.text === "string") {
                                parsedChunk = j.text;
                            } else {
                                // 兜底：把整个 JSON stringify 当文本（谨慎）
                                parsedChunk = typeof j === "string" ? j : JSON.stringify(j);
                            }
                        } catch (err) {
                            // 不是 JSON，就把 dataStr 直接当作文本片段
                            parsedChunk = dataStr;
                        }

                        if (parsedChunk) {
                            // append
                            buffer += parsedChunk;
                            // 尝试编辑（节流内部控制）
                            await doEdit();
                        }
                    }
                }

                // 最后剩下的 carry（可能最后一个片段）
                if (carry) {
                    // 可能是 JSON 行或纯文本
                    let lastChunk: string | null = null;
                    try {
                        const j = JSON.parse(carry);
                        if (j?.candidates && j.candidates[0]?.content?.parts?.[0]?.text) {
                            lastChunk = j.candidates[0].content.parts[0].text;
                        } else if (j?.delta?.content) {
                            lastChunk = typeof j.delta.content === "string" ? j.delta.content : (j.delta.content?.parts?.[0]?.text ?? JSON.stringify(j.delta.content));
                        } else if (typeof j.text === "string") {
                            lastChunk = j.text;
                        } else {
                            lastChunk = JSON.stringify(j);
                        }
                    } catch {
                        lastChunk = carry;
                    }
                    if (lastChunk) {
                        buffer += lastChunk;
                    }
                }

                // 流结束，强制最后一次编辑
                await doEdit(true);

            } catch (streamErr) {
                console.error("🔮 [handleFate] 读取流时出错", streamErr);
                if (messageId) {
                    await TgMessage.editMessageText(env, {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: "HTML",
                        text: `❌ 解析过程中发生错误：${escapeHtml(String(streamErr))}`
                    });
                } else {
                    await TgMessage.sendText(env, {
                        chat_id: chatId,
                        text: `❌ 解析过程中发生错误：${escapeHtml(String(streamErr))}`,
                        parse_mode: "HTML",
                        message_thread_id: threadId
                    });
                }
                return;
            }

            // --- 流结束后处理最终结果与扣费 ---
            const finalText = buffer.trim();
            if (!finalText) {
                // 无输出
                if (messageId) {
                    await TgMessage.editMessageText(env, {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: "HTML",
                        text: `❌ 解析完成但未产生结果，请稍后重试。`
                    });
                } else {
                    await TgMessage.sendText(env, {
                        chat_id: chatId,
                        text: `❌ 解析完成但未产生结果，请稍后重试。`,
                        parse_mode: "HTML",
                        message_thread_id: threadId
                    });
                }
                return;
            }

            // 在显示最终结果之前，尝试从用户账户扣款并把钱转入国库
            let deducted = false;
            try {
                deducted = await deductFromBalance(env.COIN_KV, String(fromId), 5);
                if (!deducted) {
                    // 扣款失败（余额不足或并发问题）
                    console.warn("🔮 [handleFate] 扣款失败（余额或并发）");
                    // 编辑消息：让用户知道结果已生成但未能扣款
                    const safeOut = escapeHtml(finalText.length > 3500 ? finalText.slice(0, 3500) + "…（结果过长，已截断）" : finalText);
                    if (messageId) {
                        await TgMessage.editMessageText(env, {
                            chat_id: chatId,
                            message_id: messageId,
                            parse_mode: "HTML",
                            text: `🔮 解析已生成，但扣费失败（余额不足或系统错误），解析内容如下：\n\n${safeOut}\n\n❗请补足余额后联系管理员结算。`
                        });
                    } else {
                        await TgMessage.sendText(env, {
                            chat_id: chatId,
                            text: `🔮 解析已生成，但扣费失败（余额不足或系统错误），解析内容如下：\n\n${escapeHtml(finalText)}\n\n❗请补足余额后联系管理员结算。`,
                            parse_mode: "HTML",
                            message_thread_id: threadId
                        });
                    }
                    return;
                }
            } catch (e) {
                console.error("🔮 [handleFate] 扣款时发生异常", e);
                if (messageId) {
                    await TgMessage.editMessageText(env, {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: "HTML",
                        text: `❌ 扣费过程发生异常，解析已生成但未计费，请稍后重试或联系管理员。`
                    });
                } else {
                    await TgMessage.sendText(env, {
                        chat_id: chatId,
                        text: `❌ 扣费过程发生异常，解析已生成但未计费，请稍后重试或联系管理员。`,
                        parse_mode: "HTML",
                        message_thread_id: threadId
                    });
                }
                return;
            }

            // 扣款成功 -> 把钱加入国库
            try {
                await addToTreasury(env.COIN_KV, 5);
            } catch (e) {
                console.error("🔮 [handleFate] 将款项记入国库失败（已扣款，但入库失败）", e);
                // 仍继续：告知用户扣款成功，但国库记账异常
            }

            // 获取新余额用于提示
            let newBal = 0;
            try {
                newBal = await getBalance(env.COIN_KV, String(fromId));
            } catch (e) {
                console.warn("🔮 [handleFate] 获取新余额失败", e);
            }

            // 构造最终回显文本（附带扣除提示）
            const cardList = cap
                .split("\n")
                .map((line: string) => line.split("：")[1])
                .filter(Boolean)
                .join("、");

            const safeFinal = escapeHtml(finalText.length > 3500 ? finalText.slice(0, 3500) + "…（结果过长，已截断）" : finalText);
            const finalReply =
                `${fromName} 消耗了 5 💰（新余额 ${newBal}），请骰娘为三张牌 ${cardList} 进行解析，解析如下： <blockquote expandable>` +
                `${safeFinal}` +
                `</blockquote>`;

            // 最后一条编辑（把“生成中”消息替换为最终带扣费信息的内容）
            if (messageId) {
                try {
                    await TgMessage.editMessageText(env, {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: "HTML",
                        text: finalReply
                    });
                } catch (e) {
                    console.error("🔮 [handleFate] 最终 edit 失败，尝试 sendText 备用", e);
                    await TgMessage.sendText(env, {
                        chat_id: chatId,
                        text: finalReply,
                        parse_mode: "HTML",
                        message_thread_id: threadId
                    });
                }
            } else {
                await TgMessage.sendText(env, {
                    chat_id: chatId,
                    text: finalReply,
                    parse_mode: "HTML",
                    message_thread_id: threadId
                });
            }

            return;
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
