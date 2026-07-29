import { describe, expect, it, vi } from 'vitest';
import { translateWithGemini } from '../../src/lib/aiGateway';

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
});
