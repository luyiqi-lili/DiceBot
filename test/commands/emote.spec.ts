import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/tgMessage', () => ({
	default: {
		sendText: vi.fn().mockResolvedValue({ ok: true }),
		send: vi.fn().mockResolvedValue({ ok: true }),
		buildInlineKeyboard: vi.fn((b: any) => ({ inline_keyboard: b })),
		editMessageText: vi.fn().mockResolvedValue({ ok: true }),
		deleteMessage: vi.fn().mockResolvedValue({ ok: true }),
		answerCallbackQuery: vi.fn().mockResolvedValue({ ok: true }),
		fetchChatMember: vi.fn().mockResolvedValue({ first_name: 'Target' }),
	},
}));

import TgMessage from '../../src/lib/tgMessage';

function makeMsg(overrides: Record<string, any> = {}): any {
	return {
		type: 'message', chatId: -100999, threadId: undefined,
		from: { id: 1, first_name: 'Actor' }, isCommand: true, command: 'em', args: ['开心地跳了起来'],
		text: '/em 开心地跳了起来', message: { message_id: 1, from: { id: 1, first_name: 'Actor' }, chat: { id: -100999 } },
		...overrides,
	};
}

import { handleEmote } from '../../src/commands/emote';

describe('/em', () => {
	beforeEach(() => vi.clearAllMocks());

	it('发送格式化动作文本', async () => {
		await handleEmote(makeMsg(), {} as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('<em>');
		expect(c.text).toContain('Actor');
		expect(c.text).toContain('开心地跳了起来');
	});

	it('无内容时发送错误提示', async () => {
		await handleEmote(makeMsg({ args: [], text: '/em' }), {} as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('错误');
	});

	it('回复消息时替换 %t 为目标名称', async () => {
		await handleEmote(makeMsg({
			args: ['给了', '%t', '一拳'],
			isReply: true,
			replyToMessage: { message_id: 5, from: { id: 2, first_name: 'Target' } },
		}), {} as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('Target');
	});

	it('使用 %t 但未回复时提示错误', async () => {
		await handleEmote(makeMsg({ args: ['%t'] }), {} as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('错误');
	});
});
