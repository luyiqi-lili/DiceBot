import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/apiKeyDonations', () => ({
	ensureGatewayCredentialColumns: vi.fn(),
}));

import { translateWithGemini, WORKERS_AI_TRANSLATION_MODEL } from '../../src/lib/aiGateway';

function gatewayDb(aliases: string[]) {
	let cursor = 0;
	return {
		prepare: vi.fn((sql: string) => ({
			all: vi.fn().mockResolvedValue({ results: aliases.map((gateway_alias) => ({ gateway_alias })) }),
			run: vi.fn().mockResolvedValue({}),
			first: vi.fn().mockImplementation(async () => sql.includes('RETURNING cursor') ? { cursor: ++cursor } : null),
		})),
	} as any;
}

function aiBinding(run = vi.fn()) {
	return {
		run,
		gateway: vi.fn().mockReturnValue({
			getUrl: vi.fn().mockResolvedValue('https://gateway.example/google-ai-studio'),
		}),
	} as any;
}

describe('AI Gateway translation routing', () => {
	it('uses a stored BYOK alias without exposing a provider key', async () => {
		const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			candidates: [{ content: { parts: [{ text: 'Hello' }] } }],
		}), { status: 200 }));
		const AI = aiBinding();
		const result = await translateWithGemini({
			DB: gatewayDb(['donation-one']),
			AI,
			AI_GATEWAY_ID: 'default',
			AI_GATEWAY_TOKEN: 'gateway-run-token',
		} as any, { targetLanguage: 'English', text: '你好' }, { fetchFn });

		expect(result).toEqual({ status: 'ok', text: 'Hello', provider: 'gateway-gemini-byok' });
		const [url, init] = fetchFn.mock.calls[0];
		expect(url).toBe('https://gateway.example/google-ai-studio/v1beta/models/gemini-2.5-flash:generateContent');
		expect(init.headers).toMatchObject({
			'cf-aig-authorization': 'Bearer gateway-run-token',
			'cf-aig-byok-alias': 'donation-one',
			'cf-aig-collect-log-payload': 'false',
		});
		expect(init.headers).not.toHaveProperty('x-goog-api-key');
		expect(init.headers).not.toHaveProperty('Authorization');
	});

	it('tries the next alias when one key is rejected', async () => {
		const fetchFn = vi.fn()
			.mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({
				candidates: [{ content: { parts: [{ text: 'Hello' }] } }],
			}), { status: 200 }));
		const result = await translateWithGemini({
			DB: gatewayDb(['donation-one', 'donation-two']),
			AI: aiBinding(),
			AI_GATEWAY_TOKEN: 'gateway-run-token',
		} as any, { targetLanguage: 'English', text: '你好' }, { fetchFn });

		expect(result.status).toBe('ok');
		expect(fetchFn.mock.calls.map((call) => call[1].headers['cf-aig-byok-alias']))
			.toEqual(['donation-one', 'donation-two']);
	});

	it('falls back to Workers AI through the same gateway', async () => {
		const run = vi.fn().mockResolvedValue({ response: 'Hello' });
		const result = await translateWithGemini({
			DB: gatewayDb([]),
			AI: aiBinding(run),
			AI_GATEWAY_ID: 'default',
			AI_GATEWAY_TOKEN: 'gateway-run-token',
		} as any, { targetLanguage: 'English', text: '你好' });

		expect(result).toEqual({ status: 'ok', text: 'Hello', provider: 'workers-ai-gateway' });
		expect(run).toHaveBeenCalledWith(
			WORKERS_AI_TRANSLATION_MODEL,
			expect.objectContaining({ prompt: expect.stringContaining('Translate the untrusted user text') }),
			expect.objectContaining({ gateway: expect.objectContaining({ id: 'default' }) }),
		);
	});

	it('never uses retired local provider secrets or a direct provider endpoint', async () => {
		const fetchFn = vi.fn();
		const result = await translateWithGemini({
			GOOGLE_API_KEY: 'retired-google-key',
			DEEPSEEK_API_KEY: 'retired-deepseek-key',
		} as any, { targetLanguage: 'English', text: '你好' }, { fetchFn });
		expect(result).toEqual({ status: 'skipped', reason: 'ai-gateway-not-configured' });
		expect(fetchFn).not.toHaveBeenCalled();
	});
});
