import type { Env } from '../index';
import { normalizeProvider } from './aiProviderRegistry';
import { OLLAMA_CLOUD_GATEWAY_SLUG } from './ollamaCloud';

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
	'ollama-cloud': OLLAMA_CLOUD_GATEWAY_SLUG,
	deepseek: 'deepseek',
	openai: 'openai',
	anthropic: 'anthropic',
	openrouter: 'openrouter',
};

export function providerCostClass(provider: string): AiCostClass {
	// Gemini free-tier translation keys are completely free. Ollama accounts are
	// quota-limited at the credential level; routing classifies their small and
	// large models separately. Workers AI is classified at each call site.
	if (provider === 'google-gemini') return 'completely_free';
	if (provider === 'ollama-cloud') return 'free_limited';
	return 'paid';
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

async function ensureOllamaCustomProvider(
	config: NonNullable<ReturnType<typeof managementConfig>>,
	fetchFn: typeof fetch,
): Promise<void> {
	const list = await cloudflareJson(
		`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai-gateway/custom-providers?per_page=100`,
		config.token,
		{},
		fetchFn,
	);
	if (!list.ok) throw new Error(`gateway_custom_provider_list_http_${list.status}`);
	const providers = Array.isArray(list.result) ? list.result : [];
	const existing = providers.find((item) => item?.slug === 'ollama-cloud' && typeof item?.id === 'string');
	if (existing?.enable !== false && String(existing?.base_url).replace(/\/+$/, '') === 'https://ollama.com') return;
	const response = existing
		? await cloudflareJson(
			`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai-gateway/custom-providers/${existing.id}`,
			config.token,
			{ method: 'PATCH', body: JSON.stringify({ enable: true, base_url: 'https://ollama.com' }) },
			fetchFn,
		)
		: await cloudflareJson(
			`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai-gateway/custom-providers`,
			config.token,
			{
				method: 'POST',
				body: JSON.stringify({
					name: 'Ollama Cloud',
					slug: 'ollama-cloud',
					base_url: 'https://ollama.com',
					description: 'Ollama Cloud donated API keys for DiceBot',
					link: 'https://docs.ollama.com/cloud',
					enable: true,
				}),
			},
			fetchFn,
		);
	if (!response.ok) throw new Error(`gateway_custom_provider_create_http_${response.status}`);
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
	if (provider.id === 'ollama-cloud') await ensureOllamaCustomProvider(config, fetchFn);
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
				secret_id: secretId,
			}),
		},
		fetchFn,
	);
	if (!response.ok) {
		try {
			await deleteGatewayCredential(env, { secretId, storeId }, { fetchFn });
		} catch { /* orphan is metadata-only and can be removed from the dashboard */ }
		throw new Error(`gateway_provider_config_http_${response.status}`);
	}
	return {
		alias,
		secretId,
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

/**
 * Ollama custom-provider BYOK aliases currently do not inject the provider
 * Authorization header reliably. Keep the credential in Cloudflare Secrets
 * Store, read it through the Worker binding, and still send the request through
 * AI Gateway. The secret-id match prevents one binding from authenticating a
 * different donated credential.
 */
export async function ollamaGatewayInferenceHeaders(
	env: Pick<Env, 'AI_GATEWAY_TOKEN' | 'OLLAMA_DONATED_KEY' | 'OLLAMA_DONATED_SECRET_ID'>,
	alias: string,
	secretId?: string | null,
): Promise<Record<string, string>> {
	const headers = gatewayInferenceHeaders(env, alias);
	const configuredSecretId = configured(env.OLLAMA_DONATED_SECRET_ID);
	if (!configuredSecretId || configuredSecretId !== configured(secretId) || !env.OLLAMA_DONATED_KEY) {
		return headers;
	}
	try {
		const providerKey = configured(await env.OLLAMA_DONATED_KEY.get());
		if (providerKey) headers.Authorization = `Bearer ${providerKey}`;
	} catch (error) {
		console.error('[ai-gateway] Ollama Secrets Store binding unavailable', {
			reason: error instanceof Error ? error.message.slice(0, 120) : 'unknown',
		});
	}
	return headers;
}
