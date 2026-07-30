import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then((m) => m.mockTgMessageModule));
vi.mock('../../src/lib/apiKeyDonations', () => ({ ensureGatewayCredentialColumns: vi.fn() }));

import TgMessage from '../../src/lib/telegram';
import { handleStatus } from '../../src/commands/status';

describe('/status', () => {
	beforeEach(() => vi.clearAllMocks());

	function poolDb() {
		return {
			prepare: vi.fn(() => ({
				all: vi.fn().mockResolvedValue({ results: [
					{ provider: 'google-gemini', cost_class: 'completely_free', key_count: 2 },
					{ provider: 'deepseek', cost_class: 'paid', key_count: 1 },
				] }),
			})),
		};
	}

	it('groups Gateway services by cost and never exposes secret values', async () => {
		const env = {
			TOKEN: 'bot-secret', EXTERNAL_API_KEY: 'external-secret',
			AI_GATEWAY_ID: 'default', AI_GATEWAY_TOKEN: 'gateway-secret',
			AI_GATEWAY_MANAGEMENT_TOKEN: 'management-secret', AI_GATEWAY_ACCOUNT_ID: 'account-id',
			AI: {}, DB: poolDb(),
			TGBOTCOUNT: {}, NEWS_STORE: {}, TOPIC_KV: {}, BOOK_STORE: {}, FISHING_RECORD_KV: {}, FISH_KV: {}, AFFECTION_KV: {}, ITEM_STORE: {}, COIN_KV: {},
			COIN_DO: {}, LOTTERY_DO: {},
		};
		await handleStatus({ chatId: -100, threadId: 42 } as any, env as any);
		const reply = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(reply).toMatchObject({ chat_id: -100, message_thread_id: 42, parse_mode: 'HTML' });
		expect(reply.text).toContain('<b>完全免费</b>');
		expect(reply.text).toContain('Google Gemini：2 把 Gateway 密钥（轮询）');
		expect(reply.text).toContain('<b>免费但有限额</b>');
		expect(reply.text).toContain('<b>收费</b>');
		expect(reply.text).toContain('DeepSeek：1 把 Gateway 密钥（轮询）');
		expect(reply.text).toContain('翻译：✅ 完全免费小模型池（Gemini / Ollama / Workers AI）');
		expect(reply.text).toContain('PR 审核：✅ 免费限额大模型池（Ollama → Workers AI）');
		expect(reply.text).toContain('Workers AI 小模型：✅ Llama 3.2 3B');
		expect(reply.text).toContain('Workers AI 大模型：✅ Llama 3.3 70B');
		for (const secret of ['bot-secret', 'external-secret', 'gateway-secret', 'management-secret']) {
			expect(reply.text).not.toContain(secret);
		}
	});

	it('shows unavailable routing when Gateway authentication is missing', async () => {
		await handleStatus({ chatId: 1 } as any, { TOKEN: 'bot', AI: {} } as any);
		const reply = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(reply.text).toContain('推理网关：❌ 未配置');
		expect(reply.text).toContain('翻译：❌ 无可用免费池');
		expect(reply.text).toContain('PR 审核：❌ 不可用');
	});
});
