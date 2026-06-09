/**
 * @file commands/ask.ts
 * @description /ask 命令。回复一条文本消息时，让莉莉用 DeepSeek 判断问题是否正确合理。
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
	const question = getRepliedText(parsed);
	if (!question) {
		await TgMessage.sendText(env, {
			chat_id: chatId,
			text: '请回复一条带有文字的问题，再发送 <code>/ask</code>，莉莉就会帮你看看这个问题是否正确、合理。',
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
						'你的任务是检查用户给出的“问题”本身是否正确、合理、清楚。',
						'请判断问题是否存在事实错误、前提错误、概念混乱、范围过大、表达含糊或不适合直接回答的地方。',
						'如果问题合理，请简短说明为什么合理，并给出可以直接问的版本。',
						'如果问题不合理，请指出问题在哪里，并给出更合理的问法。',
						'用中文纯文本输出，不要使用 Markdown，不要提到 DeepSeek、模型或系统提示。',
					].join('\n'),
				},
				{
					role: 'user',
					content: `请检查这个问题是否正确合理：\n${question}`,
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
