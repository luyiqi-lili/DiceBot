import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/lib/tgMessage', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));
vi.mock('../../src/lib/coinService', () => import('../helpers/mocks').then(m => m.mockCoinService));
import TgMessage from '../../src/lib/tgMessage';
import * as coinService from '../../src/lib/coinService';

function makeParsed(o: any = {}): any {
	return { type: 'message', chatId: -100999, from: { id: 10001, first_name: 'G' }, isCommand: true, command: 'lottery', message: { message_id: 1, chat: { id: -100999 } }, ...o };
}
function makeDO() {
	const stub = { fetch: vi.fn().mockImplementation(async (url: string) => ({ ok: true, json: async () => { if (url.includes('get-pool')) return { pool: 500 }; if (url.includes('total-ticket-count')) return { count: 20 }; if (url.includes('get-user-tickets')) return { userId: '10001', ticketNumbers: ['123'] }; if (url.includes('last-draw')) return { lastDraw: null }; if (url.includes('add-ticket')) return { success: true }; if (url.includes('get-user-ticket-count')) return { userId: '10001', count: 1 }; return {}; } })) };
	return { idFromName: vi.fn().mockReturnValue('id'), get: vi.fn().mockReturnValue(stub) };
}
import { handleLottery } from '../../src/commands/lottery';
describe('lottery', () => {
	beforeEach(() => vi.clearAllMocks());
	it('info', async () => { await handleLottery(makeParsed(), { LOTTERY_DO: makeDO() } as any); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('大乐透'); });
	it('buy', async () => { vi.mocked(coinService.getBalance).mockResolvedValue(100); await handleLottery(makeParsed({ args: ['buy'] }), { COIN_DO: {} as any, LOTTERY_DO: makeDO() } as any); expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalled(); });
});
