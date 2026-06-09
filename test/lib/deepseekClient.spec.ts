import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callDeepSeekChat, getDeepSeekApiKeys } from '../../src/lib/deepseekClient';

describe('deepseekClient', () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('reads a single DEEPSEEK_API_KEY', () => {
		expect(getDeepSeekApiKeys({ DEEPSEEK_API_KEY: 'sk-test' } as any)).toEqual(['sk-test']);
	});

	it('reads JSON DEEPSEEK_API_KEYS', () => {
		expect(getDeepSeekApiKeys({ DEEPSEEK_API_KEYS: '["sk-a","sk-b"]' } as any)).toEqual(['sk-a', 'sk-b']);
	});

	it('calls DeepSeek chat completions with configured model', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ message: { content: '莉莉检查完啦。' } }],
			}),
		});
		vi.stubGlobal('fetch', fetchMock);

		const text = await callDeepSeekChat(
			{
				DEEPSEEK_API_KEY: 'sk-test',
				DEEPSEEK_MODEL: 'deepseek-v4-pro',
			} as any,
			{
				messages: [{ role: 'user', content: '这个问题合理吗？' }],
				maxTokens: 300,
				temperature: 0.2,
			},
		);

		expect(text).toBe('莉莉检查完啦。');
		expect(fetchMock).toHaveBeenCalledWith(
			'https://api.deepseek.com/chat/completions',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					Authorization: 'Bearer sk-test',
					'Content-Type': 'application/json',
				}),
			}),
		);
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.model).toBe('deepseek-v4-pro');
		expect(body.messages[0].content).toBe('这个问题合理吗？');
		expect(body.max_tokens).toBe(300);
		expect(body.temperature).toBe(0.2);
	});

	it('throws a configuration error when no key is available', async () => {
		await expect(callDeepSeekChat({} as any, {
			messages: [{ role: 'user', content: 'hi' }],
		})).rejects.toThrow('Missing DEEPSEEK_API_KEY');
	});
});
