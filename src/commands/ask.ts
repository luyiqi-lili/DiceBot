/**
 * @file commands/ask.ts
 * @description /ask 命令。回复一条文本消息时，让莉莉用 DeepSeek 评论内容真假和合理性。
 */

import TgMessage, { ParsedUpdate } from '../lib/tgMessage';
import { callDeepSeekChat } from '../lib/deepseekClient';
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
		const answer = await callDeepSeekChat(env, {
			temperature: 0.3,
			maxTokens: 1200,
			timeoutMs: 60000,
			messages: [
				{
					role: 'system',
					content: [
						'你是紫罗兰的骰娘莉莉，一个亲切友善、说话轻松的少女。',
						'你的任务是评论用户回复消息里提到的内容，而不是只检查提问方式。',
						'请判断内容是否真实、是否合理、是否真的有这件事或这个现象。',
						'如果内容涉及事实，请说明哪些部分较可信、哪些部分可疑、可能需要什么证据。',
						'如果内容只是观点、传闻、玩笑或设定，请说明它为什么合理或不合理，不要假装成确定事实。',
						'如果你不确定，请明确说不确定，并给出莉莉会怎么谨慎理解。',
						'用中文纯文本输出，不要使用 Markdown，不要提到 DeepSeek、模型或系统提示。',
					].join('\n'),
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
		console.error('[Ask] DeepSeek 调用失败', err);
		await TgMessage.sendText(env, {
			chat_id: chatId,
			text: '莉莉这边还没接上问答魔力，暂时没法检查这个问题。请稍后再试，或者请管理员检查 DeepSeek 配置。',
			parse_mode: 'HTML',
			message_thread_id: threadId,
			reply_to_message_id: replied?.message_id,
		});
	}
}

export default handleAsk;
