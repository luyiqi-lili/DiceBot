import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then((m) => m.mockTgMessageModule));
vi.mock('../../src/lib/personalApiQuota', () => ({ inspectPersonalApiQuotas: vi.fn() }));

import TgMessage from '../../src/lib/telegram';
import { inspectPersonalApiQuotas } from '../../src/lib/personalApiQuota';
import { handleQuota } from '../../src/commands/quota';

describe('/quota', () => {
	beforeEach(() => vi.clearAllMocks());

	it('shows only the private sender\'s live balance and availability summary', async () => {
		vi.mocked(inspectPersonalApiQuotas).mockResolvedValue([
			{ provider: 'openrouter', displayName: 'OpenRouter', fingerprint: 'abcd1234', status: 'available', detail: '额度接口可用', credits: { total: 10, used: 2.5, remaining: 7.5 } },
			{ provider: 'google-gemini', displayName: 'Google Gemini', fingerprint: 'efgh5678', status: 'available', detail: '模型列表可访问', models: ['gemini-2.5-flash'] },
		] as any);

		await handleQuota({ chatId: 123, from: { id: 456 }, message: { chat: { id: 123, type: 'private' }, from: { id: 456 } } } as any, { DB: {}, DONATION_ENCRYPTION_KEY: 'key' } as any);

		expect(inspectPersonalApiQuotas).toHaveBeenCalledWith(expect.anything(), 456);
		const reply = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(reply.text).toContain('OpenRouter');
		expect(reply.text).toContain('总 10 / 已用 2.5 / 剩余 7.5');
		expect(reply.text).toContain('Google Gemini');
		expect(reply.parse_mode).toBe('HTML');
	});

	it('rejects group queries without checking any credentials', async () => {
		await handleQuota({ chatId: -100, from: { id: 456 }, message: { chat: { id: -100, type: 'supergroup' }, from: { id: 456 } } } as any, {} as any);
		expect(inspectPersonalApiQuotas).not.toHaveBeenCalled();
		expect(vi.mocked(TgMessage.sendText).mock.calls[0][1].text).toContain('只支持与机器人单独聊天');
	});
});
