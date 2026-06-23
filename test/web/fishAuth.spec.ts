import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/coinService', () => import('../helpers/mocks').then(m => m.mockCoinService));

import * as coinService from '../../src/lib/coinService';
import { createWebGameAuth } from '../../src/lib/telegramAuth';
import { handleFishCast, handleFishData } from '../../src/web/fish';

function makeKv(initial: Record<string, string> = {}): KVNamespace {
	const store = new Map(Object.entries(initial));
	return {
		get: vi.fn(async (key: string) => store.get(key) ?? null),
		put: vi.fn(async (key: string, value: string) => {
			store.set(key, value);
		}),
		delete: vi.fn(async (key: string) => {
			store.delete(key);
		}),
	} as any;
}

async function authParams(userId: string, game = 'fish') {
	const auth_ts = '1800000000';
	const auth = await createWebGameAuth({ TOKEN: 'bot-token' }, {
		userId,
		game,
		issuedAt: Number(auth_ts),
	});
	return { auth, auth_ts };
}

describe('fish web auth', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.setSystemTime(new Date('2027-01-15T08:01:00.000Z'));
	});

	it('rejects data reads without signed Telegram launch auth', async () => {
		const response = await handleFishData(
			new Request('https://example.com/web/fish/data?user_id=12345'),
			{ TOKEN: 'bot-token', COIN_DO: {} as any, FISHING_RECORD_KV: makeKv() } as any,
		);

		expect(response.status).toBe(401);
		expect(coinService.getBalance).not.toHaveBeenCalled();
	});

	it('rejects tampered user ids for data reads', async () => {
		const { auth, auth_ts } = await authParams('12345');
		const response = await handleFishData(
			new Request(`https://example.com/web/fish/data?user_id=99999&auth=${auth}&auth_ts=${auth_ts}`),
			{ TOKEN: 'bot-token', COIN_DO: {} as any, FISHING_RECORD_KV: makeKv() } as any,
		);

		expect(response.status).toBe(401);
		expect(coinService.getBalance).not.toHaveBeenCalled();
	});

	it('accepts signed user ids for data reads', async () => {
		const { auth, auth_ts } = await authParams('12345');
		const response = await handleFishData(
			new Request(`https://example.com/web/fish/data?user_id=12345&auth=${auth}&auth_ts=${auth_ts}`),
			{ TOKEN: 'bot-token', COIN_DO: {} as any, FISHING_RECORD_KV: makeKv() } as any,
		);

		expect(response.status).toBe(200);
		expect(coinService.getBalance).toHaveBeenCalledWith(expect.anything(), '12345');
	});

	it('rejects cast requests without signed Telegram launch auth', async () => {
		const response = await handleFishCast(
			new Request('https://example.com/web/fish/cast', {
				method: 'POST',
				body: JSON.stringify({ userId: '12345', baitCost: 1 }),
			}),
			{ TOKEN: 'bot-token', COIN_DO: {} as any, FISHING_RECORD_KV: makeKv() } as any,
		);

		expect(response.status).toBe(401);
		expect(coinService.addToTreasury).not.toHaveBeenCalled();
	});
});
