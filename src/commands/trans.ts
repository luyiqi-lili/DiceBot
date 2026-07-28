import type { Env } from '../index';
import TgMessage, { type ParsedUpdate } from '../lib/telegram';
import { translateWithGemini } from '../lib/aiGateway';
import { escapeHtml } from '../lib/util';

export async function handleTrans(parsedMessage: ParsedUpdate, env: Env): Promise<void> {
	const chatId = parsedMessage.chatId ?? parsedMessage.message?.chat?.id;
	if (!chatId) return;
	const [targetLanguage, ...source] = parsedMessage.args ?? [];
	const text = source.join(' ').trim();
	if (!targetLanguage || !text) {
		await TgMessage.sendText(env, {
			chat_id: chatId,
			text: '用法：<code>/trans 目标语言 要翻译的文本</code>，例如 <code>/trans English 你好，世界</code>。',
			parse_mode: 'HTML',
			message_thread_id: parsedMessage.threadId,
		});
		return;
	}
	if (text.length > 8_000) {
		await TgMessage.sendText(env, {
			chat_id: chatId,
			text: '⚠️ 单次最多翻译 8000 个字符。',
			message_thread_id: parsedMessage.threadId,
		});
		return;
	}

	const result = await translateWithGemini(env, { targetLanguage, text });
	const reply = result.status === 'ok'
		? `🌐 <b>${escapeHtml(targetLanguage)}</b>：\n${escapeHtml(result.text)}`
		: result.status === 'skipped'
			? '⚠️ 翻译服务尚未配置。'
			: '⚠️ 翻译服务暂时不可用，请稍后再试。';
	await TgMessage.sendText(env, {
		chat_id: chatId,
		text: reply,
		parse_mode: result.status === 'ok' ? 'HTML' : undefined,
		message_thread_id: parsedMessage.threadId,
	});
}

export default handleTrans;
