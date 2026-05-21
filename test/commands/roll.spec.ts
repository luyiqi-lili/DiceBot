import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/tgMessage', () => ({
	default: {
		sendText: vi.fn().mockResolvedValue({ ok: true }),
		send: vi.fn().mockResolvedValue({ ok: true }),
		buildInlineKeyboard: vi.fn((b: any) => ({ inline_keyboard: b })),
		editMessageText: vi.fn().mockResolvedValue({ ok: true }),
		deleteMessage: vi.fn().mockResolvedValue({ ok: true }),
		answerCallbackQuery: vi.fn().mockResolvedValue({ ok: true }),
	},
}));

import TgMessage from '../../src/lib/tgMessage';

function makeMsg(overrides: Record<string, any> = {}): any {
	return {
		type: 'message', chatId: -100999, threadId: undefined,
		from: { id: 1, first_name: 'Dice' }, isCommand: true, command: 'roll', args: [],
		text: '/roll', message: { message_id: 1, from: { id: 1, first_name: 'Dice' }, chat: { id: -100999 } },
		...overrides,
	};
}

import { handleRoll } from '../../src/commands/roll';

describe('/roll', () => {
	beforeEach(() => { vi.clearAllMocks(); });

	it('无参数 → 1-100 随机', async () => {
		await handleRoll(makeMsg(), {} as any);
		expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalled();
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('点');
	});

	it('/roll 2d6 → 包含骰子信息', async () => {
		await handleRoll(makeMsg({ args: ['2d6'], command: 'roll', text: '/roll 2d6' }), {} as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('d6');
	});

	it('/roll 2d6+5 → 表达式', async () => {
		await handleRoll(makeMsg({ args: ['2d6+5'], command: 'roll', text: '/roll 2d6+5' }), {} as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('总和');
	});

	it('/rh → 隐藏掷骰（私聊+群提示）', async () => {
		await handleRoll(makeMsg({ command: 'rh', text: '/rh' }), {} as any);
		expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalledTimes(2);
	});

	it('无效表达式给出提示', async () => {
		await handleRoll(makeMsg({ args: ['abc'], text: '/roll abc' }), {} as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('无效');
	});
});
