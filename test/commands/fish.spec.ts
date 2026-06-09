import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/lib/tgMessage', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));
vi.mock('../../src/lib/coinService', () => import('../helpers/mocks').then(m => m.mockCoinService));
import TgMessage from '../../src/lib/tgMessage';
import * as coinService from '../../src/lib/coinService';
import { handleFish } from '../../src/commands/fish';
import { FISH_ADD_COST, FISH_CATALOG_KEY } from '../../src/lib/fishCatalog';

function makeParsed(o: any = {}): any {
	return { type: 'message', chatId: -1002848481881, threadId: 66, from: { id: 12345, first_name: 'F' }, isCommand: true, command: 'fish', message: { message_id: 1, chat: { id: -1002848481881 }, message_thread_id: 66 }, ...o };
}

function makeKv(initial: Record<string, string> = {}): KVNamespace {
	const store = new Map(Object.entries(initial));
	return {
		get: vi.fn(async (key: string) => store.get(key) ?? null),
		put: vi.fn(async (key: string, value: string) => {
			store.set(key, value);
		}),
	} as any;
}

describe('fish', () => {
	beforeEach(() => vi.clearAllMocks());
	it('非 fish 命令不回复', async () => { await handleFish(makeParsed({ command: 'roll' }), {} as any); expect(vi.mocked(TgMessage.sendText)).not.toHaveBeenCalled(); });
	it('check 发送汇总', async () => { await handleFish(makeParsed({ args: ['check'] }), { FISHING_RECORD_KV: { get: vi.fn().mockResolvedValue(null) } } as any); expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalled(); });
	it('禁止房间', async () => { await handleFish(makeParsed({ chatId: -100111, args: ['3'] }), {} as any); expect(vi.mocked(TgMessage.sendText)).not.toHaveBeenCalled(); });
	it('余额充足抛竿', async () => { vi.mocked(coinService.getBalance).mockResolvedValue(50); await handleFish(makeParsed({ args: ['3'] }), { COIN_DO: {} as any, FISH_KV: makeKv(), FISHING_RECORD_KV: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined) } } as any); expect(coinService.addToTreasury).toHaveBeenCalled(); });
	it('余额不足提示', async () => { vi.mocked(coinService.getBalance).mockResolvedValue(0); await handleFish(makeParsed({ args: ['10'] }), { COIN_DO: {} as any, FISH_KV: makeKv(), FISHING_RECORD_KV: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined) } } as any); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('不足'); });
	it('达上限提示', async () => { vi.mocked(coinService.getBalance).mockResolvedValue(100); const rec = JSON.stringify({ date: new Date().toISOString().split('T')[0], count: 20, results: [{ baitCost: 1, hooked: false, fishValue: 0 }] }); await handleFish(makeParsed({ args: ['1'] }), { COIN_DO: {} as any, FISH_KV: makeKv(), FISHING_RECORD_KV: { get: vi.fn().mockResolvedValue(rec), put: vi.fn().mockResolvedValue(undefined) } } as any); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('20'); });
	it('add 扣 10c 并写入 FISH_KV', async () => {
		vi.mocked(coinService.getBalance).mockResolvedValue(50);
		const fishKv = makeKv({ [FISH_CATALOG_KEY]: JSON.stringify([]) });

		await handleFish(makeParsed({ args: ['add', '🐟测试鱼', '13'] }), { COIN_DO: {} as any, FISH_KV: fishKv } as any);

		expect(coinService.addToTreasury).toHaveBeenCalledWith(expect.anything(), expect.anything(), '12345', FISH_ADD_COST, '添加鱼');
		const saved = JSON.parse(String(await fishKv.get(FISH_CATALOG_KEY)));
		expect(saved[0]).toMatchObject({ name: '<a href="tg://user?id=12345" >🐟测试鱼</a>', hookRate: 0.1, value: 13 });
		expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('添加成功');
	});
	it('add 拒绝 1 到 13 之外的价值', async () => {
		vi.mocked(coinService.getBalance).mockResolvedValue(50);
		const fishKv = makeKv({ [FISH_CATALOG_KEY]: JSON.stringify([]) });

		await handleFish(makeParsed({ args: ['add', '越界鱼', '14'] }), { COIN_DO: {} as any, FISH_KV: fishKv } as any);

		expect(coinService.addToTreasury).not.toHaveBeenCalled();
		expect(fishKv.put).not.toHaveBeenCalled();
		expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('1 到 13');
	});
	it('add 余额不足时不写入 FISH_KV', async () => {
		vi.mocked(coinService.getBalance).mockResolvedValue(9);
		const fishKv = makeKv({ [FISH_CATALOG_KEY]: JSON.stringify([]) });

		await handleFish(makeParsed({ args: ['add', '穷鱼', '1'] }), { COIN_DO: {} as any, FISH_KV: fishKv } as any);

		expect(coinService.addToTreasury).not.toHaveBeenCalled();
		expect(fishKv.put).not.toHaveBeenCalled();
		expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('余额不足');
	});
	it('add 扣费失败时不写入 FISH_KV', async () => {
		vi.mocked(coinService.getBalance).mockResolvedValue(50);
		vi.mocked(coinService.addToTreasury).mockResolvedValueOnce({ ok: false, reason: 'insufficient_funds' });
		const fishKv = makeKv({ [FISH_CATALOG_KEY]: JSON.stringify([]) });

		await handleFish(makeParsed({ args: ['add', '扣费失败鱼', '1'] }), { COIN_DO: {} as any, FISH_KV: fishKv } as any);

		expect(fishKv.put).not.toHaveBeenCalled();
		expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('扣费失败');
	});
});
