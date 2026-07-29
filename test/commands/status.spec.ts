import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then((m) => m.mockTgMessageModule));

import TgMessage from '../../src/lib/telegram';
import { handleStatus } from '../../src/commands/status';

describe('/status', () => {
	beforeEach(() => vi.clearAllMocks());

	it('shows readiness without exposing any secret values', async () => {
		const env = {
			TOKEN: 'bot-secret', EXTERNAL_API_KEY: 'external-secret', GEMINI_API_KEY: 'gemini-secret',
			AI_GATEWAY_ID: 'default', AI_GATEWAY_TOKEN: 'gateway-secret', DEEPSEEK_API_KEY: 'deepseek-secret',
			GITHUB_REPOSITORY: 'owner/repo', GITHUB_TOKEN: 'github-secret', AI: {}, DB: {},
			TGBOTCOUNT: {}, NEWS_STORE: {}, TOPIC_KV: {}, BOOK_STORE: {}, FISHING_RECORD_KV: {}, FISH_KV: {}, AFFECTION_KV: {}, ITEM_STORE: {}, COIN_KV: {},
			COIN_DO: {}, LOTTERY_DO: {},
		};

		await handleStatus({ chatId: -100, threadId: 42 } as any, env as any);

		const reply = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(reply).toMatchObject({ chat_id: -100, message_thread_id: 42, parse_mode: 'HTML' });
		expect(reply.text).toContain('Gemini 翻译：✅ 已就绪');
		expect(reply.text).toContain('外部 API 密钥：✅ 已配置');
		expect(reply.text).toContain('不显示密钥内容');
		for (const secret of ['bot-secret', 'external-secret', 'gemini-secret', 'gateway-secret', 'deepseek-secret', 'github-secret']) {
			expect(reply.text).not.toContain(secret);
		}
	});

	it('identifies incomplete AI configuration', async () => {
		await handleStatus({ chatId: 1 } as any, { TOKEN: 'bot', AI: {}, GEMINI_API_KEY: 'gemini' } as any);
		const reply = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(reply.text).toContain('Gemini 翻译：❌ 配置不完整');
		expect(reply.text).toContain('AI Gateway：❌ 未配置');
	});

	it('recognizes the legacy Google key without exposing it', async () => {
		await handleStatus({ chatId: 1 } as any, { TOKEN: 'bot', AI: {}, GOOGLE_API_KEY: 'legacy-key' } as any);
		const reply = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(reply.text).toContain('Gemini API key：✅ 已配置（兼容旧 Google key）');
		expect(reply.text).not.toContain('legacy-key');
	});

	it('recognizes the legacy Google key pool without exposing it', async () => {
		await handleStatus({ chatId: 1 } as any, { TOKEN: 'bot', AI: {}, GOOGLE_API_KEYS: '["legacy-key"]' } as any);
		const reply = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(reply.text).toContain('Gemini API key：✅ 已配置（兼容旧 Google key）');
		expect(reply.text).not.toContain('legacy-key');
	});
});
