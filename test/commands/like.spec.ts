import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/lib/tgMessage', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));
import TgMessage from '../../src/lib/tgMessage';

function makeMsg(o: any = {}): any {
	return { type: 'message', chatId: -100999, from: { id: 1, first_name: 'FreqUser' }, isCommand: true, command: 'like', message: { message_id: 1, chat: { id: -100999 } }, ...o };
}
const MKV = { TGBOTCOUNT: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined), list: vi.fn().mockResolvedValue({ keys: [] }) } };

import { handleLike } from '../../src/commands/like';
describe('/like', () => {
	beforeEach(() => vi.clearAllMocks());
	it('个人次数', async () => { MKV.TGBOTCOUNT.get.mockResolvedValue(JSON.stringify({ count: 42, firstName: 'FreqUser' })); await handleLike(makeMsg(), MKV as any); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('42'); });
	it('all 榜单', async () => { MKV.TGBOTCOUNT.list.mockResolvedValue({ keys: [{ name: 'count:1' }, { name: 'count:2' }] }); MKV.TGBOTCOUNT.get.mockImplementation(async (k: string) => k === 'count:1' ? JSON.stringify({ count: 100, firstName: 'Alice' }) : JSON.stringify({ count: 50, firstName: 'Bob' })); await handleLike(makeMsg({ args: ['all'] }), MKV as any); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('Top'); });
});
