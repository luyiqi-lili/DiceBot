import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));

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
	beforeEach(() => vi.clearAllMocks());

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

		const text = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text;
		expect(text).toContain('写具体一点');
		expect(text).toContain('/check 每日签到周年庆 50c');
	});

	it('问题太泛时提示可查询的具体方向', async () => {
		await handleCheck(makeParsed({ args: ['规则'] }), {} as any);

		const text = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text;
		expect(text).toContain('问题有点大');
		expect(text).toContain('每日签到');
	});

	it('未收录的问题给出无法确认提示', async () => {
		await handleCheck(makeParsed({ args: ['钓鱼', '隐藏保底'] }), {} as any);

		const text = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text;
		expect(text).toContain('暂时还不能确认');
		expect(text).toContain('命令名');
	});
});
