/**
 * @file commands/ask.ts
 * @description /ask 命令。回复一条文本消息时，让莉莉用 AI 评论内容真假和合理性。
 */

import TgMessage, { ParsedUpdate } from '../lib/telegram';
import { buildLilyAskSystemPrompt } from '../data/lilyPersona';
import { callAIChat } from '../lib/aiClient';
import { escapeHtml } from '../lib/util';
import type { Env } from '../index';

function getRepliedText(parsed: ParsedUpdate): string {
	const replied = parsed.replyToMessage ?? parsed.message?.reply_to_message;
	const text = replied?.text ?? replied?.caption ?? '';
	return String(text).trim();
}

export async function handleAsk(parsed: ParsedUpdate, env: Env): Promise<void> {
	const chatId = parsed.chatId || parsed.message?.chat?.id;
	const threadId = parsed.threadId ?? parsed.message?.message_thread_id;
	if (!chatId) return;

	const replied = parsed.replyToMessage ?? parsed.message?.reply_to_message;
	const content = getRepliedText(parsed);
	if (!content) {
		await TgMessage.sendText(env, {
			chat_id: chatId,
			text: '请回复一条带有文字的消息，再发送 <code>/ask</code>，莉莉就会帮你看看里面提到的事情是不是真的、合不合理。',
			parse_mode: 'HTML',
			message_thread_id: threadId,
		});
		return;
	}

	try {
		const answer = await callAIChat(env, {
			temperature: 0.3,
			maxTokens: 1200,
			timeoutMs: 30000,
			messages: [
				{
					role: 'system',
					content: buildLilyAskSystemPrompt(),
				},
				{
					role: 'user',
					content: `请评论这段内容提到的事情是否真实、是否合理、是否真的有这个事情：\n${content}`,
				},
			],
		});

		await TgMessage.sendText(env, {
			chat_id: chatId,
			text: `莉莉看了一下：\n\n<blockquote expandable>${escapeHtml(answer)}</blockquote>`,
			parse_mode: 'HTML',
			message_thread_id: threadId,
			reply_to_message_id: replied?.message_id,
		});
	} catch (err) {
		console.error('[Ask] AI 调用失败', err);
		await TgMessage.sendText(env, {
			chat_id: chatId,
			text: '莉莉这边还没接上问答魔力，暂时没法检查这个问题。请稍后再试，或者请管理员检查 AI 服务配置。',
			parse_mode: 'HTML',
			message_thread_id: threadId,
			reply_to_message_id: replied?.message_id,
		});
	}
}

export default handleAsk;
