import type { Env } from '../index';

export type DeepSeekMessage = {
	role: 'system' | 'user' | 'assistant';
	content: string;
};

export type DeepSeekChatOptions = {
	messages: DeepSeekMessage[];
	model?: string;
	temperature?: number;
	maxTokens?: number;
	timeoutMs?: number;
};

type DeepSeekResponse = {
	choices?: Array<{
		message?: {
			content?: string;
		};
	}>;
	error?: {
		message?: string;
	};
};

const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-pro';

export function getDeepSeekApiKeys(env: Pick<Env, 'DEEPSEEK_API_KEY' | 'DEEPSEEK_API_KEYS'>): string[] {
	const keys: string[] = [];

	if (env.DEEPSEEK_API_KEYS) {
		try {
			const parsed = JSON.parse(env.DEEPSEEK_API_KEYS);
			if (Array.isArray(parsed)) {
				keys.push(...parsed.filter((key): key is string => typeof key === 'string' && key.trim().length > 0));
			}
		} catch {
			keys.push(...env.DEEPSEEK_API_KEYS.split(',').map(key => key.trim()).filter(Boolean));
		}
	}

	if (env.DEEPSEEK_API_KEY?.trim()) {
		keys.push(env.DEEPSEEK_API_KEY.trim());
	}

	return [...new Set(keys)];
}

function pickDeepSeekApiKey(env: Pick<Env, 'DEEPSEEK_API_KEY' | 'DEEPSEEK_API_KEYS'>): string {
	const keys = getDeepSeekApiKeys(env);
	if (!keys.length) {
		throw new Error('Missing DEEPSEEK_API_KEY');
	}
	return keys[Math.floor(Math.random() * keys.length)];
}

export async function callDeepSeekChat(env: Env, options: DeepSeekChatOptions): Promise<string> {
	const apiKey = pickDeepSeekApiKey(env);
	const model = options.model || env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL;
	const baseUrl = (env.DEEPSEEK_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL).replace(/\/+$/, '');
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? 60000);

	try {
		const res = await fetch(`${baseUrl}/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model,
				messages: options.messages,
				temperature: options.temperature ?? 0.7,
				max_tokens: options.maxTokens ?? 1200,
			}),
			signal: controller.signal,
		});

		if (!res.ok) {
			const errText = await res.text();
			throw new Error(`DeepSeek API returned ${res.status}: ${errText.slice(0, 200)}`);
		}

		const json = await res.json() as DeepSeekResponse;
		const content = json.choices?.[0]?.message?.content?.trim();
		if (!content) {
			throw new Error(json.error?.message || 'DeepSeek API returned empty content');
		}
		return content;
	} finally {
		clearTimeout(timeoutId);
	}
}
