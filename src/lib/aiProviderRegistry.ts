export type AiProviderId = 'google-gemini' | 'openai' | 'anthropic' | 'deepseek' | 'openrouter';

export type CredentialUsagePolicy = 'validation_only' | 'shared_inference';

export interface AiProviderDefinition {
	id: AiProviderId;
	displayName: string;
	aliases: readonly string[];
	credentialType: 'api_key';
	validation: 'google-models' | 'not-implemented';
}

export interface FreeModelSeed {
	provider: AiProviderId;
	model: string;
	displayName: string;
	complexity: 'simple' | 'standard' | 'complex';
	freeTier: 'documented' | 'unknown';
	verifiedAt: string;
	sourceUrl: string;
}

export const AI_PROVIDERS: readonly AiProviderDefinition[] = [
	{
		id: 'google-gemini',
		displayName: 'Google Gemini',
		aliases: ['google-gemini', 'google', 'gemini', 'google-ai', 'google-ai-studio'],
		credentialType: 'api_key',
		validation: 'google-models',
	},
	{
		id: 'openai',
		displayName: 'OpenAI',
		aliases: ['openai'],
		credentialType: 'api_key',
		validation: 'not-implemented',
	},
	{
		id: 'anthropic',
		displayName: 'Anthropic',
		aliases: ['anthropic', 'claude'],
		credentialType: 'api_key',
		validation: 'not-implemented',
	},
	{
		id: 'deepseek',
		displayName: 'DeepSeek',
		aliases: ['deepseek'],
		credentialType: 'api_key',
		validation: 'not-implemented',
	},
	{
		id: 'openrouter',
		displayName: 'OpenRouter',
		aliases: ['openrouter'],
		credentialType: 'api_key',
		validation: 'not-implemented',
	},
] as const;

/**
 * These are seeds, not a promise of permanent free quota. Runtime credential
 * validation still has to confirm that the donated project can list the model.
 */
export const FREE_MODEL_SEEDS: readonly FreeModelSeed[] = [
	{
		provider: 'google-gemini',
		model: 'gemini-2.5-flash-lite',
		displayName: 'Gemini 2.5 Flash-Lite',
		complexity: 'simple',
		freeTier: 'documented',
		verifiedAt: '2026-07-20',
		sourceUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
	},
	{
		provider: 'google-gemini',
		model: 'gemini-2.5-flash',
		displayName: 'Gemini 2.5 Flash',
		complexity: 'standard',
		freeTier: 'documented',
		verifiedAt: '2026-07-20',
		sourceUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
	},
	{
		provider: 'google-gemini',
		model: 'gemini-2.5-pro',
		displayName: 'Gemini 2.5 Pro',
		complexity: 'complex',
		freeTier: 'documented',
		verifiedAt: '2026-07-20',
		sourceUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
	},
] as const;

export function normalizeProvider(value: unknown): AiProviderDefinition | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim().toLowerCase();
	return AI_PROVIDERS.find((provider) => provider.aliases.includes(normalized)) ?? null;
}

export function providerById(id: string): AiProviderDefinition | null {
	return AI_PROVIDERS.find((provider) => provider.id === id) ?? null;
}

export function publicProviderCatalog() {
	return AI_PROVIDERS.map(({ id, displayName, credentialType, validation }) => ({
		id,
		displayName,
		credentialType,
		validationAvailable: validation !== 'not-implemented',
	}));
}

export function normalizeGoogleModelName(value: string): string {
	return value.trim().replace(/^models\//, '');
}

export function routableGeminiModels(payload: unknown): string[] {
	if (!payload || typeof payload !== 'object') return [];
	const models = (payload as { models?: unknown }).models;
	if (!Array.isArray(models)) return [];

	const names = models.flatMap((entry) => {
		if (!entry || typeof entry !== 'object') return [];
		const item = entry as { name?: unknown; supportedGenerationMethods?: unknown; supportedActions?: unknown };
		if (typeof item.name !== 'string') return [];
		const actions = Array.isArray(item.supportedGenerationMethods)
			? item.supportedGenerationMethods
			: Array.isArray(item.supportedActions)
				? item.supportedActions
				: [];
		if (!actions.includes('generateContent')) return [];
		return [normalizeGoogleModelName(item.name)];
	});

	return Array.from(new Set(names)).sort();
}

export function chooseFreeModel(
	complexity: 'simple' | 'standard' | 'complex',
	availableModels?: readonly string[],
): FreeModelSeed | null {
	const order = complexity === 'complex'
		? ['complex', 'standard', 'simple']
		: complexity === 'standard'
			? ['standard', 'simple', 'complex']
			: ['simple', 'standard', 'complex'];
	const available = availableModels ? new Set(availableModels.map(normalizeGoogleModelName)) : null;
	for (const target of order) {
		const model = FREE_MODEL_SEEDS.find((candidate) => candidate.complexity === target && (!available || available.has(candidate.model)));
		if (model) return model;
	}
	return null;
}
