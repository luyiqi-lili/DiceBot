export const OLLAMA_CLOUD_PROVIDER = 'ollama-cloud';
export const OLLAMA_CLOUD_GATEWAY_SLUG = 'custom-ollama-cloud';

const TRANSLATION_MODEL_PREFERENCES = [
	'gpt-oss:20b',
	'nemotron-3-nano:4b',
	'qwen3.5:9b',
	'qwen3.5:4b',
	'qwen3.5:2b',
	'qwen3.5:0.8b',
] as const;

const REVIEW_MODEL_PREFERENCES = [
	'qwen3.5:397b',
	'qwen3.5',
	'gpt-oss:120b',
	'nemotron-3-super:120b',
	'mistral-large-3',
	'deepseek-v4-flash',
] as const;

function normalizedModelName(value: string): string {
	return value.trim().toLowerCase().replace(/-cloud$/, '');
}

function parameterBillions(value: string): number | null {
	const matches = [...value.toLowerCase().matchAll(/(?:^|[:_-])(\d+(?:\.\d+)?)b(?:$|[-_])/g)];
	if (!matches.length) return null;
	const parsed = Number(matches.at(-1)?.[1]);
	return Number.isFinite(parsed) ? parsed : null;
}

function choosePreferred(availableModels: readonly string[], preferences: readonly string[]): string | null {
	const byNormalizedName = new Map(availableModels.map((model) => [normalizedModelName(model), model]));
	for (const preferred of preferences) {
		const exact = byNormalizedName.get(normalizedModelName(preferred));
		if (exact) return exact;
	}
	return null;
}

export function routableOllamaModels(payload: unknown): string[] {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
	const models = (payload as { models?: unknown }).models;
	if (!Array.isArray(models)) return [];
	const names = models.flatMap((entry) => {
		if (!entry || typeof entry !== 'object') return [];
		const item = entry as { name?: unknown; model?: unknown };
		const name = typeof item.model === 'string' ? item.model : typeof item.name === 'string' ? item.name : '';
		return name.trim() ? [name.trim().slice(0, 160)] : [];
	});
	return Array.from(new Set(names)).sort();
}

export function chooseOllamaTranslationModel(availableModels: readonly string[]): string | null {
	const preferred = choosePreferred(availableModels, TRANSLATION_MODEL_PREFERENCES);
	if (preferred) return preferred;
	const small = availableModels
		.map((model) => ({ model, size: parameterBillions(model) }))
		.filter((item): item is { model: string; size: number } => item.size !== null && item.size <= 20)
		.sort((left, right) => right.size - left.size || left.model.localeCompare(right.model));
	return small[0]?.model ?? null;
}

export function chooseOllamaReviewModel(availableModels: readonly string[]): string | null {
	const preferred = choosePreferred(availableModels, REVIEW_MODEL_PREFERENCES);
	if (preferred) return preferred;
	const large = availableModels
		.map((model) => ({ model, size: parameterBillions(model) }))
		.filter((item): item is { model: string; size: number } => item.size !== null && item.size >= 70)
		.sort((left, right) => right.size - left.size || left.model.localeCompare(right.model));
	return large[0]?.model ?? null;
}

export function ollamaChatText(payload: unknown): string | null {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
	const content = (payload as { message?: { content?: unknown } }).message?.content;
	return typeof content === 'string' && content.trim() ? content.trim() : null;
}
