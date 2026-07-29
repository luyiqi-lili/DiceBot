import type { Env } from '../index';
import TgMessage, { type ParsedUpdate } from '../lib/telegram';

function configured(value: unknown): boolean {
	return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
}

function mark(ready: boolean): string {
	return ready ? '✅ 已配置' : '❌ 未配置';
}

/**
 * Public, read-only runtime readiness summary.
 *
 * It deliberately reports only the presence of bindings and secrets. Running an
 * AI request for every group member would consume the shared AI quota and make
 * this diagnostic abusable; a successful configuration means the service is
 * ready to receive a normal /trans request, not that one was made here.
 */
export async function handleStatus(parsed: ParsedUpdate, env: Env): Promise<void> {
	const chatId = parsed.chatId ?? parsed.message?.chat?.id;
	if (!chatId) return;

	const geminiKeyReady = configured(env.GEMINI_API_KEY) || configured(env.GOOGLE_API_KEY) || configured(env.GOOGLE_API_KEYS);
	const geminiReady = configured(env.AI) && geminiKeyReady && configured(env.AI_GATEWAY_TOKEN);
	const text = [
		'🩺 <b>骰娘运行状态</b>',
		'',
		`🤖 Telegram Bot：${mark(configured(env.TOKEN))}`,
		`🗄️ 数据库 D1：${mark(Boolean(env.DB))}`,
		`📦 数据存储：${mark(Boolean(env.TGBOTCOUNT && env.NEWS_STORE && env.TOPIC_KV && env.BOOK_STORE && env.FISHING_RECORD_KV && env.FISH_KV && env.AFFECTION_KV && env.ITEM_STORE && env.COIN_KV))}`,
		`⚙️ Durable Objects：${mark(Boolean(env.COIN_DO && env.LOTTERY_DO))}`,
		`🔐 外部 API 密钥：${mark(configured(env.EXTERNAL_API_KEY))}`,
		'',
		'<b>AI</b>',
		`☁️ Workers AI：${mark(Boolean(env.AI))}`,
		`🚪 AI Gateway：${mark(configured(env.AI_GATEWAY_ID) && configured(env.AI_GATEWAY_TOKEN))}`,
		`🔑 Gemini API key：${geminiKeyReady ? '✅ 已配置（兼容旧 Google key）' : '❌ 未配置'}`,
		`🌐 Gemini 翻译：${geminiReady ? '✅ 已就绪' : '❌ 配置不完整'}`,
		`🧠 DeepSeek 审核密钥：${mark(configured(env.DEEPSEEK_API_KEY))}`,
		'',
		`🐙 GitHub 自动化：${mark(configured(env.GITHUB_REPOSITORY) && configured(env.GITHUB_TOKEN))}`,
		'',
		'<i>此命令仅检查运行时配置，不显示密钥内容，也不发起会消耗 AI 配额的请求。</i>',
	].join('\n');

	await TgMessage.sendText(env, {
		chat_id: chatId,
		text,
		parse_mode: 'HTML',
		message_thread_id: parsed.threadId,
	});
}

export default handleStatus;
