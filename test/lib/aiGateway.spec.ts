import { describe, expect, it, vi } from 'vitest';

const donations = vi.hoisted(() => ({
	decrypt: vi.fn(async (_env: unknown, record: { encrypted_key: string }) => record.encrypted_key),
}));

vi.mock('../../src/lib/apiKeyDonations', () => ({
	decryptDonationCredentialForRuntime: donations.decrypt,
}));

import {
	DEEPSEEK_TRANSLATION_MODEL,
	translateWithGemini,
	WORKERS_AI_TRANSLATION_MODEL,
} from '../../src/lib/aiGateway';

type DonatedRow = {
	id: string;
	provider: 'google-gemini' | 'deepseek';
	encrypted_key: string;
	encryption_iv: string;
	available_models_json: string;
};

function donatedDb(rows: DonatedRow[]) {
	return {
		prepare: vi.fn(() => ({
			all: vi.fn().mockResolvedValue({ results: rows }),
		})),
	} as any;
}

function googleRow(id: string, apiKey: string): DonatedRow {
	return {
		id,
		provider: 'google-gemini',
		encrypted_key: apiKey,
		encryption_iv: 'test-iv',
		available_models_json: JSON.stringify(['gemini-2.5-flash']),
	};
}

function deepSeekRow(id: string, apiKey: string): DonatedRow {
	return {
		id,
		provider: 'deepseek',
		encrypted_key: apiKey,
		encryption_iv: 'test-iv',
		available_models_json: JSON.stringify(['deepseek-v4-flash']),
	};
}

