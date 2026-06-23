import { env, createExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	handleFish: vi.fn(async () => undefined),
	incrementUsageCount: vi.fn(async () => undefined),
}));

vi.mock('../src/commands/fish', () => ({
	handleFish: mocks.handleFish,
}));

vi.mock('../src/commands/like', () => ({
	incrementUsageCount: mocks.incrementUsageCount,
}));

import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;
const ALLOWED_CHAT_ID = -1002848481881;

function makeEnv() {
	return Object.assign(Object.create(env), {
		TOKEN: 'test-token',
		BOT_USERNAME: 'DiceBot',
	});
}

function commandUpdate(text: string) {
	return {
		update_id: 2000,
		message: {
			message_id: 1,
			date: 1,
			chat: { id: ALLOWED_CHAT_ID, type: 'supergroup', title: 'Test Group' },
			from: { id: 12345, is_bot: false, first_name: 'F' },
			text,
		},
	};
}

async function postUpdate(text: string) {
	const request = new IncomingRequest('http://example.com', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'CF-Connecting-IP': '149.154.160.1',
		},
		body: JSON.stringify(commandUpdate(text)),
	});
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, makeEnv() as any, ctx);
	return { response, ctx };
}

describe('DiceBot Worker — fish command routing', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('/f 分发到 fish 处理器', async () => {
		const { response } = await postUpdate('/f 3');

		expect(response.status).toBe(200);
		expect(mocks.handleFish).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'message',
				chatId: ALLOWED_CHAT_ID,
				isCommand: true,
				command: 'f',
				args: ['3'],
			}),
			expect.anything(),
		);
	});

	it('/钓鱼 不再分发到 fish 处理器', async () => {
		const { response } = await postUpdate('/钓鱼 3');

		expect(response.status).toBe(200);
		expect(mocks.handleFish).not.toHaveBeenCalled();
	});
});
