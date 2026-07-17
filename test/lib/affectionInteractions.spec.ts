import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/affectionDB', () => ({
	incrementAffection: vi.fn().mockResolvedValue({ ok: true, value: 1 }),
}));

import { incrementAffection } from '../../src/lib/affectionDB';
import {
	recordReactionAffection,
	recordReplyAffection,
} from '../../src/lib/affectionInteractions';

function makeKv(marker: string | null = null) {
	return {
		get: vi.fn().mockResolvedValue(marker),
		put: vi.fn().mockResolvedValue(undefined),
	};
}

function makeDb(row: any = null) {
	const first = vi.fn().mockResolvedValue(row);
	const bind = vi.fn().mockReturnValue({ first });
	const prepare = vi.fn().mockReturnValue({ bind });
	return { prepare, bind, first };
}

function makeEnv(row: any = null, marker: string | null = null): any {
	const db = makeDb(row);
	const kv = makeKv(marker);
	return {
		DB: db,
		AFFECTION_KV: kv,
		__db: db,
		__kv: kv,
	};
}

describe('affection interactions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(incrementAffection).mockResolvedValue({ ok: true, value: 1 });
	});

	it('increments A to B by the reply text length when A replies to B', async () => {
		const env = makeEnv();
		await recordReplyAffection({
			type: 'message',
			chatId: -100999,
			from: { id: 1, first_name: 'A' },
			text: '你好呀',
			message: { text: '你好呀' },
			isReply: true,
			replyToMessage: { from: { id: 2, first_name: 'B' } },
		} as any, env);

		expect(incrementAffection).toHaveBeenCalledWith(env.DB, env.AFFECTION_KV, -100999, 1, 2, 'B', 3);
	});

	it('increments A to B by 5 when the reply is a photo', async () => {
		const env = makeEnv();
		await recordReplyAffection({
			type: 'message',
			chatId: -100999,
			from: { id: 1, first_name: 'A' },
			message: { photo: [{ file_id: 'small' }] },
			isReply: true,
			replyToMessage: { from: { id: 2, first_name: 'B' } },
		} as any, env);

		expect(incrementAffection).toHaveBeenCalledWith(env.DB, env.AFFECTION_KV, -100999, 1, 2, 'B', 5);
	});

	it('increments A to B by 5 when the reply is a sticker or pure emoji text', async () => {
		const env = makeEnv();
		await recordReplyAffection({
			type: 'message',
			chatId: -100999,
			from: { id: 1, first_name: 'A' },
			message: { sticker: { file_id: 'sticker' } },
			isReply: true,
			replyToMessage: { from: { id: 2, first_name: 'B' } },
		} as any, env);
		await recordReplyAffection({
			type: 'message',
			chatId: -100999,
			from: { id: 1, first_name: 'A' },
			text: '🌱❤️',
			message: { text: '🌱❤️' },
			isReply: true,
			replyToMessage: { from: { id: 2, first_name: 'B' } },
		} as any, env);

		expect(incrementAffection).toHaveBeenNthCalledWith(1, env.DB, env.AFFECTION_KV, -100999, 1, 2, 'B', 5);
		expect(incrementAffection).toHaveBeenNthCalledWith(2, env.DB, env.AFFECTION_KV, -100999, 1, 2, 'B', 5);
	});

	it('ignores self replies and bot targets', async () => {
		const env = makeEnv();

		await recordReplyAffection({
			type: 'message',
			chatId: -100999,
			from: { id: 1, first_name: 'A' },
			isReply: true,
			replyToMessage: { from: { id: 1, first_name: 'A' } },
		} as any, env);
		await recordReplyAffection({
			type: 'message',
			chatId: -100999,
			from: { id: 1, first_name: 'A' },
			isReply: true,
			replyToMessage: { from: { id: 3, is_bot: true, first_name: 'Bot' } },
		} as any, env);

		expect(incrementAffection).not.toHaveBeenCalled();
	});

	it('increments A to original author by 1 on the first reaction to a message', async () => {
		const env = makeEnv({ user_id: 2, first_name: 'B', username: 'bee' });

		await recordReactionAffection({
			type: 'message_reaction',
			chatId: -100999,
			from: { id: 1, first_name: 'A' },
			messageReaction: {
				chat: { id: -100999 },
				message_id: 42,
				user: { id: 1, first_name: 'A' },
				old_reaction: [],
				new_reaction: [{ type: 'emoji', emoji: '🔥' }],
			},
		} as any, env);

		expect(env.__db.prepare).toHaveBeenCalled();
		expect(incrementAffection).toHaveBeenCalledWith(env.DB, env.AFFECTION_KV, -100999, 1, 2, 'B', 1);
		expect(env.__kv.put).toHaveBeenCalledWith('affection:reaction-counted:-100999:42:1', '1');
	});

	it('does not increment when a counted reaction marker already exists', async () => {
		const env = makeEnv({ user_id: 2, first_name: 'B' }, '1');

		await recordReactionAffection({
			type: 'message_reaction',
			chatId: -100999,
			from: { id: 1, first_name: 'A' },
			messageReaction: {
				chat: { id: -100999 },
				message_id: 42,
				user: { id: 1, first_name: 'A' },
				old_reaction: [],
				new_reaction: [{ type: 'emoji', emoji: '👍' }],
			},
		} as any, env);

		expect(incrementAffection).not.toHaveBeenCalled();
		expect(env.__kv.put).not.toHaveBeenCalled();
	});

	it('does not increment for reaction removals or reaction changes', async () => {
		const env = makeEnv({ user_id: 2, first_name: 'B' });

		await recordReactionAffection({
			type: 'message_reaction',
			chatId: -100999,
			from: { id: 1, first_name: 'A' },
			messageReaction: {
				chat: { id: -100999 },
				message_id: 42,
				user: { id: 1, first_name: 'A' },
				old_reaction: [{ type: 'emoji', emoji: '👍' }],
				new_reaction: [],
			},
		} as any, env);
		await recordReactionAffection({
			type: 'message_reaction',
			chatId: -100999,
			from: { id: 1, first_name: 'A' },
			messageReaction: {
				chat: { id: -100999 },
				message_id: 42,
				user: { id: 1, first_name: 'A' },
				old_reaction: [{ type: 'emoji', emoji: '👍' }],
				new_reaction: [{ type: 'emoji', emoji: '🔥' }],
			},
		} as any, env);

		expect(incrementAffection).not.toHaveBeenCalled();
	});
});
