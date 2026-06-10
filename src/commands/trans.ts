/**
 * @file commands/trans.ts
 * @description 翻译命令处理器（/trans）。
 *   通过回复一条消息并发送 /trans [目标语言] 来翻译文本。
 *   使用 AI 服务进行翻译。
 *   支持自定义目标语言，默认为简体中文。
 */
import TgMessage, { ParsedUpdate } from '../lib/tgMessage';
import { buildLilyTranslationSystemPrompt } from '../data/lilyPersona';
import { escapeHtml } from '../lib/util';
import { callAIChat } from '../lib/aiClient';
import type { Env } from '../index';

export async function handleTrans(parsedMessage: ParsedUpdate, env: Env) {
	console.log('[Trans] 🔍 进入 handleTrans (parsed)');

	const chatId = parsedMessage.chatId || parsedMessage.message?.chat?.id;
	const threadId = parsedMessage.threadId;
	if (!chatId) {
		console.error('[Trans] ⛔️ 无 chatId，无法发送回复');
		return;
	}

	const repliedText =
		(parsedMessage.replyToMessage && parsedMessage.replyToMessage.text) ??
		(parsedMessage.message && parsedMessage.message.reply_to_message && parsedMessage.message.reply_to_message.text) ??
		undefined;

	if (!repliedText) {
		console.log('[Trans] ⛔️ 未检测到回复消息或原始消息没有文本内容');
		await TgMessage.sendText(env, {
			chat_id: chatId,
			text: '请回复一条带有文本的消息，并在回复时发送 `/trans` 命令。',
			parse_mode: 'Markdown',
			message_thread_id: threadId,
		});
		return;
	}

	const originalText = parsedMessage.text || '';
	console.log('[Trans] 🧾 原始命令文本:', originalText);

	const botUsername = (env as any).BOT_USERNAME || '';
	const mentionRegex = botUsername ? new RegExp(`^@${botUsername}\\s*`, 'i') : /^@?\w+\s*/i;
	const cmdText = originalText.replace(mentionRegex, '').trim();
	console.log('[Trans] 🧾 处理后命令文本:', cmdText);

	const match = cmdText.match(/^\/trans(?:@\w+)?(?:\s+(.+))?/i);
	const targetLang = match && match[1] ? match[1].trim() : '简体中文';
	console.log('[Trans] 🌐 目标语言:', targetLang);

	try {
		console.log('[Trans] 📤 发送翻译请求，目标语言:', targetLang);

		// 构造系统提示和用户输入
		const userInput = `请将以下文本翻译为${targetLang}：\n${repliedText}`;

		const translationRaw = await callAIChat(env, {
			messages: [
				{
					role: 'system',
					content: buildLilyTranslationSystemPrompt(),
				},
				{
					role: 'user',
					content: userInput,
				},
			],
			maxTokens: 5000,
			temperature: 0.2,
			timeoutMs: 60000,
		});

		console.log('[Trans] ✅ 收到 AI 翻译响应');
		let translation = translationRaw.trim();

		console.log('[Trans] 🎯 提取的翻译文本:', translation);

		if (!translation || translation === '[object Object]') {
			console.log('[Trans] ⚠️ 翻译结果为空或无效');
			await TgMessage.sendText(env, {
				chat_id: chatId,
				text: '[翻译失败，未收到有效响应]',
				message_thread_id: threadId,
			});
			return;
		}

		// 清理响应中的推理过程（如果存在）
		translation = translation.replace(/SCENE THOUGHT:.*?\n\n?/gis, '');
		translation = translation.replace(/\[.*?思考.*?\].*?\n\n?/gis, '');
		translation = translation.replace(/思考过程：.*?\n\n?/gis, '');
		translation = translation.replace(/.*?reasoning:.*?\n\n?/gis, '');

		// 如果翻译过长，截取主要部分
		const maxLength = 2000; // Telegram消息限制
		if (translation.length > maxLength) {
			translation = translation.substring(0, maxLength) + '...';
		}

		console.log('[Trans] ✅ 清理后的翻译文本:', translation);

		const safeOriginal = escapeHtml(repliedText);
		const safeTranslation = escapeHtml(translation);

		const replyText = `骰娘刚刚听到： 「${safeOriginal}」\n翻译一下就是： 「${safeTranslation}」`;

		await TgMessage.sendText(env, {
			chat_id: chatId,
			text: replyText,
			parse_mode: 'HTML',
			message_thread_id: threadId,
		});

		return;
	} catch (e: any) {
		console.error('[Trans] ❌ 调用翻译 API 失败', e);

		let errorMessage = '⚠️ 翻译服务调用失败，请稍后重试。';

		if (e.message?.includes('timeout') || e.name === 'AbortError') {
			errorMessage = '⏰ 翻译请求超时，请稍后重试。';
		} else if (e.message?.includes('rate limit') || e.message?.includes('Rate limit')) {
			errorMessage = '🚫 请求频率过高，请稍后再试。';
		} else if (e.message?.includes('invalid') || e.message?.includes('Invalid')) {
			errorMessage = '❌ 请求参数无效，请检查命令格式。';
		} else if (e.message?.includes('DEEPSEEK') || e.message?.includes('DeepSeek') || e.message?.includes('AI_PROVIDER')) {
			errorMessage = '🔧 AI 服务配置错误，请检查 AI 配置。';
		}

		await TgMessage.sendText(env, {
			chat_id: chatId,
			text: errorMessage,
			message_thread_id: threadId,
		});
		return;
	}
}

export default handleTrans;
