import { env, createExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	recordReplyAffection: vi.fn(async () => undefined),
	recordReactionAffection: vi.fn(async () => undefined),
	handleBackup: vi.fn(async () => undefined),
	handleWishApproval: vi.fn(async () => false),
	incrementUsageCount: vi.fn(async () => undefined),
}));

vi.mock('../src/lib/affectionInteractions', () => ({
	recordReplyAffection: mocks.recordReplyAffection,
	recordReactionAffection: mocks.recordReactionAffection,
}));

vi.mock('../src/lib/backup', () => ({
	handleBackup: mocks.handleBackup,
}));

vi.mock('../src/commands/wish', () => ({
	handleWishApproval: mocks.handleWishApproval,
}));

vi.mock('../src/commands/like', () => ({
	incrementUsageCount: mocks.incrementUsageCount,
}));

import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;
const ALLOWED_CHAT_ID = -1002848481881;

function makeEnv(overrides: Record<string, unknown> = {}) {
	return Object.assign(Object.create(env), {
		TOKEN: 'test-token',
		BOT_USERNAME: 'DiceBot',
		...overrides,
	});
}

async function postTelegramUpdate(update: unknown, testEnv = makeEnv()) {
	const request = new IncomingRequest('http://example.com', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'CF-Connecting-IP': '149.154.160.1',
		},
		body: JSON.stringify(update),
	});
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, testEnv as any, ctx);
	return { response, ctx };
}

describe('DiceBot Worker — affection interaction dispatch', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('records reply affection for message replies', async () => {
		const { response } = await postTelegramUpdate({
			update_id: 3000,
			message: {
				message_id: 10,
				date: 1,
				chat: { id: ALLOWED_CHAT_ID, type: 'supergroup', title: 'Test Group' },
				from: { id: 1, is_bot: false, first_name: 'A' },
				text: '回复一下',
				reply_to_message: {
					message_id: 9,
					date: 1,
					chat: { id: ALLOWED_CHAT_ID, type: 'supergroup', title: 'Test Group' },
					from: { id: 2, is_bot: false, first_name: 'B' },
					text: '原消息',
				},
			},
		});

		expect(response.status).toBe(200);
		expect(mocks.recordReplyAffection).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'message',
				chatId: ALLOWED_CHAT_ID,
				isReply: true,
				from: expect.objectContaining({ id: 1 }),
				replyToMessage: expect.objectContaining({ from: expect.objectContaining({ id: 2 }) }),
			}),
			expect.anything(),
		);
	});

	it('records reaction affection for message_reaction updates', async () => {
		const messageReaction = {
			chat: { id: ALLOWED_CHAT_ID, type: 'supergroup', title: 'Test Group' },
			message_id: 9,
			user: { id: 1, is_bot: false, first_name: 'A' },
			date: 1,
			old_reaction: [],
			new_reaction: [{ type: 'emoji', emoji: '❤️' }],
		};

		const { response } = await postTelegramUpdate({
			update_id: 3001,
			message_reaction: messageReaction,
		});

		expect(response.status).toBe(200);
		expect(mocks.recordReactionAffection).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'message_reaction',
				chatId: ALLOWED_CHAT_ID,
				from: expect.objectContaining({ id: 1 }),
				messageReaction,
			}),
			expect.anything(),
		);
	});
});
