import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/tgMessage', () => ({
	default: {
		sendText: vi.fn().mockResolvedValue({ ok: true }),
		send: vi.fn().mockResolvedValue({ ok: true }),
		buildInlineKeyboard: vi.fn((b: any) => ({ inline_keyboard: b })),
		editMessageText: vi.fn().mockResolvedValue({ ok: true }),
		deleteMessage: vi.fn().mockResolvedValue({ ok: true }),
		answerCallbackQuery: vi.fn().mockResolvedValue({ ok: true }),
		fetchChatMember: vi.fn().mockResolvedValue({ first_name: 'MockG' }),
	},
}));

import TgMessage from '../../src/lib/tgMessage';

function makeMsg(overrides: Record<string, any> = {}): any {
	return {
		type: 'message', chatId: -100999, threadId: undefined,
		from: { id: 1, first_name: 'Bob' }, isCommand: true, command: 'groll', args: [],
		message: { message_id: 1, from: { id: 1, first_name: 'Bob' }, chat: { id: -100999 } },
		...overrides,
	};
}

function makeCb(msgText: string, overrides: Record<string, any> = {}): any {
	return {
		type: 'callback_query', chatId: -100999,
		from: { id: 2, first_name: 'Carol' },
		callbackQuery: { id: 'cb1', from: { id: 2, first_name: 'Carol' }, message: { message_id: 10, chat: { id: -100999 }, text: msgText } },
		callbackData: { type: 'groll', action: 'accept' },
		...overrides,
	};
}

import { handleGroll, handleGrollCallback } from '../../src/commands/groll';

describe('/groll', () => {
	beforeEach(() => vi.clearAllMocks());

	it('发起群骰', async () => {
		await handleGroll(makeMsg({ args: ['赌奶茶'] }), {} as any);
		expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalled();
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('群骰');
	});

	it('加入掷点 → editMessageText', async () => {
		const initText = '🎲 Bob 发起了一个群骰\n\n其他玩家点击按钮加入掷点：';
		await handleGrollCallback(makeCb(initText).callbackQuery, makeCb(initText).callbackData, { TOKEN: 't' } as any);
		expect(vi.mocked(TgMessage.editMessageText)).toHaveBeenCalled();
	});

	it('已加入的用户看到提示', async () => {
		const text = '🎲 群骰\n- Carol：50\n\n其他玩家点击按钮加入掷点：';
		await handleGrollCallback(makeCb(text).callbackQuery, makeCb(text).callbackData, { TOKEN: 't' } as any);
		expect(vi.mocked(TgMessage.answerCallbackQuery)).toHaveBeenCalled();
	});

	it('结束群骰（有记录）', async () => {
		const text = '🎲 群骰\n- Alice：30\n- Bob：50\n- Carol：40\n\n其他玩家点击按钮加入掷点：';
		const cb = makeCb(text, {
			callbackData: { type: 'groll', action: 'end' },
			from: { id: 1, first_name: 'Bob' },
			callbackQuery: { id: 'cb2', from: { id: 1, first_name: 'Bob' }, message: { message_id: 10, chat: { id: -100999 }, text } },
		});
		await handleGrollCallback(cb.callbackQuery, cb.callbackData, { TOKEN: 't' } as any);
		expect(vi.mocked(TgMessage.editMessageText)).toHaveBeenCalled();
		const c = vi.mocked(TgMessage.editMessageText).mock.calls[0][1];
		expect(c.text).toContain('胜利者');
	});
});
