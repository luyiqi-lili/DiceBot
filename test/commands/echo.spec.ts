import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const aiClient = vi.hoisted(() => ({
	callAIChat: vi.fn(),
}));

vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));
vi.mock('../../src/lib/aiClient', () => aiClient);
import TgMessage from '../../src/lib/telegram';

function makeMsg(o: any = {}): any {
	return { type: 'message', chatId: -100999, from: { id: 1, first_name: 'Echo' }, isCommand: true, command: 'echo', args: ['今天天气不错'], message: { message_id: 1, chat: { id: -100999 } }, ...o };
}
import { handleEcho } from '../../src/commands/echo';
describe('/echo', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		aiClient.callAIChat.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('calls LLM with user content, dice roll, attitude, and reference response in prompt', async () => {
		aiClient.callAIChat.mockResolvedValue('LLM 生成的骰娘评价');
		vi.spyOn(Math, 'random')
			.mockReturnValueOnce(4 / 6)
			.mockReturnValueOnce(0);

		await handleEcho(makeMsg(), { DEEPSEEK_API_KEY: 'sk-test' } as any);

		expect(aiClient.callAIChat).toHaveBeenCalledWith(
			expect.objectContaining({ DEEPSEEK_API_KEY: 'sk-test' }),
			expect.objectContaining({
				messages: expect.arrayContaining([
					expect.objectContaining({ role: 'system', content: expect.stringContaining('骰娘莉莉') }),
					expect.objectContaining({ role: 'user', content: expect.stringContaining('今天天气不错') }),
					expect.objectContaining({ role: 'user', content: expect.stringContaining('5') }),
					expect.objectContaining({ role: 'user', content: expect.stringContaining('同意') }),
					expect.objectContaining({ role: 'user', content: expect.stringContaining('我现在就跳个舞庆祝') }),
				]),
			}),
		);

		const reply = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1];
		expect(reply?.text).toContain('LLM 生成的骰娘评价');
		expect(reply?.text).not.toContain('我现在就跳个舞庆祝');
	});

	it('空内容', async () => {
		aiClient.callAIChat.mockResolvedValue('空内容也可以评价');

		await handleEcho(makeMsg({ args: [], text: '/echo' }), {} as any);

		expect(aiClient.callAIChat).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				messages: expect.arrayContaining([
					expect.objectContaining({ role: 'user', content: expect.stringContaining('(没有内容)') }),
				]),
			}),
		);
		expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('没有内容');
	});

	it('LLM 调用失败时明确提示服务不可用且不回退固定文案', async () => {
		aiClient.callAIChat.mockRejectedValue(new Error('provider down'));
		vi.spyOn(Math, 'random')
			.mockReturnValueOnce(4 / 6)
			.mockReturnValueOnce(0);

		await handleEcho(makeMsg(), {} as any);

		const replyText = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text;
		expect(replyText).toContain('服务暂时不可用');
		expect(replyText).not.toContain('我现在就跳个舞庆祝');
		expect(replyText).not.toContain('provider down');
	});
});
