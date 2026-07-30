import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then((m) => m.mockTgMessageModule));

import TgMessage from '../../src/lib/telegram';
import { handleStatus } from '../../src/commands/status';

describe('/status', () => {
	beforeEach(() => vi.clearAllMocks());

	function healthyDonatedGeminiDb() {
		return {
			prepare: vi.fn(() => ({
				all: vi.fn().mockResolvedValue({
					results: [
						{
							provider: 'google-gemini',
							total_count: 2,
							shared_count: 2,
							healthy_shared_count: 1,
							pending_count: 1,
							unavailable_count: 0,
							translation_model_available: 1,
						},
						{
							provider: 'deepseek',
							total_count: 1,
							shared_count: 1,
							healthy_shared_count: 1,
							pending_count: 0,
							unavailable_count: 0,
							translation_model_available: 1,
						},
					],
				}),
			})),
		};
	}

	it('shows readiness without exposing any secret values', async () => {
		const env = {
			TOKEN: 'bot-secret', EXTERNAL_API_KEY: 'external-secret',
			AI_GATEWAY_ID: 'default', AI_GATEWAY_TOKEN: 'gateway-secret', DEEPSEEK_API_KEY: 'deepseek-secret',
			DONATION_ENCRYPTION_KEY: 'encryption-secret',
			GITHUB_REPOSITORY: 'owner/repo', GITHUB_TOKEN: 'github-secret', AI: {}, DB: healthyDonatedGeminiDb(),
			TGBOTCOUNT: {}, NEWS_STORE: {}, TOPIC_KV: {}, BOOK_STORE: {}, FISHING_RECORD_KV: {}, FISH_KV: {}, AFFECTION_KV: {}, ITEM_STORE: {}, COIN_KV: {},
			COIN_DO: {}, LOTTERY_DO: {},
		};

		await handleStatus({ chatId: -100, threadId: 42 } as any, env as any);

		const reply = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(reply).toMatchObject({ chat_id: -100, message_thread_id: 42, parse_mode: 'HTML' });
		expect(reply.text).toContain('捐赠 Gemini 密钥：✅ 可用于共享推理');
		expect(reply.text).toContain('捐赠 DeepSeek 密钥：✅ 可用于共享推理');
		expect(reply.text).toContain('AI 翻译：✅ 已就绪（首选捐赠 Gemini）');
		expect(reply.text).toContain('<b>捐赠 Token</b>');
		expect(reply.text).toContain('Google Gemini：总计 2｜共享 2｜共享健康 1｜待验证 1｜异常/停用 0｜翻译模型 ✅');
		expect(reply.text).toContain('DeepSeek：总计 1｜共享 1｜共享健康 1｜待验证 0｜异常/停用 0｜翻译模型 ✅');
		expect(reply.text).toContain('合计：3 个｜共享授权 3 个｜共享健康 2 个');
		expect(reply.text).toContain('外部 API 密钥：✅ 已配置');
		expect(reply.text).toContain('不解密或显示密钥');
		for (const secret of ['bot-secret', 'external-secret', 'gateway-secret', 'deepseek-secret', 'encryption-secret', 'github-secret']) {
			expect(reply.text).not.toContain(secret);
		}
	});

	it('identifies incomplete AI configuration', async () => {
		await handleStatus({ chatId: 1 } as any, { TOKEN: 'bot', AI: {} } as any);
		const reply = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(reply.text).toContain('AI 翻译：✅ 已就绪（首选捐赠 Gemini）');
		expect(reply.text).toContain('AI Gateway：❌ 未配置');
		expect(reply.text).toContain('捐赠凭据目录不可用');
	});

	it('does not treat the retired Google Worker secret as translation readiness', async () => {
		await handleStatus({ chatId: 1 } as any, { TOKEN: 'bot', AI: {}, GOOGLE_API_KEY: 'legacy-key' } as any);
		const reply = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(reply.text).toContain('捐赠 Gemini 密钥：❌ 无健康的共享凭据');
		expect(reply.text).toContain('AI 翻译：✅ 已就绪（首选捐赠 Gemini）');
		expect(reply.text).not.toContain('legacy-key');
	});
});
