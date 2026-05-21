import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/lib/tgMessage', () => import('../helpers/mocks').then(m => m.mockTgMessage));
vi.mock('../../src/lib/coinService', () => import('../helpers/mocks').then(m => m.mockCoinService));
import TgMessage from '../../src/lib/tgMessage';
import * as coinService from '../../src/lib/coinService';
import { handleCoin } from '../../src/commands/coin';

const MOCK_ENV = { COIN_DO: {} } as any;

function makeParsed(o: any = {}): any {
	return { type: 'message', chatId: -100999, from: { id: 12345, first_name: '测试用户' }, isCommand: true, command: 'coin', message: { message_id: 1, chat: { id: -100999 } }, ...o };
}

describe('balance', () => {
	beforeEach(() => vi.clearAllMocks());
	it('查询余额', async () => { vi.mocked(coinService.getBalance).mockResolvedValue(888); await handleCoin(makeParsed(), MOCK_ENV); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('888'); });
	it('余额0', async () => { vi.mocked(coinService.getBalance).mockResolvedValue(0); await handleCoin(makeParsed(), MOCK_ENV); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('0'); });
});
describe('pray', () => {
	beforeEach(() => vi.clearAllMocks());
	it('祈祷', async () => { await handleCoin(makeParsed({ args: ['pray'] }), MOCK_ENV); expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalled(); });
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
	it('非管理员', async () => { await handleCoin(makeParsed({ args: ['check'] }), MOCK_ENV); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('权限'); });
});
describe('take', () => {
	beforeEach(() => vi.clearAllMocks());
	it('管理员取款', async () => { vi.mocked(coinService.getTreasury).mockResolvedValue(10000); await handleCoin(makeParsed({ args: ['take', '100'], from: { id: 8080375150 } }), MOCK_ENV); expect(coinService.takeFromTreasury).toHaveBeenCalled(); });
});
