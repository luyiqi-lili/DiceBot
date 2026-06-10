import { beforeEach, describe, expect, it, vi } from 'vitest';

const deepseek = vi.hoisted(() => ({
	callDeepSeekChat: vi.fn(),
	getDeepSeekApiKeys: vi.fn((env: any) => {
		const keys = [env.DEEPSEEK_API_KEY, env.DEEPSEEK_API_KEYS].filter(Boolean);
		return keys;
	}),
}));

vi.mock('../../src/lib/deepseekClient', () => deepseek);

import { callAIChat, hasAIChatProvider } from '../../src/lib/aiClient';

describe('aiClient', () => {
	beforeEach(() => {
		deepseek.callDeepSeekChat.mockReset();
	});

	it('delegates to DeepSeek by default', async () => {
		deepseek.callDeepSeekChat.mockResolvedValue('ok');

		const result = await callAIChat({ DEEPSEEK_API_KEY: 'sk-test' } as any, {
			messages: [{ role: 'user', content: 'hello' }],
			temperature: 0.2,
			maxTokens: 100,
			timeoutMs: 1000,
		});

		expect(result).toBe('ok');
		expect(deepseek.callDeepSeekChat).toHaveBeenCalledWith(
			expect.objectContaining({ DEEPSEEK_API_KEY: 'sk-test' }),
			expect.objectContaining({
				messages: [{ role: 'user', content: 'hello' }],
				temperature: 0.2,
				maxTokens: 100,
				timeoutMs: 1000,
			}),
		);
	});

	it('rejects unsupported providers with a configuration error', async () => {
		await expect(callAIChat({ AI_PROVIDER: 'unknown' } as any, {
			messages: [{ role: 'user', content: 'hello' }],
		})).rejects.toThrow('Unsupported AI_PROVIDER');
		expect(deepseek.callDeepSeekChat).not.toHaveBeenCalled();
	});

	it('reports DeepSeek availability through the generic provider helper', () => {
		expect(hasAIChatProvider({} as any)).toBe(false);
		expect(hasAIChatProvider({ DEEPSEEK_API_KEY: 'sk-test' } as any)).toBe(true);
		expect(hasAIChatProvider({ AI_PROVIDER: 'unknown', DEEPSEEK_API_KEY: 'sk-test' } as any)).toBe(false);
	});
});
