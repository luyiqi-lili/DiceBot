import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/tgMessage', () => ({
	default: {
		sendText: vi.fn().mockResolvedValue({ ok: true }),
		send: vi.fn().mockResolvedValue({ ok: true }),
		buildInlineKeyboard: vi.fn((b: any) => ({ inline_keyboard: b })),
	},
}));

import TgMessage from '../../src/lib/tgMessage';

function makeMsg(overrides: Record<string, any> = {}): any {
	return {
		type: 'message', chatId: -100999, threadId: undefined,
		from: { id: 1, first_name: 'FreqUser' }, isCommand: true, command: 'like', args: [],
		text: '/like', message: { message_id: 1, from: { id: 1, first_name: 'FreqUser' }, chat: { id: -100999 } },
		...overrides,
	};
}

const MOCK_KV = {
	TGBOTCOUNT: {
		get: vi.fn().mockResolvedValue(null),
		put: vi.fn().mockResolvedValue(undefined),
		list: vi.fn().mockResolvedValue({ keys: [] }),
	},
};

import { handleLike } from '../../src/commands/like';

describe('/like', () => {
	beforeEach(() => vi.clearAllMocks());

	it('查询自己的使用次数', async () => {
		MOCK_KV.TGBOTCOUNT.get.mockResolvedValue(JSON.stringify({ count: 42, firstName: 'FreqUser' }));
		await handleLike(makeMsg(), MOCK_KV as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('42');
	});

	it('/like all 显示榜单', async () => {
		MOCK_KV.TGBOTCOUNT.list.mockResolvedValue({
			keys: [
				{ name: 'count:111' },
				{ name: 'count:222' },
			],
		});
		MOCK_KV.TGBOTCOUNT.get.mockImplementation(async (key: string) => {
			if (key === 'count:111') return JSON.stringify({ count: 100, firstName: 'Alice' });
			if (key === 'count:222') return JSON.stringify({ count: 50, firstName: 'Bob' });
			return null;
		});
		await handleLike(makeMsg({ args: ['all'] }), MOCK_KV as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('Top');
		expect(c.text).toContain('Alice');
		expect(c.text).toContain('100');
	});
});
