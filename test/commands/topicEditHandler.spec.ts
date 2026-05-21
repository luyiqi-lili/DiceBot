import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/lib/tgMessage', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));
import TgMessage from '../../src/lib/tgMessage';

function makeParsed(o: any = {}): any {
	return { type: 'topic_edited', chatId: -1002742074355, threadId: 184, from: { id: 1 }, message: { message_id: 1, chat: { id: -1002742074355 }, message_thread_id: 184, forum_topic_edited: { name: '新标题 ❤️' } }, forumTopicEdited: { name: '新标题 ❤️' }, ...o };
}
import { handleTopicEdited } from '../../src/commands/topicEditHandler';
describe('handleTopicEdited', () => {
	beforeEach(() => vi.clearAllMocks());
	it('含❤️写KV', async () => { const kv = { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined) }; await handleTopicEdited(makeParsed(), { TOPIC_KV: kv } as any); expect(kv.put).toHaveBeenCalled(); });
	it('无❤️不发', async () => { const kv = { get: vi.fn().mockResolvedValue(JSON.stringify({ message_id: 50, titles: { '184': '旧' } })), put: vi.fn().mockResolvedValue(undefined) }; await handleTopicEdited(makeParsed({ forumTopicEdited: { name: '普通' }, message: { message_id: 2, chat: { id: -1002742074355 }, message_thread_id: 184, forum_topic_edited: { name: '普通' } } }), { TOPIC_KV: kv } as any); expect(vi.mocked(TgMessage.sendText)).not.toHaveBeenCalled(); });
});
