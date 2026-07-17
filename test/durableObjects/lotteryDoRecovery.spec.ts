import { describe, expect, it, vi } from 'vitest';
import { LotteryDO } from '../../src/durableObjects/lottery_do';

function makeState(initial: Record<string, unknown> = {}) {
	const store = new Map<string, unknown>(Object.entries(initial));
	const state: any = {
		init: Promise.resolve(),
		aborted: false,
		storage: {
			get: vi.fn(async (key: string) => store.get(key)),
			put: vi.fn(async (key: string, value: unknown) => {
				store.set(key, value);
			}),
			deleteAll: vi.fn(async () => {
				store.clear();
			}),
			getCurrentBookmark: vi.fn(async () => 'bookmark-current'),
			getBookmarkForTime: vi.fn(async () => 'bookmark-before-draw'),
			onNextSessionRestoreBookmark: vi.fn(async () => 'bookmark-undo'),
		},
		waitUntil: vi.fn((promise: Promise<unknown>) => {
			void promise.catch(() => undefined);
		}),
		abort: vi.fn(() => {
			state.aborted = true;
		}),
		blockConcurrencyWhile: vi.fn((callback: () => Promise<unknown>) => {
			state.init = callback();
			return state.init;
		}),
	};
	return state;
}

async function makeLottery(initial: Record<string, unknown> = {}) {
	const state = makeState(initial);
	const lottery = new LotteryDO(state, {});
	await state.init;
	return { lottery, state };
}

describe('LotteryDO recovery diagnostics', () => {
	it('returns current lottery state and bookmark without mutating storage', async () => {
		const { lottery, state } = await makeLottery({
			poolsV2: { '-1002970430696': 6446 },
			ticketsV2: { '-1002970430696': { alice: ['970'], bob: ['123', '124'] } },
			lastWinnersV2: { '-1002970430696': { winningNumber: '111' } },
		});

		const response = await lottery.fetch(new Request('https://do/debug-state'));
		const body = await response.json() as any;

		expect(response.status).toBe(200);
		expect(body).toMatchObject({
			pool: 6446,
			tickets: { alice: ['970'], bob: ['123', '124'] },
			totalTicketCount: 3,
			totalPrizePool: 6476,
			lastWinner: { winningNumber: '111' },
			currentBookmark: 'bookmark-current',
		});
		expect(state.storage.put).not.toHaveBeenCalled();
	});

	it('requires an explicit confirmation string before scheduling PITR restore', async () => {
		const { lottery, state } = await makeLottery();

		const response = await lottery.fetch(new Request('https://do/pitr/restore', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ timestamp: '2026-06-24T06:16:00.000Z' }),
		}));
		const body = await response.json() as any;

		expect(response.status).toBe(400);
		expect(body.error).toContain('confirm');
		expect(state.storage.onNextSessionRestoreBookmark).not.toHaveBeenCalled();
		expect(state.waitUntil).not.toHaveBeenCalled();
	});

	it('schedules PITR restore from a timestamp and returns the undo bookmark', async () => {
		const { lottery, state } = await makeLottery();

		const response = await lottery.fetch(new Request('https://do/pitr/restore', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				timestamp: '2026-06-24T06:16:00.000Z',
				confirm: 'RESTORE_LOTTERY_DO',
			}),
		}));
		const body = await response.json() as any;

		expect(response.status).toBe(200);
		expect(state.storage.getBookmarkForTime).toHaveBeenCalledWith(new Date('2026-06-24T06:16:00.000Z'));
		expect(state.storage.onNextSessionRestoreBookmark).toHaveBeenCalledWith('bookmark-before-draw');
		expect(state.waitUntil).toHaveBeenCalledTimes(1);
		expect(body).toMatchObject({
			success: true,
			bookmark: 'bookmark-before-draw',
			undoBookmark: 'bookmark-undo',
			restartScheduled: true,
		});
	});
});
