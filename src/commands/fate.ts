// commands/fate.ts
import TgMessage, { ParsedUpdate } from "../lib/tgMessage";

type Env = {
    TOKEN: string;
    BOT_USERNAME?: string;
    COIN_KV: KVNamespace;
    GOOGLE_API_KEYS?: string[]; // 可选：用于解析牌义
};

const MAJOR_ARCANA = [
    { name: "愚者", file: "https://luyiqi-lili.github.io/pic/0.jpg" },
    { name: "魔术师", file: "https://luyiqi-lili.github.io/pic/1.jpg" },
    { name: "女祭司", file: "https://luyiqi-lili.github.io/pic/2.jpg" },
    { name: "皇后", file: "https://luyiqi-lili.github.io/pic/3.jpg" },
    { name: "皇帝", file: "https://luyiqi-lili.github.io/pic/4.jpg" },
    { name: "教皇", file: "https://luyiqi-lili.github.io/pic/5.jpg" },
    { name: "恋人", file: "https://luyiqi-lili.github.io/pic/6.jpg" },
    { name: "战车", file: "https://luyiqi-lili.github.io/pic/7.jpg" },
    { name: "力量", file: "https://luyiqi-lili.github.io/pic/8.jpg" },
    { name: "隐者", file: "https://luyiqi-lili.github.io/pic/9.jpg" },
    { name: "命运之轮", file: "https://luyiqi-lili.github.io/pic/10.jpg" },
    { name: "正义", file: "https://luyiqi-lili.github.io/pic/11.jpg" },
    { name: "倒吊人", file: "https://luyiqi-lili.github.io/pic/12.jpg" },
    { name: "死亡", file: "https://luyiqi-lili.github.io/pic/13.jpg" },
    { name: "节制", file: "https://luyiqi-lili.github.io/pic/14.jpg" },
    { name: "恶魔", file: "https://luyiqi-lili.github.io/pic/15.jpg" },
    { name: "高塔", file: "https://luyiqi-lili.github.io/pic/16.jpg" },
    { name: "星星", file: "https://luyiqi-lili.github.io/pic/17.jpg" },
    { name: "月亮", file: "https://luyiqi-lili.github.io/pic/18.jpg" },
    { name: "太阳", file: "https://luyiqi-lili.github.io/pic/19.jpg" },
    { name: "审判", file: "https://luyiqi-lili.github.io/pic/20.jpg" },
    { name: "世界", file: "https://luyiqi-lili.github.io/pic/21.jpg" },
    { name: "逆愚者", file: "https://luyiqi-lili.github.io/pic/0d.jpg" },
    { name: "逆魔术师", file: "https://luyiqi-lili.github.io/pic/1d.jpg" },
    { name: "逆女祭司", file: "https://luyiqi-lili.github.io/pic/2d.jpg" },
    { name: "逆皇后", file: "https://luyiqi-lili.github.io/pic/3d.jpg" },
    { name: "逆皇帝", file: "https://luyiqi-lili.github.io/pic/4d.jpg" },
    { name: "逆教皇", file: "https://luyiqi-lili.github.io/pic/5d.jpg" },
    { name: "逆恋人", file: "https://luyiqi-lili.github.io/pic/6d.jpg" },
    { name: "逆战车", file: "https://luyiqi-lili.github.io/pic/7d.jpg" },
    { name: "逆力量", file: "https://luyiqi-lili.github.io/pic/8d.jpg" },
    { name: "逆隐者", file: "https://luyiqi-lili.github.io/pic/9d.jpg" },
    { name: "逆命运之轮", file: "https://luyiqi-lili.github.io/pic/10d.jpg" },
    { name: "逆正义", file: "https://luyiqi-lili.github.io/pic/11d.jpg" },
    { name: "逆倒吊人", file: "https://luyiqi-lili.github.io/pic/12d.jpg" },
    { name: "逆死亡", file: "https://luyiqi-lili.github.io/pic/13d.jpg" },
    { name: "逆节制", file: "https://luyiqi-lili.github.io/pic/14d.jpg" },
    { name: "逆恶魔", file: "https://luyiqi-lili.github.io/pic/15d.jpg" },
    { name: "逆高塔", file: "https://luyiqi-lili.github.io/pic/16d.jpg" },
    { name: "逆星星", file: "https://luyiqi-lili.github.io/pic/17d.jpg" },
    { name: "逆月亮", file: "https://luyiqi-lili.github.io/pic/18d.jpg" },
    { name: "逆太阳", file: "https://luyiqi-lili.github.io/pic/19d.jpg" },
    { name: "逆审判", file: "https://luyiqi-lili.github.io/pic/20d.jpg" },
    { name: "逆世界", file: "https://luyiqi-lili.github.io/pic/21d.jpg" }
];

