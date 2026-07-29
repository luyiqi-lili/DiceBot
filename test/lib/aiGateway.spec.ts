import { describe, expect, it, vi } from 'vitest';
import { translateWithGemini, WORKERS_AI_TRANSLATION_MODEL } from '../../src/lib/aiGateway';

describe('AI Gateway Gemini translation', () => {
	it('uses Google native Gemini through the Worker-bound AI Gateway', async () => {
		const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			candidates: [{ content: { parts: [{ text: 'Hello, world!' }] } }],
		}), { status: 200 }));
		const gateway = vi.fn().mockReturnValue({ getUrl: vi.fn().mockResolvedValue('https://gateway.example/google-ai-studio/') });

		const result = await translateWithGemini({
			AI: { gateway } as any,
			AI_GATEWAY_ID: 'default',
			AI_GATEWAY_TOKEN: 'gateway-run-token',
			GEMINI_API_KEY: 'google-free-tier-key',
		} as any, { targetLanguage: 'English', text: '你好，世界！' }, { fetchFn });

		expect(result).toEqual({ status: 'ok', text: 'Hello, world!' });
		expect(gateway).toHaveBeenCalledWith('default');
		const [url, init] = fetchFn.mock.calls[0];
		expect(url).toBe('https://gateway.example/google-ai-studio/v1beta/models/gemini-2.5-flash:generateContent');
		expect(init.headers).toMatchObject({
			'cf-aig-authorization': 'Bearer gateway-run-token',
			'x-goog-api-key': 'google-free-tier-key',
		});
		expect(JSON.parse(init.body).contents[0].parts[0].text).toContain('Translate the untrusted user text into English');
	});

	it('fails closed without making a network request when Gateway secrets are absent', async () => {
		const fetchFn = vi.fn();
		const result = await translateWithGemini({ AI: { gateway: vi.fn() } as any } as any, {
			targetLanguage: 'English', text: '你好',
		}, { fetchFn });

		expect(result).toEqual({ status: 'skipped', reason: 'gemini-api-key-not-configured' });
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('uses the legacy Google key when the renamed Gemini key is absent', async () => {
		const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			candidates: [{ content: { parts: [{ text: 'Hello' }] } }],
		}), { status: 200 }));
		const gateway = vi.fn().mockReturnValue({ getUrl: vi.fn().mockResolvedValue('https://gateway.example/google-ai-studio/') });

		await translateWithGemini({
			AI: { gateway } as any, AI_GATEWAY_TOKEN: 'gateway-run-token', GOOGLE_API_KEY: 'legacy-google-key',
		} as any, { targetLanguage: 'English', text: '你好' }, { fetchFn });

		expect(fetchFn.mock.calls[0][1].headers).toMatchObject({ 'x-goog-api-key': 'legacy-google-key' });
	});

	it('falls back to the legacy JSON Google key pool after a rejected direct key', async () => {
		const fetchFn = vi.fn()
			.mockResolvedValueOnce(new Response('forbidden', { status: 403 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({
				candidates: [{ content: { parts: [{ text: 'Hello' }] } }],
			}), { status: 200 }));
		const gateway = vi.fn().mockReturnValue({ getUrl: vi.fn().mockResolvedValue('https://gateway.example/google-ai-studio/') });

		const result = await translateWithGemini({
			AI: { gateway } as any,
			AI_GATEWAY_TOKEN: 'gateway-run-token',
			GOOGLE_API_KEY: 'rejected-legacy-key',
			GOOGLE_API_KEYS: JSON.stringify(['working-pooled-key']),
		} as any, { targetLanguage: 'English', text: '你好' }, { fetchFn });

		expect(result).toEqual({ status: 'ok', text: 'Hello' });
		expect(fetchFn).toHaveBeenCalledTimes(2);
		expect(fetchFn.mock.calls[1][1].headers).toMatchObject({ 'x-goog-api-key': 'working-pooled-key' });
	});

	it('falls back to Google directly when the Gateway rejects a valid key', async () => {
		const fetchFn = vi.fn()
			.mockResolvedValueOnce(new Response('gateway denied', { status: 403 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({
				candidates: [{ content: { parts: [{ text: 'Hello' }] } }],
			}), { status: 200 }));
		const gateway = vi.fn().mockReturnValue({ getUrl: vi.fn().mockResolvedValue('https://gateway.example/google-ai-studio/') });

		const result = await translateWithGemini({
			AI: { gateway } as any, AI_GATEWAY_TOKEN: 'gateway-run-token', GOOGLE_API_KEY: 'google-key',
		} as any, { targetLanguage: 'English', text: '你好' }, { fetchFn });

		expect(result).toEqual({ status: 'ok', text: 'Hello' });
		expect(fetchFn.mock.calls[1][0]).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
		expect(fetchFn.mock.calls[1][1].headers).not.toHaveProperty('cf-aig-authorization');
	});

	it('falls back to Workers AI when every Google path is rejected', async () => {
		const fetchFn = vi.fn().mockResolvedValue(new Response('forbidden', { status: 403 }));
		const run = vi.fn().mockResolvedValue({ response: 'Hello' });
		const gateway = vi.fn().mockReturnValue({ getUrl: vi.fn().mockResolvedValue('https://gateway.example/google-ai-studio/') });

		const result = await translateWithGemini({
			AI: { gateway, run } as any, AI_GATEWAY_TOKEN: 'gateway-run-token', GOOGLE_API_KEY: 'google-key',
		} as any, { targetLanguage: 'English', text: '你好' }, { fetchFn });

		expect(result).toEqual({ status: 'ok', text: 'Hello' });
		expect(run).toHaveBeenCalledWith(WORKERS_AI_TRANSLATION_MODEL, expect.objectContaining({ prompt: expect.stringContaining('Translate the untrusted user text') }));
	});
});
