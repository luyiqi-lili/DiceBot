import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/tgMessage', () => ({
	default: {
		sendText: vi.fn().mockResolvedValue({ ok: true }),
		send: vi.fn().mockResolvedValue({ ok: true }),
		buildInlineKeyboard: vi.fn((b: any) => ({ inline_keyboard: b })),
		deleteMessage: vi.fn().mockResolvedValue({ ok: true }),
		editMessageText: vi.fn().mockResolvedValue({ ok: true }),
	},
}));

import TgMessage from '../../src/lib/tgMessage';

function makeParsed(overrides: Record<string, any> = {}): any {
	return {
		type: 'topic_edited',
		chatId: -1002742074355,
		threadId: 184,
		from: { id: 1, first_name: 'Admin' },
		message: {
			message_id: 1,
			chat: { id: -1002742074355 },
			message_thread_id: 184,
			forum_topic_edited: { name: '新标题 ❤️' },
		},
		forumTopicEdited: { name: '新标题 ❤️' },
		...overrides,
	};
}

import { handleTopicEdited } from '../../src/commands/topicEditHandler';

describe('handleTopicEdited', () => {
	beforeEach(() => vi.clearAllMocks());

	it('话题含 ❤️ 时发送更新提示', async () => {
		const kv = {
			get: vi.fn().mockResolvedValue(null),
			put: vi.fn().mockResolvedValue(undefined),
		};
		const result = await handleTopicEdited(makeParsed(), {
			TOPIC_KV: kv,
		} as any);
		expect(kv.put).toHaveBeenCalled();
		expect(vi.mocked(TgMessage.sendText)).not.toHaveBeenCalled(); // 未初始化的 KV 记录不走发送
	});

	it('话题不含 ❤️ 时不发送提示', async () => {
		const kv = {
			get: vi.fn().mockResolvedValue(JSON.stringify({
				message_id: 50,
				titles: { '184': '旧标题' },
			})),
			put: vi.fn().mockResolvedValue(undefined),
		};
		const result = await handleTopicEdited(makeParsed({
			forumTopicEdited: { name: '普通标题' },
			message: { message_id: 2, chat: { id: -1002742074355 }, message_thread_id: 184, forum_topic_edited: { name: '普通标题' } },
		}), { TOPIC_KV: kv } as any);
		// 无 ❤️ 时不应发送提示
		expect(vi.mocked(TgMessage.sendText)).not.toHaveBeenCalled();
	});
});
