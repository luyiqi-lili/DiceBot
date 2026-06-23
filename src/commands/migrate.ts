// commands/migrate.ts
import TgMessage, { ParsedUpdate } from '../lib/telegram';

type Env = {
    TOKEN: string;
    BOT_USERNAME: string;
    COIN_KV: KVNamespace;
    COIN_DO: DurableObjectNamespace;
};

/**
 * 截断长文本用于展示（避免 Telegram 消息过长）
 */
function preview(text: string | null, n = 300) {
    if (!text) return "";
    if (text.length <= n) return text;
    return text.slice(0, n) + "...(truncated)";
}

/**
 * 是否跳过某些 key —— 默认为不过滤（全部迁移）
 * 如果你希望跳过 topic 房间键或只迁移数字用户键，可改这里的逻辑。
 */
function shouldSkipKey(key: string): boolean {
    // 示例：如果想跳过包含 '||' 的房间 key，取消注释下一行
    // if (key.includes("||")) return true;

    // 示例：如果想跳过国库键（TREASURY_KEY），取消注释并替换名称
    // if (key === "__treasury__") return true;

    return false;
}

/**
 * 将 key/value 写入 DO（假设 DO 提供 /put 接口，接受 JSON { key, value }）
 */
async function writeToDO(doNS: DurableObjectNamespace, namespaceName: string, key: string, value: string | null) {
    const id = doNS.idFromName(namespaceName);
    const stub = doNS.get(id);
    // 与 DO adapter 保持一致：POST /put JSON { key, value }
    const res = await stub.fetch(`https://do/put`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: value ?? "" })
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`DO write failed status=${res.status} body=${text}`);
    }
}

export async function handleMigrate(parsed: ParsedUpdate, env: Env): Promise<void> {
    console.log("[MIGRATE] invoked by", parsed.from?.id, "chat", parsed.chatId);

    if (!env.COIN_KV) {
        await TgMessage.sendText(env, {
            chat_id: parsed.chatId!,
            text: "❌ 未找到 COIN_KV 绑定，无法迁移。",
            parse_mode: "HTML",
            message_thread_id: parsed.threadId,
        });
        return;
    }
    if (!env.COIN_DO) {
        await TgMessage.sendText(env, {
            chat_id: parsed.chatId!,
            text: "❌ 未找到 COIN_DO Durable Object 绑定，无法迁移。",
            parse_mode: "HTML",
            message_thread_id: parsed.threadId,
        });
        return;
    }

    // DO namespace 名称，这里用 "coins"（与你创建 DO 时的 idFromName 保持一致）
    // 如果你的 DO idFromName 使用其他名字，请改成匹配的名称。
    const DO_NAME = "coins";

    const sendNotify = false; // 控制是否在每条迁移前后发送 TG 消息（true 会比较啰嗦）
    const previewLen = 300;

    let cursor: string | undefined = undefined;
    let migrated = 0;
    let failed = 0;
    let skipped = 0;
    let total = 0;

    // 先发一条开始消息
    await TgMessage.sendText(env, {
        chat_id: parsed.chatId!,
        text: `🔁 开始迁移 COIN KV → Durable Object（DO 名称：<code>${DO_NAME}</code>），请耐心等待...`,
        parse_mode: "HTML",
        message_thread_id: parsed.threadId,
    });

    try {
        do {
            const opts: any = cursor ? { cursor } : {};
            const res = await (env.COIN_KV as any).list(opts);
            cursor = res.cursor;
            const keys = res.keys || [];
            console.log(`[MIGRATE] list fetched ${keys.length} keys (cursor=${cursor})`);

            for (const k of keys) {
                const name: string = k.name;
                total++;
                try {
                    if (shouldSkipKey(name)) {
                        skipped++;
                        console.log(`[MIGRATE] 跳过 key=${name}`);
                        continue;
                    }

                    const raw = await env.COIN_KV.get(name);
                    const value = raw ?? "";

                    if (sendNotify) {
                        // 迁移前通知（展示 key 和 value preview）
                        const beforeText = `➡️ 准备迁移：<code>${name}</code>\n` +
                            `值预览：<code>${preview(String(value), previewLen)}</code>\n\n` +
                            `正在写入 DO：<code>${DO_NAME}</code> ...`;

                        await TgMessage.sendText(env, {
                            chat_id: parsed.chatId!,
                            text: beforeText,
                            message_thread_id: parsed.threadId,
                            parse_mode: "HTML"
                        });
                    }

                    // 写入 DO
                    await writeToDO(env.COIN_DO, DO_NAME, name, value);

                    migrated++;
                    if (sendNotify) {
                        const afterText = `✅ 已迁移：<code>${name}</code>\n` +
                            `写入 DO 完成。`;
                        await TgMessage.sendText(env, {
                            chat_id: parsed.chatId!,
                            text: afterText,
                            message_thread_id: parsed.threadId,
                            parse_mode: "HTML"
                        });
                    }

                    console.log(`[MIGRATE] migrated ${name}`);
                } catch (e) {
                    failed++;
                    console.error(`[MIGRATE] failed migrating key=${k.name}`, e);
                    // 失败时给出一条错误提示（继续下一个）
                    await TgMessage.sendText(env, {
                        chat_id: parsed.chatId!,
                        text: `❌ 迁移失败：<code>${k.name}</code>\n错误：<pre>${String((e as any).message ?? e)}</pre>`,
                        message_thread_id: parsed.threadId,
                        parse_mode: "HTML"
                    });
                }
            }
        } while (cursor);
    } catch (e) {
        console.error("[MIGRATE] list error", e);
        await TgMessage.sendText(env, {
            chat_id: parsed.chatId!,
            text: `❌ 列表读取失败：${String((e as any).message ?? e)}`,
            message_thread_id: parsed.threadId,
            parse_mode: "HTML",
        });
    }

    const summary = `✅ 迁移完成\n总 key 数：${total}\n成功：${migrated}\n失败：${failed}\n跳过：${skipped}`;
    await TgMessage.sendText(env, {
        chat_id: parsed.chatId!,
        text: summary,
        message_thread_id: parsed.threadId,
        parse_mode: "HTML",
    });

    console.log("[MIGRATE] done", { total, migrated, failed, skipped });
}
