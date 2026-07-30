import type { Env } from '../index';
import TgMessage, { type ParsedUpdate } from '../lib/telegram';
import { providerById } from '../lib/aiProviderRegistry';

function configured(value: unknown): boolean {
	return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
}

function mark(ready: boolean): string {
	return ready ? '✅ 已配置' : '❌ 未配置';
}

type DonationSummaryRow = {
	provider: string;
	total_count: number;
	shared_count: number;
	healthy_shared_count: number;
	pending_count: number;
	unavailable_count: number;
	translation_model_available: number;
};

type DonationSummary = {
	available: boolean;
	gemini: boolean;
	deepSeek: boolean;
	rows: DonationSummaryRow[];
};

async function donatedTokenSummary(env: Env): Promise<DonationSummary> {
	const unavailable = { available: false, gemini: false, deepSeek: false, rows: [] };
	if (!env.DB || !configured(env.DONATION_ENCRYPTION_KEY)) return unavailable;
	try {
		const result = await env.DB.prepare(`
			SELECT d.provider,
				COUNT(*) AS total_count,
				SUM(CASE WHEN p.usage_policy = 'shared_inference' THEN 1 ELSE 0 END) AS shared_count,
				SUM(CASE WHEN d.status = 'active'
					AND p.usage_policy = 'shared_inference'
					AND p.health_status = 'healthy' THEN 1 ELSE 0 END) AS healthy_shared_count,
				SUM(CASE WHEN d.status = 'pending'
					OR COALESCE(p.health_status, 'unchecked') = 'unchecked' THEN 1 ELSE 0 END) AS pending_count,
				SUM(CASE WHEN d.status IN ('invalid', 'disabled', 'revoked')
					OR p.health_status IN ('rate_limited', 'error', 'disabled', 'revoked')
					THEN 1 ELSE 0 END) AS unavailable_count,
				MAX(CASE WHEN d.status = 'active'
					AND p.usage_policy = 'shared_inference'
					AND p.health_status = 'healthy'
					AND (
						(d.provider = 'google-gemini' AND p.available_models_json LIKE '%"gemini-2.5-flash"%')
						OR (d.provider = 'deepseek' AND p.available_models_json LIKE '%"deepseek-v4-flash"%')
					)
					THEN 1 ELSE 0 END) AS translation_model_available
			FROM api_key_donations d
			LEFT JOIN api_credential_profiles p ON p.donation_id = d.id
			GROUP BY d.provider
			ORDER BY CASE d.provider WHEN 'google-gemini' THEN 0 ELSE 1 END,
				d.provider ASC
		`).all<DonationSummaryRow>();
		const rows = result.results ?? [];
		return {
			available: true,
			gemini: rows.some((row) => row.provider === 'google-gemini' && row.translation_model_available > 0),
			deepSeek: rows.some((row) => row.provider === 'deepseek' && row.translation_model_available > 0),
			rows,
		};
	} catch {
		return unavailable;
	}
}

function donationStatusLines(summary: DonationSummary): string[] {
	if (!summary.available) return ['⚠️ 捐赠凭据目录不可用'];
	if (!summary.rows.length) return ['• 暂无捐赠 Token'];
	const lines = summary.rows.map((row) => {
		const name = providerById(row.provider)?.displayName ?? '其他提供方';
		const model = row.translation_model_available > 0 ? '✅' : '❌';
		return `• ${name}：总计 ${row.total_count}｜共享 ${row.shared_count}｜共享健康 ${row.healthy_shared_count}｜待验证 ${row.pending_count}｜异常/停用 ${row.unavailable_count}｜翻译模型 ${model}`;
	});
	const totals = summary.rows.reduce((sum, row) => ({
		total: sum.total + row.total_count,
		shared: sum.shared + row.shared_count,
		healthy: sum.healthy + row.healthy_shared_count,
	}), { total: 0, shared: 0, healthy: 0 });
	lines.push(`合计：${totals.total} 个｜共享授权 ${totals.shared} 个｜共享健康 ${totals.healthy} 个`);
	return lines;
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

	const donated = await donatedTokenSummary(env);
	const translationReady = donated.gemini || donated.deepSeek || configured(env.DEEPSEEK_API_KEY) || Boolean(env.AI);
	const donationLines = donationStatusLines(donated);
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
		'<b>捐赠 Token</b>',
		...donationLines,
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
