// commands/whoami.ts
import TgMessage, { ParsedUpdate, EnvLike } from "../lib/tgMessage";
import {escapeHtml,deleteMarkup}  from "../lib/util";

/**
 * whoami: 显示用户 / 被回复消息发送者的基本信息
 * - parsed: 已解析的 ParsedUpdate
 * - env: Worker 环境（需要包含 TOKEN / BOT_USERNAME 等）
 */


export async function handleWhoami(parsed: ParsedUpdate, env: EnvLike): Promise<void> {
    if (!parsed || parsed.type !== "message" || !parsed.message) {
        console.log("[whoami] 非 message 或缺少 message，忽略");
        return;
    }

    const chatId = parsed.chatId!;
    const threadId = parsed.threadId;
    const message = parsed.message;
    const caller = parsed.from ?? message.from;

    // 当为回复消息时，优先查询被回复的消息的发送者
    let targetUser = caller;
    let targetLabel = "你";
    if (parsed.isReply && parsed.replyToMessage && parsed.replyToMessage.from) {
        targetUser = parsed.replyToMessage.from;
        targetLabel = "被回复的用户";
    }

    const userId = targetUser?.id ?? "(无ID)";
    const firstName = targetUser?.first_name ?? "";
    const username = targetUser?.username ? `@${targetUser.username}` : "";
    const userDisplay = escapeHtml(firstName || username || String(userId));

    // 群组信息
    const chat = message.chat || {};
    const chatTitle = chat.title || "(无群名)";

    // 主题/线程信息（存在则显示）
    const threadInfo = threadId ? `主题 ID：<code>${escapeHtml(String(threadId))}</code>\n` : "";

    const replyText =
        `${targetLabel} 的用户信息：\n` +
        `用户 ID：<code>${escapeHtml(String(userId))}</code>\n` +
        `展示名：<code>${userDisplay}</code>\n` +
        (username ? `用户名：<code>${escapeHtml(username)}</code>\n` : "") +
        `群组 ID：<code>${escapeHtml(String(chatId))}</code>\n` +
        `群组名称：<code>${escapeHtml(chatTitle)}</code>\n` +
        threadInfo;

    try {
        // 使用 TgMessage 发送（保留 forum thread）
        await TgMessage.sendText(env, {
            chat_id: chatId,
            text: replyText,
            parse_mode: "HTML",
            message_thread_id: threadId,
            reply_markup: deleteMarkup
        });
    } catch (err) {
        console.error("[whoami] 发送消息失败", err);
        // 回退到直接调用低级 send 接口，包含相同字段
        try {
            await TgMessage.send(env, "sendMessage", {
                chat_id: chatId,
                text: replyText,
                parse_mode: "HTML",
                message_thread_id: threadId
            });
        } catch (e) {
            console.error("[whoami] 回退发送也失败", e);
        }
    }
}

export default handleWhoami;
