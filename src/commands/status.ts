import type { Env } from '../index';
import TgMessage, { type ParsedUpdate } from '../lib/telegram';

function configured(value: unknown): boolean {
	return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
}

function mark(ready: boolean): string {
	return ready ? '✅ 已配置' : '❌ 未配置';
}

async function donatedAiReadiness(env: Env): Promise<{ gemini: boolean; deepSeek: boolean }> {
	const unavailable = { gemini: false, deepSeek: false };
	if (!env.DB || !configured(env.DONATION_ENCRYPTION_KEY)) return unavailable;
	try {
		const result = await env.DB.prepare(`
			SELECT d.provider, p.available_models_json
			FROM api_key_donations d
			JOIN api_credential_profiles p ON p.donation_id = d.id
			WHERE d.provider IN ('google-gemini', 'deepseek')
				AND d.status = 'active'
				AND p.usage_policy = 'shared_inference'
				AND p.health_status = 'healthy'
			ORDER BY CASE d.provider WHEN 'google-gemini' THEN 0 ELSE 1 END,
				p.last_checked_at DESC, d.created_at ASC
			LIMIT 10
		`).all<{ provider: string; available_models_json: string }>();
		let gemini = false;
		let deepSeek = false;
		for (const row of result.results ?? []) {
			try {
				const models = JSON.parse(row.available_models_json);
				if (!Array.isArray(models)) continue;
				if (row.provider === 'google-gemini' && models.includes('gemini-2.5-flash')) gemini = true;
				if (row.provider === 'deepseek' && models.includes('deepseek-v4-flash')) deepSeek = true;
			} catch {
				// Ignore damaged metadata; another healthy donation may be usable.
			}
		}
		return { gemini, deepSeek };
	} catch {
		return unavailable;
	}
}

/**
 * Public, read-only runtime readiness summary.
 *
 * It checks bindings plus non-secret donated-credential health metadata.
 * It never decrypts a credential or performs inference.
 */
export async function handleStatus(parsed: ParsedUpdate, env: Env): Promise<void> {
	const chatId = parsed.chatId ?? parsed.message?.chat?.id;
	if (!chatId) return;

	const donated = await donatedAiReadiness(env);
	const translationReady = donated.gemini || donated.deepSeek || configured(env.DEEPSEEK_API_KEY) || Boolean(env.AI);
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
		`🔑 捐赠 Gemini 密钥：${donated.gemini ? '✅ 可用于共享推理' : '❌ 无健康的共享凭据'}`,
		`🔑 捐赠 DeepSeek 密钥：${donated.deepSeek ? '✅ 可用于共享推理' : '❌ 无健康的共享凭据'}`,
		`🌐 AI 翻译：${translationReady ? '✅ 已就绪（首选捐赠 Gemini）' : '❌ 无可用提供方'}`,
		`🧠 DeepSeek 审核密钥：${mark(configured(env.DEEPSEEK_API_KEY))}`,
		'',
		`🐙 GitHub 自动化：${mark(configured(env.GITHUB_REPOSITORY) && configured(env.GITHUB_TOKEN))}`,
		'',
		'<i>此命令仅检查运行时配置和捐赠凭据健康元数据，不解密或显示密钥，也不发起 AI 请求。</i>',
	].join('\n');

	await TgMessage.sendText(env, {
		chat_id: chatId,
		text,
		parse_mode: 'HTML',
		message_thread_id: parsed.threadId,
	});
}

export default handleStatus;
