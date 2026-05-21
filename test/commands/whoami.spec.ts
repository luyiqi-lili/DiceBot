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
		from: { id: 1, first_name: 'User' }, isCommand: true, command: 'whoami', args: [],
		message: { message_id: 1, from: { id: 1, first_name: 'User' }, chat: { id: -100999, title: 'TestGroup' } },
		...overrides,
	};
}

import { handleWhoami } from '../../src/commands/whoami';

describe('/whoami', () => {
	beforeEach(() => vi.clearAllMocks());

	it('显示自己的用户信息', async () => {
		await handleWhoami(makeMsg(), { TOKEN: 't' } as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('用户信息');
		expect(c.text).toContain('用户 ID');
	});

	it('回复时显示被回复者的信息', async () => {
		await handleWhoami(makeMsg({
			isReply: true,
			replyToMessage: { message_id: 5, from: { id: 999, first_name: 'Target' } },
		}), { TOKEN: 't' } as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('999');
	});
});
