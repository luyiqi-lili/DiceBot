import type { Env } from '../index';
import TgMessage, { type ParsedUpdate } from '../lib/telegram';
import { translateWithGemini } from '../lib/aiGateway';
import { escapeHtml } from '../lib/util';

export async function handleTrans(parsedMessage: ParsedUpdate, env: Env): Promise<void> {
	const chatId = parsedMessage.chatId ?? parsedMessage.message?.chat?.id;
	if (!chatId) return;
	const args = parsedMessage.args ?? [];
	const repliedText = parsedMessage.replyToMessage?.text ?? parsedMessage.message?.reply_to_message?.text;
	const [inlineTargetLanguage, ...inlineSource] = args;
	const inlineText = inlineSource.join(' ').trim();
	const isReplyTranslation = typeof repliedText === 'string' && repliedText.trim().length > 0;
	const targetLanguage = isReplyTranslation
		? args.join(' ').trim() || '简体中文'
		: inlineTargetLanguage;
	const text = isReplyTranslation ? repliedText.trim() : inlineText;
	if (!targetLanguage || !text) {
		await TgMessage.sendText(env, {
			chat_id: chatId,
			text: '请回复一条带有文本的消息，并发送 <code>/trans [目标语言]</code>。默认翻译为简体中文；也支持 <code>/trans English 你好，世界</code>。',
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
	console.log('[trans] Gemini translation result', result.status === 'ok'
		? { status: result.status, provider: result.provider }
		: { status: result.status, reason: result.reason });
	const reply = result.status === 'ok'
		? isReplyTranslation
			? `骰娘刚刚听到： 「${escapeHtml(text)}」\n翻译一下就是： 「${escapeHtml(result.text)}」`
			: `🌐 <b>${escapeHtml(targetLanguage)}</b>：\n${escapeHtml(result.text)}`
		: result.status === 'skipped'
			? '⚠️ 翻译服务尚未配置。'
			: '⚠️ 翻译服务暂时不可用，请稍后再试。';
	await TgMessage.sendText(env, {
		chat_id: chatId,
		text: reply,
		parse_mode: result.status === 'ok' ? 'HTML' : undefined,
		message_thread_id: parsedMessage.threadId,
	});
	console.log('[trans] Translation reply sent');
}

export default handleTrans;
