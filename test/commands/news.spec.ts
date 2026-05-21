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
		from: { id: 1, first_name: 'Reporter' }, isCommand: true, command: 'news', args: [],
		text: '/news', message: { message_id: 1, from: { id: 1, first_name: 'Reporter' }, chat: { id: -100999 } },
		...overrides,
	};
}

const MOCK_KV = {
	NEWS_STORE: {
		get: vi.fn().mockResolvedValue(null),
		put: vi.fn().mockResolvedValue(undefined),
		list: vi.fn().mockResolvedValue({ keys: [] }),
	},
	BOT_USERNAME: 'TestBot',
};

import { handleNews } from '../../src/commands/news';

describe('/news', () => {
	beforeEach(() => vi.clearAllMocks());

	it('查询模式显示今日无消息', async () => {
		await handleNews(makeMsg(), MOCK_KV as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('暂无小道消息');
	});

	it('回复消息时新增爆料', async () => {
		MOCK_KV.NEWS_STORE.get.mockResolvedValue(null);
		await handleNews(makeMsg({
			isReply: true,
			replyToMessage: { message_id: 5, from: { first_name: 'Speaker', username: 'speaker' }, text: 'secret info' },
		}), MOCK_KV as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('爆料');
		expect(MOCK_KV.NEWS_STORE.put).toHaveBeenCalled();
	});
});
