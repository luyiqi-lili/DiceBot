import type { Env } from '../index';
import TgMessage, { type ParsedUpdate } from '../lib/telegram';
import { ensureGatewayCredentialColumns } from '../lib/apiKeyDonations';
import { providerById } from '../lib/aiProviderRegistry';
import { chooseOllamaReviewModel, chooseOllamaTranslationModel } from '../lib/ollamaCloud';

function configured(value: unknown): boolean {
	return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
}

function mark(ready: boolean): string {
	return ready ? '✅ 已配置' : '❌ 未配置';
}

type PoolRow = { provider: string; cost_class: string; key_count: number };
type OllamaModelPools = { smallKeys: number; largeKeys: number };

async function gatewayPools(env: Env): Promise<PoolRow[]> {
	if (!env.DB) return [];
	try {
		await ensureGatewayCredentialColumns(env.DB);
		const result = await env.DB.prepare(`
			SELECT d.provider, d.cost_class, COUNT(*) AS key_count
			FROM api_key_donations d
			JOIN api_credential_profiles p ON p.donation_id = d.id
			WHERE d.status = 'active' AND d.gateway_alias IS NOT NULL AND d.gateway_alias <> ''
				AND p.usage_policy = 'shared_inference' AND p.health_status = 'healthy'
			GROUP BY d.provider, d.cost_class ORDER BY d.cost_class, d.provider
		`).all<PoolRow>();
		return result.results ?? [];
	} catch {
		return [];
	}
}

async function ollamaModelPools(env: Env): Promise<OllamaModelPools> {
	if (!env.DB) return { smallKeys: 0, largeKeys: 0 };
	try {
		const result = await env.DB.prepare(`
			SELECT p.available_models_json
			FROM api_key_donations d
			JOIN api_credential_profiles p ON p.donation_id = d.id
			WHERE d.provider = 'ollama-cloud' AND d.status = 'active'
				AND d.gateway_alias IS NOT NULL AND d.gateway_alias <> ''
				AND p.usage_policy = 'shared_inference' AND p.health_status = 'healthy'
		`).all<{ available_models_json: string }>();
		let smallKeys = 0;
		let largeKeys = 0;
		for (const row of result.results ?? []) {
			try {
				const parsed = JSON.parse(row.available_models_json);
				if (!Array.isArray(parsed)) continue;
				const models = parsed.filter((model): model is string => typeof model === 'string');
				if (chooseOllamaTranslationModel(models)) smallKeys += 1;
				if (chooseOllamaReviewModel(models)) largeKeys += 1;
			} catch { /* another key can still make the pool healthy */ }
		}
		return { smallKeys, largeKeys };
	} catch {
		return { smallKeys: 0, largeKeys: 0 };
	}
}

function poolLines(rows: PoolRow[], costClass: string, excludedProviders: readonly string[] = []): string[] {
	const selected = rows.filter((row) =>
		row.cost_class === costClass && !excludedProviders.includes(row.provider));
	if (!selected.length) return ['• 暂无'];
	return selected.map((row) =>
		`• ${providerById(row.provider)?.displayName ?? row.provider}：${row.key_count} 把 Gateway 密钥（轮询）`);
}

/** Public, read-only runtime readiness summary. Never reads a provider key. */
export async function handleStatus(parsed: ParsedUpdate, env: Env): Promise<void> {
	const chatId = parsed.chatId ?? parsed.message?.chat?.id;
	if (!chatId) return;
	const pools = await gatewayPools(env);
	const ollama = await ollamaModelPools(env);
	const gatewayReady = configured(env.AI_GATEWAY_ID) && configured(env.AI_GATEWAY_TOKEN);
	const translationReady = gatewayReady && (
		pools.some((row) => row.cost_class === 'completely_free')
		|| ollama.smallKeys > 0
		|| Boolean(env.AI)
	);
	const reviewReady = gatewayReady && (ollama.largeKeys > 0 || Boolean(env.AI));
	const text = [
		'🩺 <b>骰娘运行状态</b>',
		'',
		`🤖 Telegram Bot：${mark(configured(env.TOKEN))}`,
		`🗄️ 数据库 D1：${mark(Boolean(env.DB))}`,
		`📦 数据存储：${mark(Boolean(env.TGBOTCOUNT && env.NEWS_STORE && env.TOPIC_KV && env.BOOK_STORE && env.FISHING_RECORD_KV && env.FISH_KV && env.AFFECTION_KV && env.ITEM_STORE && env.COIN_KV))}`,
		`⚙️ Durable Objects：${mark(Boolean(env.COIN_DO && env.LOTTERY_DO))}`,
		`🔐 外部 API 密钥：${mark(configured(env.EXTERNAL_API_KEY))}`,
		'',
		'<b>AI Gateway</b>',
		`🚪 推理网关：${mark(gatewayReady)}`,
		`🔒 Provider Keys 托管：${mark(configured(env.AI_GATEWAY_MANAGEMENT_TOKEN) && configured(env.AI_GATEWAY_ACCOUNT_ID))}`,
		`🔄 多密钥轮询：${pools.some((row) => row.key_count > 1) ? '✅ 已启用' : '➖ 当前池内不足 2 把'}`,
		'',
		'<b>完全免费</b>',
		...poolLines(pools, 'completely_free'),
		`• Ollama Cloud 小模型：${ollama.smallKeys > 0 ? `✅ ${ollama.smallKeys} 把捐赠密钥可用（轮询）` : '➖ 暂无可用捐赠密钥'}`,
		`• Workers AI 小模型：${Boolean(env.AI) ? '✅ Llama 3.2 3B（经 AI Gateway）' : '❌ 不可用'}`,
		'',
		'<b>免费但有限额</b>',
		...poolLines(pools, 'free_limited', ['ollama-cloud']),
		`• Ollama Cloud 大模型：${ollama.largeKeys > 0 ? `✅ ${ollama.largeKeys} 把捐赠密钥可用（轮询）` : '➖ 暂无可用捐赠密钥'}`,
		`• Workers AI 大模型：${Boolean(env.AI) ? '✅ Llama 3.3 70B（经 AI Gateway）' : '❌ 不可用'}`,
		'',
		'<b>收费</b>',
		...poolLines(pools, 'paid'),
		'',
		`🌐 翻译：${translationReady ? '✅ 完全免费小模型池（Gemini / Ollama / Workers AI）' : '❌ 无可用免费池'}`,
		`🐙 PR 审核：${reviewReady ? '✅ 免费限额大模型池（Ollama → Workers AI）' : '❌ 不可用'}`,
		'💳 收费模型：⛔ 默认不自动调用',
	].join('\n');
	await TgMessage.sendText(env, { chat_id: chatId, text, parse_mode: 'HTML', message_thread_id: parsed.threadId });
}

export default handleStatus;
