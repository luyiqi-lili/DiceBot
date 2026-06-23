import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));
import TgMessage from '../../src/lib/telegram';

function makeMsg(o: any = {}): any {
	return { type: 'message', chatId: -100999, from: { id: 1, first_name: 'Reporter' }, isCommand: true, command: 'news', message: { message_id: 1, chat: { id: -100999 } }, ...o };
}
const MKV = { NEWS_STORE: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined), list: vi.fn().mockResolvedValue({ keys: [] }) }, BOT_USERNAME: 'TestBot' };

import { handleNews } from '../../src/commands/news';
describe('/news', () => {
	beforeEach(() => vi.clearAllMocks());
	it('查询模式', async () => { await handleNews(makeMsg(), MKV as any); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('暂无小道消息'); });
	it('回复爆料', async () => { await handleNews(makeMsg({ isReply: true, replyToMessage: { message_id: 5, from: { first_name: 'S', username: 's' }, text: 'secret' } }), MKV as any); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('爆料'); });
});
