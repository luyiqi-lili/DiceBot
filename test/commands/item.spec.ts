import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/tgMessage', () => ({
	default: {
		sendText: vi.fn().mockResolvedValue({ ok: true }),
		send: vi.fn().mockResolvedValue({ ok: true }),
		buildInlineKeyboard: vi.fn((b: any) => ({ inline_keyboard: b })),
		fetchChatMember: vi.fn().mockResolvedValue({ first_name: 'ItemUser' }),
	},
}));

import TgMessage from '../../src/lib/tgMessage';

function makeMsg(overrides: Record<string, any> = {}): any {
	return {
		type: 'message', chatId: -100999, threadId: undefined,
		from: { id: 1, first_name: 'Owner' }, isCommand: true, command: 'item', args: [],
		text: '/item', message: { message_id: 1, from: { id: 1, first_name: 'Owner' }, chat: { id: -100999 } },
		...overrides,
	};
}

const MOCK_KV = {
	ITEM_STORE: {
		get: vi.fn().mockResolvedValue(null),
		put: vi.fn().mockResolvedValue(undefined),
		list: vi.fn().mockResolvedValue({ keys: [] }),
	},
};

import { handleItem } from '../../src/commands/item';

describe('/item', () => {
	beforeEach(() => vi.clearAllMocks());

	it('无子命令显示空物品列表', async () => {
		await handleItem(makeMsg({ command: 'item', args: [] }), MOCK_KV as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('物品');
	});

	it('/item create 回复自己消息时创建物品', async () => {
		MOCK_KV.ITEM_STORE.get.mockResolvedValue(JSON.stringify([]));
		await handleItem(makeMsg({
			args: ['create'],
			isReply: true,
			replyToMessage: { message_id: 5, from: { id: 1, first_name: 'Owner' }, text: 'a cool thing' },
		}), MOCK_KV as any);
		expect(MOCK_KV.ITEM_STORE.put).toHaveBeenCalled();
	});

	it('/item list 显示物品', async () => {
		MOCK_KV.ITEM_STORE.get.mockResolvedValue(JSON.stringify([{ remark: 'sword', content: 'a sharp blade', link: 'https://t.me/c/2742074355/123', timestamp: '2025-01-01' }]));
		await handleItem(makeMsg({ args: ['list'] }), MOCK_KV as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('sword');
	});
});
