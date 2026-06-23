// commands/whoami.ts
import type { ParsedUpdate, EnvLike } from '../lib/telegram';
import { GrammyApiLike, sendTextWithGrammy } from "../lib/grammyApi";
import { escapeHtml, deleteMarkup } from "../lib/util";

/**
 * whoami: 显示用户 / 被回复消息发送者的基本信息
 * - parsed: 已解析的 ParsedUpdate
 * - env: Worker 环境（需要包含 TOKEN / BOT_USERNAME 等）
 *
 * 额外功能：
 * - 如果回复的消息包含图片（photo[]）或图片类型的 document，额外在回复中包含该图片的 file_id
 * - 函数会返回该 file_id（string），若不存在则返回 null
 */
export async function handleWhoami(parsed: ParsedUpdate, env: EnvLike, api?: GrammyApiLike): Promise<string | null> {
    if (!parsed || parsed.type !== "message" || !parsed.message) {
        console.log("[whoami] 非 message 或缺少 message，忽略");
        return null;
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

    // 检查被回复消息中是否包含图片（photo 或 image document）
    let mediaFileId: string | null = null;
    if (parsed.isReply && parsed.replyToMessage) {
        const rt = parsed.replyToMessage;
        // photo 是数组，最后一项通常是最大尺寸
        if (rt.photo && Array.isArray(rt.photo) && rt.photo.length > 0) {
            const best = rt.photo[rt.photo.length - 1];
            if (best && best.file_id) {
                mediaFileId = String(best.file_id);
            }
        } else if (rt.document && typeof rt.document === "object") {
            const doc: any = rt.document;
            // 当 document 的 mime_type 表示图片时，也当作图片处理
            if (doc.file_id && typeof doc.mime_type === "string" && doc.mime_type.startsWith("image")) {
                mediaFileId = String(doc.file_id);
            }
        }
    }

    // 如果存在 mediaFileId，则在文本中附加显示
    const mediaLine = mediaFileId ? `图片 file_id：<code>${escapeHtml(mediaFileId)}</code>\n` : "";

    const replyText =
        `${targetLabel} 的用户信息：\n` +
        `用户 ID：<code>${escapeHtml(String(userId))}</code>\n` +
        `展示名：<code>${userDisplay}</code>\n` +
        (username ? `用户名：<code>${escapeHtml(username)}</code>\n` : "") +
        `群组 ID：<code>${escapeHtml(String(chatId))}</code>\n` +
        `群组名称：<code>${escapeHtml(chatTitle)}</code>\n` +
        threadInfo +
        mediaLine;

    try {
        await sendTextWithGrammy(env, {
            chat_id: chatId,
            text: replyText,
            parse_mode: "HTML",
            message_thread_id: threadId,
            reply_markup: deleteMarkup
        }, api);
    } catch (err) {
        console.error("[whoami] 发送消息失败", err);
    }

    return mediaFileId;
}

export default handleWhoami;
