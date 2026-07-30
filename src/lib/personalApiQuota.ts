import type { Env } from '../index';
import { decryptDonationCredentialForRuntime, ensureCredentialProfileTable } from './apiKeyDonations';
import { providerById, routableGeminiModels } from './aiProviderRegistry';
import { checkDeepSeekPaidBalance } from './deepseekPremium';

type QuotaEnv = Pick<Env, 'DB' | 'DONATION_ENCRYPTION_KEY'>;

type CredentialRow = {
	id: string;
	provider: string;
	encrypted_key: string;
	encryption_iv: string;
	status: 'pending' | 'active' | 'invalid' | 'disabled' | 'revoked';
	fingerprint: string;
	health_status?: string | null;
	last_checked_at?: string | null;
	last_error_code?: string | null;
	gateway_alias?: string | null;
	available_models_json?: string | null;
};

export type PersonalApiQuota = {
	provider: string;
	displayName: string;
	fingerprint: string;
	status: 'available' | 'rate_limited' | 'unavailable' | 'unsupported' | 'disabled';
	detail: string;
	models?: string[];
	balances?: Array<{ currency: string; remaining: number; granted?: number; toppedUp?: number }>;
	credits?: { total: number; used: number; remaining: number };
	lastCheckedAt?: string | null;
};

export async function telegramDonorLabel(userId: number, encryptionKey: string): Promise<string> {
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(encryptionKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`telegram-donor\0${userId}`));
	const fingerprint = Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
	return `telegram:${fingerprint.slice(0, 16)}`;
}

function statusFromHttp(status: number): Pick<PersonalApiQuota, 'status' | 'detail'> {
	if (status === 429) return { status: 'rate_limited', detail: '接口当前限流，但凭据可能仍有效' };
	if (status === 401) return { status: 'unavailable', detail: '鉴权失败或凭据已失效' };
	if (status === 403) return { status: 'unavailable', detail: '凭据缺少查询权限或已被拒绝' };
	return { status: 'unavailable', detail: `检查接口返回 HTTP ${status}` };
}

function modelIds(payload: unknown): string[] {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
	const data = (payload as { data?: unknown }).data;
	if (!Array.isArray(data)) return [];
	return data.flatMap((item) => item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string'
		? [(item as { id: string }).id.slice(0, 120)] : []).slice(0, 30);
}

