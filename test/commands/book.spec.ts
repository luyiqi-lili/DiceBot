import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/lib/tgMessage', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));
import TgMessage from '../../src/lib/tgMessage';

function makeMsg(o: any = {}): any {
	return { type: 'message', chatId: -100999, from: { id: 1, first_name: 'Reader' }, isCommand: true, command: 'book', message: { message_id: 1, chat: { id: -100999 } }, ...o };
}
const MKV = { BOOK_STORE: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined), list: vi.fn().mockResolvedValue({ keys: [] }) } };

import { handleBook } from '../../src/commands/book';
describe('/book', () => {
	beforeEach(() => vi.clearAllMocks());
	it('无参数', async () => { await handleBook(makeMsg(), MKV as any); expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalled(); });
	it('添加书签 put', async () => { MKV.BOOK_STORE.get.mockResolvedValue(JSON.stringify([])); await handleBook(makeMsg({ isReply: true, replyToMessage: { message_id: 5, from: { id: 1 } } }), MKV as any); expect(MKV.BOOK_STORE.put).toHaveBeenCalled(); });
	it('del #1', async () => { MKV.BOOK_STORE.get.mockResolvedValue(JSON.stringify([{ remark: 't', link: 'x', timestamp: '2025-01-01' }])); await handleBook(makeMsg({ args: ['del', '#1'] }), MKV as any); expect(MKV.BOOK_STORE.put).toHaveBeenCalled(); });
});
