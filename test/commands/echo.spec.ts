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
		from: { id: 1, first_name: 'Echo' }, isCommand: true, command: 'echo', args: ['今天天气不错'],
		text: '/echo 今天天气不错', message: { message_id: 1, from: { id: 1, first_name: 'Echo' }, chat: { id: -100999 } },
		...overrides,
	};
}

import { handleEcho } from '../../src/commands/echo';

describe('/echo', () => {
	beforeEach(() => vi.clearAllMocks());

	it('正常使用发送骰娘态度文本', async () => {
		await handleEcho(makeMsg(), {} as any);
		expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalled();
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('骰娘');
		expect(c.text).toContain('今天天气不错');
	});

	it('无 args 时从 text 提取内容', async () => {
		await handleEcho(makeMsg({ args: [], text: '/echo 测试内容' }), {} as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('测试内容');
	});

	it('空内容显示"(没有内容)"', async () => {
		await handleEcho(makeMsg({ args: [], text: '/echo' }), {} as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('没有内容');
	});
});
