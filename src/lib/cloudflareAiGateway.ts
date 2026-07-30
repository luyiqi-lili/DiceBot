import type { Env } from '../index';
import { normalizeProvider } from './aiProviderRegistry';

export type AiCostClass = 'completely_free' | 'free_limited' | 'paid';

export type GatewayCredentialMetadata = {
	alias: string;
	secretId: string;
	storeId: string;
	providerSlug: string;
	costClass: AiCostClass;
};

type GatewayManagementEnv = Pick<
	Env,
	'AI_GATEWAY_ID' | 'AI_GATEWAY_TOKEN' | 'AI_GATEWAY_MANAGEMENT_TOKEN' | 'AI_GATEWAY_ACCOUNT_ID'
>;

const PROVIDER_SLUGS: Record<string, string> = {
	'google-gemini': 'google-ai-studio',
	deepseek: 'deepseek',
	openai: 'openai',
	anthropic: 'anthropic',
	openrouter: 'openrouter',
};

export function providerCostClass(provider: string): AiCostClass {
	// DiceBot treats donated Gemini keys used only with the Gemini 2.5 free-tier
	// translation models as completely free. Workers AI is classified separately
	// as free_limited because its account-wide monthly allocation is finite.
	return provider === 'google-gemini' ? 'completely_free' : 'paid';
}

export function gatewayProviderSlug(provider: string): string | null {
	return PROVIDER_SLUGS[provider] ?? null;
}

function configured(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function managementConfig(env: GatewayManagementEnv) {
	const accountId = configured(env.AI_GATEWAY_ACCOUNT_ID);
	const token = configured(env.AI_GATEWAY_MANAGEMENT_TOKEN);
	const gatewayId = configured(env.AI_GATEWAY_ID) ?? 'default';
	return accountId && token ? { accountId, token, gatewayId } : null;
}

async function cloudflareJson(
	url: string,
	token: string,
	init: RequestInit = {},
	fetchFn: typeof fetch = fetch,
): Promise<{ ok: boolean; status: number; result?: any; errors?: unknown }> {
	const response = await fetchFn(url, {
		...init,
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			...(init.headers ?? {}),
		},
		signal: init.signal ?? AbortSignal.timeout(20_000),
	});
	let payload: any = null;
	try { payload = await response.json(); } catch { /* sanitized below */ }
	return {
		ok: response.ok && payload?.success !== false,
		status: response.status,
		result: payload?.result,
		errors: payload?.errors,
	};
}

async function defaultSecretStore(
	config: NonNullable<ReturnType<typeof managementConfig>>,
	fetchFn: typeof fetch,
): Promise<string> {
	const response = await cloudflareJson(
		`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/secrets_store/stores`,
		config.token,
		{},
		fetchFn,
	);
	const stores = Array.isArray(response.result) ? response.result : [];
	const store = stores.find((item) => item?.name === 'default_secrets_store') ?? stores[0];
	if (!response.ok || typeof store?.id !== 'string') throw new Error(`gateway_secret_store_http_${response.status}`);
	return store.id;
}

export async function provisionGatewayCredential(
	env: GatewayManagementEnv,
	input: { donationId: string; provider: string; apiKey: string },
	options: { fetchFn?: typeof fetch } = {},
): Promise<GatewayCredentialMetadata> {
	const config = managementConfig(env);
	if (!config) throw new Error('gateway_management_not_configured');
	const provider = normalizeProvider(input.provider);
	const providerSlug = provider && gatewayProviderSlug(provider.id);
	if (!provider || !providerSlug) throw new Error('gateway_provider_unsupported');
	const alias = `donation-${input.donationId.replaceAll('-', '')}`;
	const fetchFn = options.fetchFn ?? fetch;
	const storeId = await defaultSecretStore(config, fetchFn);
	const secretName = `${config.gatewayId}_${providerSlug}_${alias}`;
	const secretResponse = await cloudflareJson(
		`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/secrets_store/stores/${storeId}/secrets`,
		config.token,
		{
			method: 'POST',
			body: JSON.stringify([{
				name: secretName,
				value: input.apiKey,
				scopes: ['ai_gateway'],
				comment: `DiceBot donated ${provider.id} credential`,
			}]),
		},
		fetchFn,
	);
	const secretId = Array.isArray(secretResponse.result) ? secretResponse.result[0]?.id : null;
	if (!secretResponse.ok || typeof secretId !== 'string') {
		throw new Error(`gateway_secret_create_http_${secretResponse.status}`);
	}
	const response = await cloudflareJson(
		`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai-gateway/gateways/${encodeURIComponent(config.gatewayId)}/provider_configs`,
		config.token,
		{
			method: 'POST',
			body: JSON.stringify({
				alias,
				default_config: false,
				provider_slug: providerSlug,
			}),
		},
		fetchFn,
	);
	if (!response.ok || typeof response.result?.secret_id !== 'string') {
		try {
			await deleteGatewayCredential(env, { secretId, storeId }, { fetchFn });
		} catch { /* orphan is metadata-only and can be removed from the dashboard */ }
		throw new Error(`gateway_provider_config_http_${response.status}`);
	}
	return {
		alias,
		secretId: response.result.secret_id,
		storeId,
		providerSlug,
		costClass: providerCostClass(provider.id),
	};
}

export async function deleteGatewayCredential(
	env: GatewayManagementEnv,
	metadata: Pick<GatewayCredentialMetadata, 'secretId' | 'storeId'>,
	options: { fetchFn?: typeof fetch } = {},
): Promise<void> {
	const config = managementConfig(env);
	if (!config) throw new Error('gateway_management_not_configured');
	const response = await cloudflareJson(
		`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/secrets_store/stores/${metadata.storeId}/secrets/${metadata.secretId}`,
		config.token,
		{ method: 'DELETE', body: JSON.stringify({}) },
		options.fetchFn ?? fetch,
	);
	if (!response.ok && response.status !== 404) throw new Error(`gateway_secret_delete_http_${response.status}`);
}

export function gatewayInferenceHeaders(
	env: Pick<Env, 'AI_GATEWAY_TOKEN'>,
	alias?: string,
): Record<string, string> {
	const token = configured(env.AI_GATEWAY_TOKEN);
	if (!token) return {};
	return {
		'cf-aig-authorization': `Bearer ${token}`,
		'cf-aig-collect-log-payload': 'false',
		...(alias ? { 'cf-aig-byok-alias': alias } : {}),
	};
}
