import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));
import TgMessage from '../../src/lib/telegram';

function makeParsed(o: any = {}): any {
	return { type: 'topic_edited', chatId: -1002742074355, threadId: 184, from: { id: 1 }, message: { message_id: 1, chat: { id: -1002742074355 }, message_thread_id: 184, forum_topic_edited: { name: '新标题 ❤️' } }, forumTopicEdited: { name: '新标题 ❤️' }, ...o };
}
function makeDb() {
	const run = vi.fn().mockResolvedValue({ success: true });
	const bind = vi.fn(() => ({ run }));
	const prepare = vi.fn(() => ({ bind, run }));
	return { prepare, bind, run };
}
import { handleTopicEdited } from '../../src/commands/topicEditHandler';
describe('handleTopicEdited', () => {
	beforeEach(() => vi.clearAllMocks());
	it('含❤️写KV', async () => { const kv = { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined) }; await handleTopicEdited(makeParsed(), { TOPIC_KV: kv } as any); expect(kv.put).toHaveBeenCalled(); });
	it('无❤️不发', async () => { const kv = { get: vi.fn().mockResolvedValue(JSON.stringify({ message_id: 50, titles: { '184': '旧' } })), put: vi.fn().mockResolvedValue(undefined) }; await handleTopicEdited(makeParsed({ forumTopicEdited: { name: '普通' }, message: { message_id: 2, chat: { id: -1002742074355 }, message_thread_id: 184, forum_topic_edited: { name: '普通' } } }), { TOPIC_KV: kv } as any); expect(vi.mocked(TgMessage.sendText)).not.toHaveBeenCalled(); });
	it('创建主题时写入 D1 当前名称和事件历史', async () => {
		const db = makeDb();
		const kv = { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined) };

		await handleTopicEdited(makeParsed({
			type: 'topic_created',
			chatId: -1002970430696,
			threadId: 210,
			message: {
				message_id: 210,
				chat: { id: -1002970430696 },
				message_thread_id: 210,
				forum_topic_created: { name: '酒馆' },
			},
			forumTopicCreated: { name: '酒馆' },
		}), { DB: db, TOPIC_KV: kv } as any);

		expect(db.prepare).toHaveBeenCalledTimes(4);
		expect(db.bind.mock.calls[0]).toEqual([-1002970430696, 210, '酒馆', 210]);
		expect(db.bind.mock.calls[1]).toEqual([-1002970430696, 210, 'created', null, '酒馆', 210, 1]);
	});
	it('修改主题时写入 D1 当前名称和事件历史', async () => {
		const db = makeDb();
		const kv = { get: vi.fn().mockResolvedValue(JSON.stringify({ message_id: null, titles: { '184': '旧标题' } })), put: vi.fn().mockResolvedValue(undefined) };

		await handleTopicEdited(makeParsed({ message: { message_id: 9, chat: { id: -1002742074355 }, message_thread_id: 184, forum_topic_edited: { name: '新标题' } } }), { DB: db, TOPIC_KV: kv } as any);

		expect(db.prepare).toHaveBeenCalledTimes(4);
		expect(db.bind.mock.calls[0]).toEqual([-1002742074355, 184, '新标题', 9]);
		expect(db.bind.mock.calls[1]).toEqual([-1002742074355, 184, 'edited', '旧标题', '新标题', 9, 1]);
	});
});
