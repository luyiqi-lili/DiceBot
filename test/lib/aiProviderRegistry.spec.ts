import { describe, expect, it } from 'vitest';
import {
	FREE_MODEL_SEEDS,
	chooseFreeModel,
	normalizeProvider,
	routableGeminiModels,
} from '../../src/lib/aiProviderRegistry';
import {
	chooseOllamaReviewModel,
	chooseOllamaTranslationModel,
	routableOllamaModels,
} from '../../src/lib/ollamaCloud';

describe('AI provider registry', () => {
	it('normalizes platform aliases without guessing from secret formats', () => {
		expect(normalizeProvider('Gemini')?.id).toBe('google-gemini');
		expect(normalizeProvider('google-ai-studio')?.id).toBe('google-gemini');
		expect(normalizeProvider('Claude')?.id).toBe('anthropic');
		expect(normalizeProvider('ollama')?.id).toBe('ollama-cloud');
		expect(normalizeProvider('unknown-provider')).toBeNull();
	});

	it('selects small Ollama models for translation and large models for review', () => {
		const models = routableOllamaModels({ data: [
			{ id: 'gpt-oss:20b' },
			{ id: 'gpt-oss:120b' },
			{ id: 'qwen3.5:397b-cloud' },
		] });
		expect(chooseOllamaTranslationModel(models)).toBe('gpt-oss:20b');
		expect(chooseOllamaReviewModel(models)).toBe('qwen3.5:397b-cloud');
	});

	it('keeps documented Gemini 2.5 free-tier seeds and routes by complexity', () => {
		expect(FREE_MODEL_SEEDS.map((item) => item.model)).toEqual([
			'gemini-2.5-flash-lite',
			'gemini-2.5-flash',
			'gemini-2.5-pro',
		]);
		expect(chooseFreeModel('simple')?.model).toBe('gemini-2.5-flash-lite');
		expect(chooseFreeModel('complex', ['gemini-2.5-flash'])?.model).toBe('gemini-2.5-flash');
	});

	it('only records models that advertise generateContent', () => {
		expect(routableGeminiModels({ models: [
			{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
			{ name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] },
			{ name: 'models/gemini-2.5-flash', supportedActions: ['generateContent'] },
		] })).toEqual(['gemini-2.5-flash']);
	});
});
