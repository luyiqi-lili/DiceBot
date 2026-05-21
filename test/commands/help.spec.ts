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
		from: { id: 1, first_name: 'User' }, isCommand: true, command: 'help', args: [],
		message: { message_id: 1, chat: { id: -100999 } },
		...overrides,
	};
}

import { handleHelp } from '../../src/commands/help';

describe('/help', () => {
	beforeEach(() => vi.clearAllMocks());

	it('发送帮助文本包含常用命令', async () => {
		await handleHelp(makeMsg(), {} as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('可用命令');
		expect(c.text).toContain('/roll');
		expect(c.text).toContain('/fish');
		expect(c.text).toContain('/coin');
	});
});
