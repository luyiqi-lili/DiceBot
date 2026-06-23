import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/lib/tgMessage', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));
vi.mock('../../src/lib/coinService', () => import('../helpers/mocks').then(m => m.mockCoinService));
vi.mock('../../src/lib/affectionDB', () => ({
  readAffectionMap: vi.fn(),
  writeAffectionMap: vi.fn().mockResolvedValue({ ok: true }),
  incrementAffection: vi.fn().mockResolvedValue({ ok: true, value: 160 }),
  getAffectionRanking: vi.fn(),
  getRoseSendDate: vi.fn(),
  setRoseSendDate: vi.fn(),
  claimDailyFreeRoseSend: vi.fn(),
}));
import TgMessage from '../../src/lib/tgMessage';
import * as coinService from '../../src/lib/coinService';
import { handleRose } from '../../src/commands/rose';
import {
  readAffectionMap,
  writeAffectionMap,
  incrementAffection,
  getAffectionRanking,
  getRoseSendDate,
  setRoseSendDate,
  claimDailyFreeRoseSend,
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
	it('send（免费送花成功）', async () => {
		vi.mocked(readAffectionMap).mockResolvedValue({});
		vi.mocked(claimDailyFreeRoseSend).mockResolvedValue(true);
		vi.mocked(incrementAffection).mockResolvedValue({ ok: true, value: 160 });
		await handleRose(makeMsg({ args: ['send'], isReply: true, replyToMessage: { from: { id: 2 } } }), MKV as any);
		const text = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text;
		expect(text).toContain('送出一朵');
		expect(coinService.addToTreasury).not.toHaveBeenCalled();
	});

	it('send 免费送花时写入失败应提示错误', async () => {
		vi.mocked(readAffectionMap).mockResolvedValue({});
		vi.mocked(claimDailyFreeRoseSend).mockResolvedValue(true);
		vi.mocked(incrementAffection).mockResolvedValue({ ok: false, error: 'test error' });
		await handleRose(makeMsg({ args: ['send'], isReply: true, replyToMessage: { from: { id: 2 } } }), MKV as any);
		const text = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text;
		expect(text).toContain('好感度记录失败');
	});

	it('send 当天免费名额已被占用时应扣费并增加好感', async () => {
		vi.mocked(readAffectionMap).mockResolvedValue({ '2': { firstName: 'MockUser', value: 160 } });
		vi.mocked(claimDailyFreeRoseSend).mockResolvedValue(false);
		vi.mocked(incrementAffection).mockResolvedValue({ ok: true, value: 320 });

		await handleRose(makeMsg({ args: ['send'], isReply: true, replyToMessage: { from: { id: 2 } } }), MKV as any);

		expect(coinService.getBalance).toHaveBeenCalledWith(MKV.COIN_DO, '1');
		expect(coinService.addToTreasury).toHaveBeenCalledWith(MKV, MKV.COIN_DO, '1', 30, '送花消费');
		const text = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text;
		expect(text).toContain('支付 30');
		expect(text).toContain('额外送出了一朵');
	});

	it('send coin 送花时写入失败应提示 coin 已扣', async () => {
		vi.mocked(readAffectionMap).mockResolvedValue({ '2': { firstName: 'MockUser', value: 160 } });
		vi.mocked(claimDailyFreeRoseSend).mockResolvedValue(false);
		vi.mocked(incrementAffection).mockResolvedValue({ ok: false, error: 'test error' });
		await handleRose(makeMsg({ args: ['send'], isReply: true, replyToMessage: { from: { id: 2 } } }), MKV as any);
		const text = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text;
		expect(text).toContain('好感度记录失败');
		expect(text).toContain('请稍后重试');
	});
});
