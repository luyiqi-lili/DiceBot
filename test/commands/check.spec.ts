import { describe, it, expect, vi, beforeEach } from 'vitest';

const aiClient = vi.hoisted(() => ({
	callAIChat: vi.fn(),
	hasAIChatProvider: vi.fn(),
}));

vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));
vi.mock('../../src/lib/aiClient', () => aiClient);

import TgMessage from '../../src/lib/telegram';
import { handleCheck } from '../../src/commands/check';

function makeParsed(o: any = {}): any {
	return {
		type: 'message',
		chatId: -100999,
		threadId: 89,
		from: { id: 12345, first_name: '测试用户' },
		isCommand: true,
		command: 'check',
		args: [],
		message: { message_id: 1, chat: { id: -100999 }, message_thread_id: 89 },
		...o,
	};
}

describe('/check', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		aiClient.callAIChat.mockReset();
		aiClient.hasAIChatProvider.mockReset();
		aiClient.hasAIChatProvider.mockReturnValue(false);
	});

	it('有 AI 配置时把相关 TS 逻辑交给 DeepSeek 生成判断', async () => {
		aiClient.hasAIChatProvider.mockReturnValue(true);
		aiClient.callAIChat.mockResolvedValue('莉莉看过代码啦：周年庆当天固定给 50 <金币>。');

		await handleCheck(
			makeParsed({ args: ['每日签到周年庆', '50c', '的触发逻辑是什么'] }),
			{ DEEPSEEK_API_KEY: 'sk-test', DEEPSEEK_MODEL: 'deepseek-v4-pro' } as any,
		);

		expect(aiClient.callAIChat).toHaveBeenCalledWith(
			expect.objectContaining({ DEEPSEEK_MODEL: 'deepseek-v4-pro' }),
			expect.objectContaining({
				temperature: 0.2,
				messages: expect.arrayContaining([
					expect.objectContaining({ role: 'system', content: expect.stringContaining('骰娘莉莉') }),
					expect.objectContaining({ role: 'user', content: expect.stringContaining('每日签到周年庆 50c 的触发逻辑是什么') }),
					expect.objectContaining({ role: 'user', content: expect.stringContaining('src/commands/coin.ts') }),
					expect.objectContaining({ role: 'user', content: expect.stringContaining('VIOLET_ANNIVERSARY_PRAY_DATES') }),
					expect.objectContaining({ role: 'user', content: expect.stringContaining('执行结果') }),
				]),
			}),
		);

		const reply = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1];
		expect(reply.text).toContain('莉莉看过代码啦');
		expect(reply.text).toContain('&lt;金币&gt;');
		expect(reply.parse_mode).toBe('HTML');
		expect(reply.message_thread_id).toBe(89);
	});

	it('AI 调用失败时使用本地兜底判断', async () => {
		aiClient.hasAIChatProvider.mockReturnValue(true);
		aiClient.callAIChat.mockRejectedValue(new Error('upstream failed'));

		await handleCheck(
			makeParsed({ args: ['每日签到周年庆', '50c', '的触发逻辑是什么'] }),
			{ DEEPSEEK_API_KEY: 'sk-test' } as any,
		);

		const text = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text;
		expect(text).toContain('莉莉查到现在的判断');
		expect(text).toContain('固定为 50');
		expect(text).not.toContain('upstream failed');
	});

	it('有 AI 配置时未预设的问题也交给模型按可用上下文判断', async () => {
		aiClient.hasAIChatProvider.mockReturnValue(true);
		aiClient.callAIChat.mockResolvedValue('这段上下文只能确认 /fish 会进入钓鱼处理器，隐藏保底细节莉莉还不能确认。');

		await handleCheck(
			makeParsed({ args: ['钓鱼', '隐藏保底'] }),
			{ DEEPSEEK_API_KEY: 'sk-test' } as any,
		);

		expect(aiClient.callAIChat).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				messages: expect.arrayContaining([
					expect.objectContaining({ role: 'user', content: expect.stringContaining('钓鱼 隐藏保底') }),
					expect.objectContaining({ role: 'user', content: expect.stringContaining('src/index.ts') }),
				]),
			}),
		);
		expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('/fish 会进入钓鱼处理器');
	});

	it('回答每日签到周年庆 50c 触发逻辑', async () => {
		await handleCheck(makeParsed({ args: ['每日签到周年庆', '50c', '的触发逻辑是什么'] }), {} as any);

		const text = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text;
		expect(text).toContain('2026-06-19');
		expect(text).toContain('2026-06-21');
		expect(text).toContain('固定 50');
		expect(text).toContain('/coin pray');
		expect(text).toContain('允许话题');
		expect(text).toContain('2026-06-29');
	});

	it('回答每日签到的当前判断规则', async () => {
		await handleCheck(makeParsed({ args: ['每日签到', '怎么判定'] }), {} as any);

		const text = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text;
		expect(text).toContain('每天一次');
		expect(text).toContain('coin_pray');
		expect(text).toContain('8-12');
		expect(text).toContain('2025-08-12');
	});

	it('问题为空时提示写具体一点', async () => {
		await handleCheck(makeParsed(), {} as any);

		expect(aiClient.callAIChat).not.toHaveBeenCalled();
		const text = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text;
		expect(text).toContain('写具体一点');
		expect(text).toContain('/check 每日签到周年庆 50c');
	});

	it('问题太泛时提示可查询的具体方向', async () => {
		aiClient.hasAIChatProvider.mockReturnValue(true);

		await handleCheck(makeParsed({ args: ['规则'] }), {} as any);

		expect(aiClient.callAIChat).not.toHaveBeenCalled();
		const text = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text;
		expect(text).toContain('问题有点大');
		expect(text).toContain('每日签到');
	});

	it('没有 AI 配置时未收录的问题给出无法确认提示', async () => {
		await handleCheck(makeParsed({ args: ['钓鱼', '隐藏保底'] }), {} as any);

		expect(aiClient.callAIChat).not.toHaveBeenCalled();
		const text = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text;
		expect(text).toContain('暂时还不能确认');
		expect(text).toContain('命令名');
	});
});