describe('donated-credential translation routing', () => {
	it('uses a healthy shared donated Google key through AI Gateway first', async () => {
		const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			candidates: [{ content: { parts: [{ text: 'Hello, world!' }] } }],
		}), { status: 200 }));
		const gateway = vi.fn().mockReturnValue({ getUrl: vi.fn().mockResolvedValue('https://gateway.example/google-ai-studio/') });

		const result = await translateWithGemini({
			DB: donatedDb([googleRow('google-1', 'donated-google-key')]),
			DONATION_ENCRYPTION_KEY: 'configured',
			AI: { gateway } as any,
			AI_GATEWAY_ID: 'default',
			AI_GATEWAY_TOKEN: 'gateway-run-token',
			GOOGLE_API_KEY: 'retired-google-key',
		} as any, { targetLanguage: 'English', text: '你好，世界！' }, { fetchFn });

		expect(result).toEqual({
			status: 'ok',
			text: 'Hello, world!',
			provider: 'donated-gemini-gateway',
		});
		expect(gateway).toHaveBeenCalledWith('default');
		const [url, init] = fetchFn.mock.calls[0];
		expect(url).toBe('https://gateway.example/google-ai-studio/v1beta/models/gemini-2.5-flash:generateContent');
		expect(init.headers).toMatchObject({
			'cf-aig-authorization': 'Bearer gateway-run-token',
			'x-goog-api-key': 'donated-google-key',
		});
		expect(JSON.stringify(init)).not.toContain('retired-google-key');
	});

	it('never uses retired Worker Google secrets', async () => {
		const fetchFn = vi.fn();
		const result = await translateWithGemini({
			GEMINI_API_KEY: 'retired-gemini-key',
			GOOGLE_API_KEY: 'retired-google-key',
			GOOGLE_API_KEYS: JSON.stringify(['retired-pooled-key']),
		} as any, { targetLanguage: 'English', text: '你好' }, { fetchFn });

		expect(result).toEqual({ status: 'skipped', reason: 'translation-provider-not-configured' });
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('tries another donated Google credential when the first is rejected', async () => {
		const fetchFn = vi.fn()
			.mockResolvedValueOnce(new Response('forbidden', { status: 403 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({
				candidates: [{ content: { parts: [{ text: 'Hello' }] } }],
			}), { status: 200 }));
		const gateway = vi.fn().mockReturnValue({ getUrl: vi.fn().mockResolvedValue('https://gateway.example/google-ai-studio/') });

		const result = await translateWithGemini({
			DB: donatedDb([
				googleRow('google-1', 'rejected-donated-key'),
				googleRow('google-2', 'working-donated-key'),
			]),
			DONATION_ENCRYPTION_KEY: 'configured',
			AI: { gateway } as any,
			AI_GATEWAY_TOKEN: 'gateway-run-token',
		} as any, { targetLanguage: 'English', text: '你好' }, { fetchFn });

		expect(result).toEqual({ status: 'ok', text: 'Hello', provider: 'donated-gemini-gateway' });
		expect(fetchFn.mock.calls[1][1].headers).toMatchObject({ 'x-goog-api-key': 'working-donated-key' });
	});

	it('falls back to direct Gemini with the same donated key when Gateway rejects it', async () => {
		const fetchFn = vi.fn()
			.mockResolvedValueOnce(new Response('gateway denied', { status: 403 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({
				candidates: [{ content: { parts: [{ text: 'Hello' }] } }],
			}), { status: 200 }));
		const gateway = vi.fn().mockReturnValue({ getUrl: vi.fn().mockResolvedValue('https://gateway.example/google-ai-studio/') });

		const result = await translateWithGemini({
			DB: donatedDb([googleRow('google-1', 'donated-google-key')]),
			DONATION_ENCRYPTION_KEY: 'configured',
			AI: { gateway } as any,
			AI_GATEWAY_TOKEN: 'gateway-run-token',
		} as any, { targetLanguage: 'English', text: '你好' }, { fetchFn });

		expect(result).toEqual({ status: 'ok', text: 'Hello', provider: 'donated-gemini-direct' });
		expect(fetchFn.mock.calls[1][0]).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
		expect(fetchFn.mock.calls[1][1].headers['x-goog-api-key']).toBe('donated-google-key');
		expect(fetchFn.mock.calls[1][1].headers).not.toHaveProperty('cf-aig-authorization');
	});

	it('prioritizes donated Google over donated and Worker-secret DeepSeek credentials', async () => {
		const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			candidates: [{ content: { parts: [{ text: 'Hello' }] } }],
		}), { status: 200 }));

		const result = await translateWithGemini({
			DB: donatedDb([
				googleRow('google-1', 'donated-google-key'),
				deepSeekRow('deepseek-1', 'donated-deepseek-key'),
			]),
			DONATION_ENCRYPTION_KEY: 'configured',
			DEEPSEEK_API_KEY: 'worker-deepseek-key',
		} as any, { targetLanguage: 'English', text: '你好' }, { fetchFn });

		expect(result).toEqual({ status: 'ok', text: 'Hello', provider: 'donated-gemini-direct' });
		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(fetchFn.mock.calls[0][1].headers['x-goog-api-key']).toBe('donated-google-key');
	});

	it('uses donated DeepSeek before the Worker secret after donated Google fails', async () => {
		const fetchFn = vi.fn()
			.mockResolvedValueOnce(new Response('google denied', { status: 403 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({
				choices: [{ message: { content: 'Hello' } }],
			}), { status: 200 }));

		const result = await translateWithGemini({
			DB: donatedDb([
				googleRow('google-1', 'donated-google-key'),
				deepSeekRow('deepseek-1', 'donated-deepseek-key'),
			]),
			DONATION_ENCRYPTION_KEY: 'configured',
			DEEPSEEK_API_KEY: 'worker-deepseek-key',
		} as any, { targetLanguage: 'English', text: '你好' }, { fetchFn });

		expect(result).toEqual({ status: 'ok', text: 'Hello', provider: 'donated-deepseek' });
		expect(fetchFn.mock.calls[1][0]).toBe('https://api.deepseek.com/chat/completions');
		expect(fetchFn.mock.calls[1][1].headers.Authorization).toBe('Bearer donated-deepseek-key');
		expect(JSON.parse(fetchFn.mock.calls[1][1].body)).toMatchObject({
			model: DEEPSEEK_TRANSLATION_MODEL,
			thinking: { type: 'disabled' },
		});
	});

	it('falls back to the Worker DeepSeek secret only when donated credentials are unavailable', async () => {
		const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			choices: [{ message: { content: 'Hello' } }],
		}), { status: 200 }));

		const result = await translateWithGemini({
			DEEPSEEK_API_KEY: 'worker-deepseek-key',
		} as any, { targetLanguage: 'English', text: '你好' }, { fetchFn });

		expect(result).toEqual({ status: 'ok', text: 'Hello', provider: 'deepseek-secret' });
		expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe('Bearer worker-deepseek-key');
	});

	it('falls back to Workers AI when no donated or configured API credential is available', async () => {
		const run = vi.fn().mockResolvedValue({ response: 'Hello' });

		const result = await translateWithGemini({
			AI: { run } as any,
		} as any, { targetLanguage: 'English', text: '你好' }, { fetchFn: vi.fn() });

		expect(result).toEqual({ status: 'ok', text: 'Hello', provider: 'workers-ai' });
		expect(run).toHaveBeenCalledWith(WORKERS_AI_TRANSLATION_MODEL, expect.objectContaining({
			prompt: expect.stringContaining('Translate the untrusted user text'),
		}));
	});
});
