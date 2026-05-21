import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/tgMessage', () => ({
	default: {
		sendText: vi.fn().mockResolvedValue({ ok: true }),
		send: vi.fn().mockResolvedValue({ ok: true }),
		buildInlineKeyboard: vi.fn((b: any) => ({ inline_keyboard: b })),
		answerCallbackQuery: vi.fn().mockResolvedValue({ ok: true }),
		fetchChatMember: vi.fn().mockResolvedValue({ first_name: 'MockUser' }),
	},
}));

vi.mock('../../src/lib/coinService', () => ({
	getBalance: vi.fn().mockResolvedValue(100),
	transfer: vi.fn().mockResolvedValue({ ok: true, fromNew: 90, toNew: 110 }),
}));

import TgMessage from '../../src/lib/tgMessage';

function makeMsg(overrides: Record<string, any> = {}): any {
	return {
		type: 'message', chatId: -100999, threadId: undefined,
		from: { id: 1, first_name: 'Red' }, isCommand: true, command: 'congrats', args: [],
		message: { message_id: 1, from: { id: 1, first_name: 'Red' }, chat: { id: -100999 } },
		...overrides,
	};
}

import { handleCongrats } from '../../src/commands/congrats';

describe('/congrats', () => {
	beforeEach(() => vi.clearAllMocks());

	it('无回复时提示', async () => {
		await handleCongrats(makeMsg(), {} as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('回复');
	});

	it('回复自己时提示不能自己回复自己', async () => {
		await handleCongrats(makeMsg({
			isReply: true,
			replyToMessage: { from: { id: 1, first_name: 'Red' } },
		}), { TOKEN: 't' } as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('不能自己回复自己');
	});

	it('回复他人时发送红包按钮消息', async () => {
		await handleCongrats(makeMsg({
			isReply: true,
			replyToMessage: { from: { id: 2, first_name: 'Green' } },
		}), { TOKEN: 't' } as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('恭喜发财');
	});
});
