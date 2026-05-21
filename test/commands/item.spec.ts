import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/lib/tgMessage', () => import('../helpers/mocks').then(m => m.mockTgMessage));
import TgMessage from '../../src/lib/tgMessage';

function makeMsg(o: any = {}): any {
	return { type: 'message', chatId: -100999, from: { id: 1, first_name: 'Owner' }, isCommand: true, command: 'item', message: { message_id: 1, chat: { id: -100999 } }, ...o };
}
const MKV = { ITEM_STORE: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined), list: vi.fn().mockResolvedValue({ keys: [] }) } };

import { handleItem } from '../../src/commands/item';
describe('/item', () => {
	beforeEach(() => vi.clearAllMocks());
	it('空列表', async () => { await handleItem(makeMsg(), MKV as any); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('物品'); });
	it('create', async () => { MKV.ITEM_STORE.get.mockResolvedValue(JSON.stringify([])); await handleItem(makeMsg({ args: ['create'], isReply: true, replyToMessage: { message_id: 5, from: { id: 1 } } }), MKV as any); expect(MKV.ITEM_STORE.put).toHaveBeenCalled(); });
	it('list', async () => { MKV.ITEM_STORE.get.mockResolvedValue(JSON.stringify([{ remark: 'sword', link: 'x', timestamp: '2025-01-01' }])); await handleItem(makeMsg({ args: ['list'] }), MKV as any); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('sword'); });
});
