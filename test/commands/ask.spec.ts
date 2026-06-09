import { beforeEach, describe, expect, it, vi } from 'vitest';

const deepseek = vi.hoisted(() => ({
	callDeepSeekChat: vi.fn(),
}));

vi.mock('../../src/lib/tgMessage', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));
vi.mock('../../src/lib/deepseekClient', () => deepseek);

import TgMessage from '../../src/lib/tgMessage';
import { handleAsk } from '../../src/commands/ask';

function makeMsg(o: any = {}): any {
	return {
		type: 'message',
		chatId: -100999,
		threadId: 66,
		from: { id: 1, first_name: '提问者' },
		isCommand: true,
		command: 'ask',
		args: [],
		text: '/ask',
		message: { message_id: 10, chat: { id: -100999 }, text: '/ask' },
		...o,
	};
}

describe('/ask', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		deepseek.callDeepSeekChat.mockReset();
	});

	it('requires replying to a text message', async () => {
		await handleAsk(makeMsg(), {} as any);

		expect(deepseek.callDeepSeekChat).not.toHaveBeenCalled();
		expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]).toMatchObject({
			chat_id: -100999,
			message_thread_id: 66,
		});
		expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('回复一条');
	});

	it('asks DeepSeek to judge whether the replied question is correct and reasonable', async () => {
		deepseek.callDeepSeekChat.mockResolvedValue('这个问题基本合理，但需要补充时间范围。');

		await handleAsk(
			makeMsg({
				isReply: true,
				replyToMessage: {
					message_id: 9,
					text: '2024 年最好的模型是哪一个？',
					from: { id: 2, first_name: 'Alice' },
				},
			}),
			{ DEEPSEEK_API_KEY: 'sk-test', DEEPSEEK_MODEL: 'deepseek-v4-pro' } as any,
		);

		expect(deepseek.callDeepSeekChat).toHaveBeenCalledWith(
			expect.objectContaining({ DEEPSEEK_MODEL: 'deepseek-v4-pro' }),
			expect.objectContaining({
				messages: expect.arrayContaining([
					expect.objectContaining({ role: 'system', content: expect.stringContaining('骰娘莉莉') }),
					expect.objectContaining({ role: 'user', content: expect.stringContaining('2024 年最好的模型是哪一个？') }),
				]),
			}),
		);
		const reply = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1];
		expect(reply.text).toContain('莉莉看了一下');
		expect(reply.text).toContain('这个问题基本合理');
		expect(reply.reply_to_message_id).toBe(9);
	});

	it('reports DeepSeek configuration errors without leaking details', async () => {
		deepseek.callDeepSeekChat.mockRejectedValue(new Error('Missing DEEPSEEK_API_KEY'));

		await handleAsk(
			makeMsg({
				isReply: true,
				replyToMessage: { message_id: 9, text: '这个说法对吗？' },
			}),
			{} as any,
		);

		expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('还没接上');
		expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).not.toContain('sk-');
	});
});
