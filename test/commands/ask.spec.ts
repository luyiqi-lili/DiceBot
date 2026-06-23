import { beforeEach, describe, expect, it, vi } from 'vitest';

const aiClient = vi.hoisted(() => ({
	callAIChat: vi.fn(),
}));

vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));
vi.mock('../../src/lib/aiClient', () => aiClient);

import TgMessage from '../../src/lib/telegram';
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
		aiClient.callAIChat.mockReset();
	});

	it('requires replying to a text message', async () => {
		await handleAsk(makeMsg(), {} as any);

		expect(aiClient.callAIChat).not.toHaveBeenCalled();
		expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]).toMatchObject({
			chat_id: -100999,
			message_thread_id: 66,
		});
		expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('回复一条');
	});

	it('asks AI to comment on whether the replied content is true and reasonable', async () => {
		aiClient.callAIChat.mockResolvedValue('莉莉看法：这件事有真实背景，但这个说法有点夸张。');

		await handleAsk(
			makeMsg({
				isReply: true,
				replyToMessage: {
					message_id: 9,
					text: '听说 2024 年所有 AI 模型都已经能完全替代程序员了。',
					from: { id: 2, first_name: 'Alice' },
				},
			}),
			{ DEEPSEEK_API_KEY: 'sk-test', DEEPSEEK_MODEL: 'deepseek-v4-pro' } as any,
		);

		expect(aiClient.callAIChat).toHaveBeenCalledWith(
			expect.objectContaining({ DEEPSEEK_MODEL: 'deepseek-v4-pro' }),
			expect.objectContaining({
				messages: expect.arrayContaining([
					expect.objectContaining({ role: 'system', content: expect.stringContaining('骰娘莉莉') }),
					expect.objectContaining({ role: 'system', content: expect.stringContaining('是否真的有这件事') }),
					expect.objectContaining({ role: 'user', content: expect.stringContaining('听说 2024 年所有 AI 模型都已经能完全替代程序员了。') }),
					expect.objectContaining({ role: 'user', content: expect.stringContaining('评论这段内容') }),
				]),
			}),
		);
		const reply = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1];
		expect(reply.text).toContain('莉莉看了一下');
		expect(reply.text).toContain('这件事有真实背景');
		expect(reply.reply_to_message_id).toBe(9);
	});

	it('reports AI configuration errors without leaking details', async () => {
		aiClient.callAIChat.mockRejectedValue(new Error('Missing DEEPSEEK_API_KEY'));

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
