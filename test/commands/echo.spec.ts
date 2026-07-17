import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));
import TgMessage from '../../src/lib/telegram';
import { attitudeResponses } from '../../src/lib/liveConfig';
import { escapeHtml } from '../../src/lib/util';
import { handleEcho } from '../../src/commands/echo';

function makeMsg(o: any = {}): any {
	return { type: 'message', chatId: -100999, from: { id: 1, first_name: 'Echo' }, isCommand: true, command: 'echo', args: ['今天天气不错'], message: { message_id: 1, chat: { id: -100999 } }, ...o };
}

describe('/echo', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => vi.restoreAllMocks());

	it('生成静态评价：用户内容 + 骰点 + 态度 + 预置文案（不调用 AI）', async () => {
		// 第一次 random 决定骰点：floor(4/6*6)+1 = 5 → 态度“同意”；第二次决定选用的预置文案 index 0
		vi.spyOn(Math, 'random').mockReturnValueOnce(4 / 6).mockReturnValueOnce(0);

		await handleEcho(makeMsg(), {} as any);

		const reply = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1];
		expect(reply?.text).toContain('今天天气不错');
		expect(reply?.text).toContain('骰娘扔出了一个 5');
		expect(reply?.text).toContain('同意');
		expect(reply?.text).toContain(escapeHtml(attitudeResponses['同意'][0]));
	});

	it('空内容时提示“(没有内容)”', async () => {
		await handleEcho(makeMsg({ args: [], text: '/echo' }), {} as any);
		expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('没有内容');
	});

	it('黑名单外的普通用户正常回复', async () => {
		await handleEcho(makeMsg(), {} as any);
		expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('Echo 说：');
	});
});
