import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/tgMessage', () => ({
	default: {
		sendText: vi.fn().mockResolvedValue({ ok: true }),
		send: vi.fn().mockResolvedValue({ ok: true }),
		editMessageText: vi.fn().mockResolvedValue({ ok: true }),
		sendPhoto: vi.fn().mockResolvedValue({ ok: true }),
		answerCallbackQuery: vi.fn().mockResolvedValue({ ok: true }),
		fetchChatMember: vi.fn().mockResolvedValue({ first_name: 'Target' }),
		buildInlineKeyboard: vi.fn((b: any) => ({ inline_keyboard: b })),
	},
}));

import TgMessage from '../../src/lib/tgMessage';

function makeMsg(overrides: Record<string, any> = {}): any {
	return {
		type: 'message', chatId: -100999, threadId: undefined,
		from: { id: 1, first_name: 'Challenger' }, isCommand: true, command: 'duel', args: ['一杯奶茶'],
		text: '/duel 一杯奶茶', message: { message_id: 1, from: { id: 1, first_name: 'Challenger' }, chat: { id: -100999 } },
		...overrides,
	};
}

import { handleDuel } from '../../src/commands/duel';

describe('/duel', () => {
	beforeEach(() => vi.clearAllMocks());

	it('无回复时提示需要回复', async () => {
		await handleDuel(makeMsg(), { TOKEN: 't', BOT_USERNAME: 'Bot' } as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('回复');
	});

	it('回复自己时提示不能与自己决斗', async () => {
		await handleDuel(makeMsg({
			isReply: true,
			replyToMessage: { message_id: 5, from: { id: 1, first_name: 'Challenger' } },
		}), { TOKEN: 't', BOT_USERNAME: 'Bot' } as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('不能与自己决斗');
	});

	it('回复他人且带赌注时调用 sendPhoto', async () => {
		await handleDuel(makeMsg({
			isReply: true,
			replyToMessage: { message_id: 5, from: { id: 2, first_name: 'Opponent' } },
		}), { TOKEN: 't', BOT_USERNAME: 'Bot' } as any);
		expect(vi.mocked(TgMessage.sendPhoto)).toHaveBeenCalled();
	});

	it('无赌注内容时提示', async () => {
		await handleDuel(makeMsg({
			args: [],
			isReply: true,
			replyToMessage: { message_id: 5, from: { id: 2, first_name: 'Opponent' } },
		}), { TOKEN: 't', BOT_USERNAME: 'Bot' } as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('赌注');
	});
});