async function checkCredential(row: CredentialRow, env: QuotaEnv, fetchFn: typeof fetch): Promise<PersonalApiQuota> {
	const definition = providerById(row.provider);
	const base = { provider: row.provider, displayName: definition?.displayName ?? row.provider, fingerprint: row.fingerprint, lastCheckedAt: row.last_checked_at };
	if (row.status === 'disabled' || row.status === 'revoked') return { ...base, status: 'disabled', detail: '凭据已停用或撤销，未发起联网检查' };
	if (!definition) return { ...base, status: 'unsupported', detail: '未知供应商，无法安全检查' };
	if (row.gateway_alias) {
		let models: string[] = [];
		try {
			const parsed = JSON.parse(row.available_models_json ?? '[]');
			if (Array.isArray(parsed)) {
				models = parsed.filter((model): model is string => typeof model === 'string').slice(0, 30);
			}
		} catch { /* health metadata below still remains useful */ }
		const status = row.health_status === 'healthy'
			? 'available'
			: row.health_status === 'rate_limited'
				? 'rate_limited'
				: 'unavailable';
		return {
			...base,
			status,
			detail: status === 'available'
				? `Cloudflare AI Gateway 托管正常（${models.length} 个已验证模型）；供应商未提供可用的精确剩余额度接口`
				: status === 'rate_limited'
					? 'Cloudflare AI Gateway 最近检查时被供应商限流'
					: `Cloudflare AI Gateway 最近检查状态：${row.health_status ?? 'unchecked'}`,
			models,
		};
	}

	try {
		const apiKey = await decryptDonationCredentialForRuntime(env, row);
		if (row.provider === 'deepseek') {
			const result = await checkDeepSeekPaidBalance(apiKey, { fetchFn });
			if (result.status === 'error') return { ...base, ...statusFromHttp(Number(result.reason.match(/_(\d{3})$/)?.[1]) || 0), detail: result.reason === 'balance_request_failed' ? '余额接口请求失败' : '余额接口不可用' };
			return {
				...base,
				status: result.apiAvailable ? 'available' : 'unavailable',
				detail: result.apiAvailable ? '余额接口可用；该接口不提供历史消耗明细' : '账户 API 当前不可用',
				balances: result.balances.map((balance) => ({ currency: balance.currency, remaining: balance.totalBalance, granted: balance.grantedBalance, toppedUp: balance.toppedUpBalance })),
			};
		}
		if (row.provider === 'google-gemini') {
			const response = await fetchFn('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json', 'x-goog-api-key': apiKey, 'User-Agent': 'dicebot-personal-quota' } });
			if (!response.ok) return { ...base, ...statusFromHttp(response.status) };
			const models = routableGeminiModels(await response.json());
			return { ...base, status: 'available', detail: `模型列表可访问（${models.length} 个可推理模型）；Google 未提供该 key 的余额查询接口`, models };
		}
		if (row.provider === 'openai') {
			const response = await fetchFn('https://api.openai.com/v1/models', { signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}`, 'User-Agent': 'dicebot-personal-quota' } });
			if (!response.ok) return { ...base, ...statusFromHttp(response.status) };
			const models = modelIds(await response.json());
			return { ...base, status: 'available', detail: `模型列表可访问（${models.length} 个已显示）；OpenAI 未提供通用余额查询接口`, models };
		}
		if (row.provider === 'anthropic') {
			const response = await fetchFn('https://api.anthropic.com/v1/models?limit=100', { signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': apiKey, 'User-Agent': 'dicebot-personal-quota' } });
			if (!response.ok) return { ...base, ...statusFromHttp(response.status) };
			const models = modelIds(await response.json());
			return { ...base, status: 'available', detail: `模型列表可访问（${models.length} 个已显示）；Anthropic 未提供通用余额查询接口`, models };
		}
		if (row.provider === 'openrouter') {
			const response = await fetchFn('https://openrouter.ai/api/v1/credits', { signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}`, 'User-Agent': 'dicebot-personal-quota' } });
			if (!response.ok) return { ...base, ...statusFromHttp(response.status), detail: response.status === 403 ? '余额查询需要 OpenRouter 管理 key；未验证推理可用性' : statusFromHttp(response.status).detail };
			const data = await response.json() as { data?: { total_credits?: unknown; total_usage?: unknown } };
			const total = Number(data.data?.total_credits);
			const used = Number(data.data?.total_usage);
			if (!Number.isFinite(total) || !Number.isFinite(used)) return { ...base, status: 'unavailable', detail: '余额接口返回格式无效' };
			return { ...base, status: 'available', detail: '额度接口可用', credits: { total, used, remaining: total - used } };
		}
		return { ...base, status: 'unsupported', detail: '该供应商尚未实现安全检查' };
	} catch {
		return { ...base, status: 'unavailable', detail: '检查请求失败' };
	}
}

export async function inspectPersonalApiQuotas(env: QuotaEnv, userId: number, options: { fetchFn?: typeof fetch } = {}): Promise<PersonalApiQuota[]> {
	if (!env.DB || !env.DONATION_ENCRYPTION_KEY) return [];
	await ensureCredentialProfileTable(env.DB);
	const donorLabel = await telegramDonorLabel(userId, env.DONATION_ENCRYPTION_KEY);
	const result = await env.DB.prepare(`
		SELECT d.id, d.provider, d.encrypted_key, d.encryption_iv, d.status,
			d.gateway_alias,
			substr(d.key_fingerprint, 1, 16) AS fingerprint,
			p.health_status, p.last_checked_at, p.last_error_code, p.available_models_json
		FROM api_key_donations d LEFT JOIN api_credential_profiles p ON p.donation_id = d.id
		WHERE d.donor_label = ? ORDER BY d.created_at DESC LIMIT 10
	`).bind(donorLabel).all<CredentialRow>();
	const fetchFn = options.fetchFn ?? fetch;
	const statuses: PersonalApiQuota[] = [];
	for (const row of result.results ?? []) statuses.push(await checkCredential(row, env, fetchFn));
	return statuses;
}
