import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/tgMessage', () => ({
	default: {
		sendText: vi.fn().mockResolvedValue({ ok: true }),
		send: vi.fn().mockResolvedValue({ ok: true }),
		buildInlineKeyboard: vi.fn((b: any) => ({ inline_keyboard: b })),
		fetchChatMember: vi.fn().mockResolvedValue({ first_name: 'BookUser' }),
	},
}));

import TgMessage from '../../src/lib/tgMessage';

function makeMsg(overrides: Record<string, any> = {}): any {
	return {
		type: 'message', chatId: -100999, threadId: undefined,
		from: { id: 1, first_name: 'Reader' }, isCommand: true, command: 'book', args: [],
		text: '/book', message: { message_id: 1, from: { id: 1, first_name: 'Reader' }, chat: { id: -100999 } },
		...overrides,
	};
}

const MOCK_KV = {
	BOOK_STORE: {
		get: vi.fn().mockResolvedValue(null),
		put: vi.fn().mockResolvedValue(undefined),
		list: vi.fn().mockResolvedValue({ keys: [] }),
	},
};

import { handleBook } from '../../src/commands/book';

describe('/book', () => {
	beforeEach(() => vi.clearAllMocks());

	it('无参数显示空书签列表', async () => {
		await handleBook(makeMsg(), MOCK_KV as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('书签');
	});

	it('回复自己消息时添加书签', async () => {
		MOCK_KV.BOOK_STORE.get.mockResolvedValue(JSON.stringify([]));
		await handleBook(makeMsg({
			isReply: true,
			replyToMessage: { message_id: 5, from: { id: 1, first_name: 'Reader' }, text: 'original msg' },
		}), MOCK_KV as any);
		expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalled();
		expect(MOCK_KV.BOOK_STORE.put).toHaveBeenCalled();
	});

	it('/book del #1 删除书签', async () => {
		const items = JSON.stringify([{ remark: 'test', link: 'https://t.me/c/2742074355/123', timestamp: '2025-01-01' }]);
		MOCK_KV.BOOK_STORE.get.mockResolvedValue(items);
		await handleBook(makeMsg({ args: ['del', '#1'] }), MOCK_KV as any);
		expect(MOCK_KV.BOOK_STORE.put).toHaveBeenCalled();
	});
});
