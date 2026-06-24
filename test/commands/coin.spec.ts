import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));
vi.mock('../../src/lib/coinService', () => import('../helpers/mocks').then(m => m.mockCoinService));
import TgMessage from '../../src/lib/telegram';
import * as coinService from '../../src/lib/coinService';
import { handleCoin } from '../../src/commands/coin';

const MOCK_ENV = { COIN_DO: {} } as any;

function makeParsed(o: any = {}): any {
	return { type: 'message', chatId: -100999, from: { id: 12345, first_name: '测试用户' }, isCommand: true, command: 'coin', message: { message_id: 1, chat: { id: -100999 } }, ...o };
}

function makeCoinDo() {
	const store = new Map<string, string>();
	const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input));
		if (init?.method === 'POST') {
			const body = JSON.parse(String(init.body));
			store.set(body.key, body.value);
			return new Response('', { status: 200 });
		}
		return new Response(store.get(url.searchParams.get('key') ?? '') ?? '', { status: 200 });
	});
	return {
		idFromName: vi.fn(() => 'coins'),
		get: vi.fn(() => ({ fetch })),
	};
}

function makeAllowedPrayParsed(): any {
	return makeParsed({
		args: ['pray'],
		chatId: -1002970430696,
		threadId: 89,
		message: { message_id: 1, chat: { id: -1002970430696 }, message_thread_id: 89 },
	});
}

describe('balance', () => {
	beforeEach(() => vi.clearAllMocks());
	it('查询余额', async () => { vi.mocked(coinService.getBalance).mockResolvedValue(888); await handleCoin(makeParsed(), MOCK_ENV); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('888'); });
	it('余额0', async () => { vi.mocked(coinService.getBalance).mockResolvedValue(0); await handleCoin(makeParsed(), MOCK_ENV); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('0'); });
});
describe('pray', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => vi.useRealTimers());
	it('祈祷', async () => { await handleCoin(makeParsed({ args: ['pray'] }), MOCK_ENV); expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalled(); });
	it.each(['2026-06-19', '2026-06-21', '2026-06-29'])('紫罗兰周年庆 %s 签到固定奖励 50 coin', async (date) => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(`${date}T12:00:00.000Z`));
		const env = { COIN_DO: makeCoinDo() } as any;

		await handleCoin(makeAllowedPrayParsed(), env);

		expect(coinService.takeFromTreasury).toHaveBeenCalledWith(env, env.COIN_DO, '12345', 50, '祈祷', true);
		expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('50');
	});
	it('紫罗兰周年庆未指定日期不使用固定 50 coin', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-06-20T12:00:00.000Z'));
		const env = { COIN_DO: makeCoinDo() } as any;

		await handleCoin(makeAllowedPrayParsed(), env);

		const gain = vi.mocked(coinService.takeFromTreasury).mock.calls[0]?.[3];
		expect(gain).not.toBe(50);
		expect(gain).toBeGreaterThanOrEqual(8);
		expect(gain).toBeLessThanOrEqual(12);
	});
	it('紫罗兰周年庆结束后恢复原本签到奖励范围', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-06-22T12:00:00.000Z'));
		const env = { COIN_DO: makeCoinDo() } as any;

		await handleCoin(makeAllowedPrayParsed(), env);

		const gain = vi.mocked(coinService.takeFromTreasury).mock.calls[0]?.[3];
		expect(gain).toBeGreaterThanOrEqual(8);
		expect(gain).toBeLessThanOrEqual(12);
	});
	it('完成每日祈祷后追加今日运势', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-06-22T12:00:00.000Z'));
		vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0);
		const env = { COIN_DO: makeCoinDo() } as any;

		await handleCoin(makeAllowedPrayParsed(), env);

		const text = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text;
		expect(text).toContain('你祈祷获得了 8 💰');
		expect(text).toContain('今日运势：小吉');
		expect(text).toContain('适合把想做的小事往前推一步');
	});
});
describe('send', () => {
	beforeEach(() => vi.clearAllMocks());
	it('回复转账', async () => { vi.mocked(coinService.getBalance).mockResolvedValue(500); await handleCoin(makeParsed({ args: ['send', '50'], message: { message_id: 1, from: { id: 12345 }, chat: { id: -100999 }, reply_to_message: { message_id: 99, from: { id: 67890 } } }, isReply: true }), MOCK_ENV); expect(coinService.transfer).toHaveBeenCalled(); });
	it('余额不足', async () => { vi.mocked(coinService.getBalance).mockResolvedValue(10); await handleCoin(makeParsed({ args: ['send', '50'], message: { message_id: 1, from: { id: 12345 }, chat: { id: -100999 }, reply_to_message: { message_id: 88, from: { id: 67890 } } }, isReply: true }), MOCK_ENV); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('转账失败'); });
	it('未回复', async () => { await handleCoin(makeParsed({ args: ['send', '50'] }), MOCK_ENV); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('回复'); });
});
describe('check', () => {
	beforeEach(() => vi.clearAllMocks());
	it('管理员', async () => { vi.mocked(coinService.getTreasury).mockResolvedValue(5000); vi.mocked(coinService.sumAllUserBalances).mockResolvedValue(3000); await handleCoin(makeParsed({ args: ['check'], from: { id: 8080375150 } }), MOCK_ENV); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('5000'); });
	it('论坛主题内直接发送 check 不查询主题创建人余额', async () => {
		vi.mocked(coinService.getTreasury).mockResolvedValue(5000);
		vi.mocked(coinService.sumAllUserBalances).mockResolvedValue(3000);
		await handleCoin(makeParsed({
			args: ['check'],
			from: { id: 8080375150 },
			threadId: 89,
			isReply: false,
			message: {
				message_id: 120,
				message_thread_id: 89,
				is_topic_message: true,
				from: { id: 8080375150 },
				chat: { id: -100999 },
				reply_to_message: {
					message_id: 89,
					from: { id: 111, first_name: 'Topic Creator' },
					forum_topic_created: { name: 'Dice' },
				},
			},
		}), MOCK_ENV);

		expect(coinService.getBalance).not.toHaveBeenCalledWith(MOCK_ENV.COIN_DO, '111');
		expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('艾丽莎宝库：5000');
	});
	it('非管理员', async () => { await handleCoin(makeParsed({ args: ['check'] }), MOCK_ENV); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('权限'); });
});
describe('take', () => {
	beforeEach(() => vi.clearAllMocks());
	it('管理员取款', async () => { vi.mocked(coinService.getTreasury).mockResolvedValue(10000); await handleCoin(makeParsed({ args: ['take', '100'], from: { id: 8080375150 } }), MOCK_ENV); expect(coinService.takeFromTreasury).toHaveBeenCalled(); });
});
