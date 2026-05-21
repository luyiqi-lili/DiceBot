import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/lib/tgMessage', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));
vi.mock('../../src/lib/coinService', () => import('../helpers/mocks').then(m => m.mockCoinService));
vi.mock('../../src/lib/affectionDB', () => ({
	readAffectionMap: vi.fn(),
	writeAffectionMap: vi.fn(),
	getAffectionRanking: vi.fn(),
	getRoseSendDate: vi.fn(),
	setRoseSendDate: vi.fn(),
}));
import TgMessage from '../../src/lib/tgMessage';
import { handleRose } from '../../src/commands/rose';
import {
	readAffectionMap,
	writeAffectionMap,
	getAffectionRanking,
	getRoseSendDate,
	setRoseSendDate,
} from '../../src/lib/affectionDB';

function makeMsg(o: any = {}): any {
	return { type: 'message', chatId: -100999, from: { id: 1, first_name: 'A' }, isCommand: true, command: 'rose', message: { message_id: 1, chat: { id: -100999 } }, ...o };
}
const MKV = { DB: undefined, AFFECTION_KV: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined), list: vi.fn().mockResolvedValue({ keys: [] }) }, COIN_DO: {}, TOKEN: 't' };

describe('/rose', () => {
	beforeEach(() => vi.clearAllMocks());
	it('未回复', async () => { await handleRose(makeMsg(), MKV as any); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('回复'); });
	it('回复查询', async () => {
		vi.mocked(readAffectionMap).mockResolvedValue({});
		await handleRose(makeMsg({ isReply: true, replyToMessage: { from: { id: 2 } } }), MKV as any);
		expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalled();
	});
	it('check', async () => {
		vi.mocked(getAffectionRanking).mockResolvedValue([]);
		await handleRose(makeMsg({ args: ['check'], isReply: true, replyToMessage: { from: { id: 2 } } }), MKV as any);
		expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalled();
	});
	it('send', async () => {
		vi.mocked(readAffectionMap).mockResolvedValue({});
		vi.mocked(getRoseSendDate).mockResolvedValue(null);
		await handleRose(makeMsg({ args: ['send'], isReply: true, replyToMessage: { from: { id: 2 } } }), MKV as any);
		expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalled();
	});
});