function escapeHtml(s: string) {
    if (!s) return "";
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function getDateStr(date = new Date()) {
    return date.toISOString().slice(0, 10).replace(/-/g, "");
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

        // 查询余额并扣费
        try {
            const coinRaw = await env.COIN_KV.get(String(fromId));
            const coinBal = coinRaw ? parseInt(coinRaw, 10) : 0;
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

            // 构造 prompt
            const systemInstruction =
                "你是一个精通塔罗牌牌义解析的雌小鬼骰娘名叫莉莉，使用幽默诙谐,带有情色比喻的日式HRPG风格的口气，自然的输出内容，绝对不要使用Markdown格式，不要假定用户的性别，使用更加中性的用户称谓。";
            const userPrompt = `下面是一组 ${fromName} 抽取的三张大阿卡那塔罗牌及位置：\n${cap}\n请首先分别对\"昨天\"、\"今天\"、\"明天\"位置上的塔罗牌含义进行基本解读，然后综合三张卡片给出一个包括[占卜结果、建议、谶语、未来趋势及注意事项]的解析。绝对不要使用Markdown格式。`;

            const payload = {
                contents: [{ parts: [{ text: userPrompt }] }],
                systemInstruction: { parts: [{ text: systemInstruction }] },
                generationConfig: { thinkingConfig: { thinkingBudget: -1 } }
            };

            const apiKeys: string[] = (env.GOOGLE_API_KEYS as any) || [];
            if (!apiKeys.length) {
                console.warn("🔮 [handleFate] 未配置 GOOGLE_API_KEYS，跳过解析请求");
                await TgMessage.sendText(env, {
                    chat_id: chatId,
                    text: `❌ 抱歉，当前无法进行牌义解析（缺少 API Key）。`,
                    parse_mode: "HTML",
                    message_thread_id: threadId
                });
                return;
            }
            const randomKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];

            const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": randomKey
                },
                body: JSON.stringify(payload)
            });

            const j = await res.json();
            const candidates = j?.candidates;
            const textOut = candidates?.[0]?.content?.parts?.[0]?.text?.trim();

            // 仅在解析成功时扣费
            if (textOut) {
                await env.COIN_KV.put(String(fromId), String((parseInt((await env.COIN_KV.get(String(fromId))) || "0", 10) || 0) - 5));
                console.log(`💰 [handleFate] 从 ${fromName} 扣除 5 💰`);
            } else {
                console.warn("🔮 [handleFate] 解析未返回内容", j);
            }

            const cardList = cap
                .split("\n")
                .map((line: string) => line.split("：")[1])
                .filter(Boolean)
                .join("、");

            const resultText = textOut || "解析失败，请稍后重试。";
            const replyText =
                `${fromName} 消耗了 5 💰，请骰娘为三张牌 ${cardList} 进行解析，解析如下： <blockquote expandable>` +
                resultText +
                `</blockquote>`;

            await TgMessage.sendText(env, {
                chat_id: chatId,
                text: replyText,
                parse_mode: "HTML",
                message_thread_id: threadId
            });
            return;
        } catch (err) {
            console.error("🔮 [handleFate] 解析分支异常", err);
            await TgMessage.sendText(env, {
                chat_id: chatId,
                text: `❌ 解析失败，请稍后重试。`,
                parse_mode: "HTML",
                message_thread_id: threadId
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
    }
}
