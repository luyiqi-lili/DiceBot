import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	deleteMessageWithDelay: vi.fn(async () => undefined),
	handleFish: vi.fn(async () => undefined),
	incrementUsageCount: vi.fn(async () => undefined),
	parseUpdate: vi.fn(),
}));

vi.mock('../src/lib/tgMessage', async () => {
	const actual = await vi.importActual<typeof import('../src/lib/tgMessage')>('../src/lib/tgMessage');
	return {
		...actual,
		default: {
			...actual.default,
			deleteMessageWithDelay: mocks.deleteMessageWithDelay,
			parseUpdate: mocks.parseUpdate,
		},
	};
});

vi.mock('../src/commands/fish', () => ({
	handleFish: mocks.handleFish,
}));

vi.mock('../src/commands/like', () => ({
	incrementUsageCount: mocks.incrementUsageCount,
}));

import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('DiceBot Worker — fish command routing', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('/钓鱼 不再分发到 fish 处理器', async () => {
		const parsedMessage = {
			type: 'message',
			chatId: -1002848481881,
			threadId: 66,
			isCommand: true,
			command: '钓鱼',
			args: ['3'],
			message: { message_id: 1, chat: { id: -1002848481881 }, text: '/钓鱼 3' },
			from: { id: 12345, first_name: 'F' },
		};
		mocks.parseUpdate.mockReturnValue(parsedMessage);

		const request = new IncomingRequest('http://example.com', {
			method: 'POST',
			body: JSON.stringify({ update_id: 1 }),
		});
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		expect(mocks.handleFish).not.toHaveBeenCalled();
	});
});
