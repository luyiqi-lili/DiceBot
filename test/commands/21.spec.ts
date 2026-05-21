import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/tgMessage', () => ({
	default: {
		sendText: vi.fn().mockResolvedValue({ ok: true }),
		send: vi.fn().mockResolvedValue({ ok: true }),
		buildInlineKeyboard: vi.fn((b: any) => ({ inline_keyboard: b })),
		editMessageText: vi.fn().mockResolvedValue({ ok: true }),
		deleteMessage: vi.fn().mockResolvedValue({ ok: true }),
		answerCallbackQuery: vi.fn().mockResolvedValue({ ok: true }),
		fetchChatMember: vi.fn().mockResolvedValue({ first_name: 'MockPlayer' }),
	},
}));

import TgMessage from '../../src/lib/tgMessage';

function makeMsg(overrides: Record<string, any> = {}): any {
	return {
		type: 'message', chatId: -100999, threadId: undefined,
		from: { id: 1, first_name: 'Alice' }, isCommand: true, command: '21', args: [],
		message: { message_id: 1, from: { id: 1, first_name: 'Alice' }, chat: { id: -100999 } },
		...overrides,
	};
}

function makeCb(overrides: Record<string, any> = {}): any {
	return {
		type: 'callback_query', chatId: -100999,
		from: { id: 1, first_name: 'Alice' },
		callbackQuery: { id: 'cb1', from: { id: 1, first_name: 'Alice' }, message: { message_id: 10, chat: { id: -100999 }, text: '🎴 Alice 发起了21点游戏\n当前是第1轮次，请大家抽取第1张扑克牌\n\n其他玩家点击按钮抽牌：' } },
		callbackData: { type: '21', action: 'draw' },
		...overrides,
	};
}

import { handle21, handle21Callback } from '../../src/commands/21';

describe('/21', () => {
	beforeEach(() => vi.clearAllMocks());

	it('发起游戏发送消息', async () => {
		await handle21(makeMsg(), {} as any);
		expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalled();
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('21点');
	});

	it('draw 回调抽牌', async () => {
		await handle21Callback(makeCb().callbackQuery, makeCb().callbackData, { TOKEN: 't' } as any);
		expect(vi.mocked(TgMessage.editMessageText)).toHaveBeenCalled();
	});

	it('next 回调结束', async () => {
		const cb = makeCb({ callbackData: { type: '21', action: 'next' } });
		await handle21Callback(cb.callbackQuery, cb.callbackData, { TOKEN: 't' } as any);
		expect(vi.mocked(TgMessage.editMessageText)).toHaveBeenCalled();
	});
});
