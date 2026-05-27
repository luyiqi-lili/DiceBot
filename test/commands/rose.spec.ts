import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/lib/tgMessage', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));
vi.mock('../../src/lib/coinService', () => import('../helpers/mocks').then(m => m.mockCoinService));
vi.mock('../../src/lib/affectionDB', () => ({
  readAffectionMap: vi.fn(),
  writeAffectionMap: vi.fn().mockResolvedValue({ ok: true }),
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
	it('send（免费送花成功）', async () => {
		vi.mocked(readAffectionMap).mockResolvedValue({});
		vi.mocked(getRoseSendDate).mockResolvedValue(null);
		await handleRose(makeMsg({ args: ['send'], isReply: true, replyToMessage: { from: { id: 2 } } }), MKV as any);
		const text = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text;
		expect(text).toContain('送出一朵');
	});

	it('send 免费送花时写入失败应提示错误', async () => {
		vi.mocked(readAffectionMap).mockResolvedValue({});
		vi.mocked(getRoseSendDate).mockResolvedValue(null);
		vi.mocked(writeAffectionMap).mockResolvedValue({ ok: false, error: 'test error' });
		await handleRose(makeMsg({ args: ['send'], isReply: true, replyToMessage: { from: { id: 2 } } }), MKV as any);
		const text = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text;
		expect(text).toContain('好感度记录失败');
	});

	it('send coin 送花时写入失败应提示 coin 已扣', async () => {
		vi.mocked(readAffectionMap).mockResolvedValue({ '2': { firstName: 'MockUser', value: 160 } });
		vi.mocked(getRoseSendDate).mockResolvedValue('2026-05-27'); // 今天已送过
		vi.mocked(writeAffectionMap).mockResolvedValue({ ok: false, error: 'test error' });
		await handleRose(makeMsg({ args: ['send'], isReply: true, replyToMessage: { from: { id: 2 } } }), MKV as any);
		const text = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text;
		expect(text).toContain('好感度记录失败');
		expect(text).toContain('已扣除');
	});
});