import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/lib/tgMessage', () => import('../helpers/mocks').then(m => m.mockTgMessage));
vi.mock('../../src/lib/coinService', () => import('../helpers/mocks').then(m => m.mockCoinService));
import TgMessage from '../../src/lib/tgMessage';
import * as coinService from '../../src/lib/coinService';
import { handleFish } from '../../src/commands/fish';

function makeParsed(o: any = {}): any {
	return { type: 'message', chatId: -1002848481881, threadId: 66, from: { id: 12345, first_name: 'F' }, isCommand: true, command: 'fish', message: { message_id: 1, chat: { id: -1002848481881 }, message_thread_id: 66 }, ...o };
}

describe('fish', () => {
	beforeEach(() => vi.clearAllMocks());
	it('非 fish 命令不回复', async () => { await handleFish(makeParsed({ command: 'roll' }), {} as any); expect(vi.mocked(TgMessage.sendText)).not.toHaveBeenCalled(); });
	it('check 发送汇总', async () => { await handleFish(makeParsed({ args: ['check'] }), { FISHING_RECORD_KV: { get: vi.fn().mockResolvedValue(null) } } as any); expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalled(); });
	it('禁止房间', async () => { await handleFish(makeParsed({ chatId: -100111, args: ['3'] }), {} as any); expect(vi.mocked(TgMessage.sendText)).not.toHaveBeenCalled(); });
	it('余额充足抛竿', async () => { vi.mocked(coinService.getBalance).mockResolvedValue(50); await handleFish(makeParsed({ args: ['3'] }), { COIN_DO: {} as any, FISHING_RECORD_KV: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined) } } as any); expect(coinService.addToTreasury).toHaveBeenCalled(); });
	it('余额不足提示', async () => { vi.mocked(coinService.getBalance).mockResolvedValue(0); await handleFish(makeParsed({ args: ['10'] }), { COIN_DO: {} as any, FISHING_RECORD_KV: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined) } } as any); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('不足'); });
	it('达上限提示', async () => { vi.mocked(coinService.getBalance).mockResolvedValue(100); const rec = JSON.stringify({ date: new Date().toISOString().split('T')[0], count: 20, results: [{ baitCost: 1, hooked: false, fishValue: 0 }] }); await handleFish(makeParsed({ args: ['1'] }), { COIN_DO: {} as any, FISHING_RECORD_KV: { get: vi.fn().mockResolvedValue(rec), put: vi.fn().mockResolvedValue(undefined) } } as any); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('20'); });
});
