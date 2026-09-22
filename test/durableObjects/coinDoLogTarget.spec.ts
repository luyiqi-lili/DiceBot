import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));

import TgMessage from '../../src/lib/telegram';
import { CoinDO } from '../../src/durableObjects/coin_do';

const COIN_LOG_CHAT_ID = -1002661676227;
const COIN_LOG_THREAD_ID = 3677;

function makeState() {
	const store = new Map<string, unknown>();
	return {
		storage: {
			get: vi.fn(async (key: string) => store.get(key)),
			put: vi.fn(async (key: string, value: unknown) => store.set(key, value)),
		},
	} as any;
}

async function flushLogTasks() {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

describe('CoinDO coin log target', () => {
	beforeEach(() => vi.clearAllMocks());

	it('sends transfer logs to the shared coin log topic', async () => {
		const coin = new CoinDO(makeState(), { TOKEN: 'token' });

		const response = await coin.fetch(new Request('https://do/transfer', {
			method: 'POST',
			body: JSON.stringify({ from: '__treasury__', to: 'bob', amount: 3, allowNegativeTreasury: true }),
			headers: { 'Content-Type': 'application/json' },
		}));
		await flushLogTasks();

		expect(response.status).toBe(200);
		expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
			chat_id: COIN_LOG_CHAT_ID,
			message_thread_id: COIN_LOG_THREAD_ID,
			text: expect.stringContaining('transfer amount=3'),
		}));
	});

	it('sends all incr logs to the shared coin log topic', async () => {
		const coin = new CoinDO(makeState(), { TOKEN: 'token' });

		const response = await coin.fetch(new Request('https://do/incr', {
			method: 'POST',
			body: JSON.stringify({ key: 'room-key', delta: 2 }),
			headers: { 'Content-Type': 'application/json' },
		}));
		await flushLogTasks();

		expect(response.status).toBe(200);
		const logMessages = vi.mocked(TgMessage.sendText).mock.calls.map(call => call[1]);
		expect(logMessages).toHaveLength(3);
		for (const message of logMessages) {
			expect(message).toMatchObject({
				chat_id: COIN_LOG_CHAT_ID,
				message_thread_id: COIN_LOG_THREAD_ID,
			});
		}
		expect(logMessages.map(message => message.text).join('\n')).toContain('INCR START');
		expect(logMessages.map(message => message.text).join('\n')).toContain('incr (before=0 delta=2 after=2)');
		expect(logMessages.map(message => message.text).join('\n')).toContain('INCR END');
	});

	it('pays a daily prayer only once and stores the date atomically', async () => {
		const coin = new CoinDO(makeState(), { TOKEN: 'token' });
		const requestBody = {
			treasuryKey: '-1002970430696:__treasury__',
			userKey: '-1002970430696:12345',
			recordKey: '-1002970430696:coin_pray:12345',
			date: '2026-09-22',
			amount: 17,
		};

		const first = await coin.fetch(new Request('https://do/daily-pray', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(requestBody),
		}));
		const second = await coin.fetch(new Request('https://do/daily-pray', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ...requestBody, amount: 20 }),
		}));

		expect(await first.json()).toMatchObject({ ok: true, claimed: true, newBalance: 17 });
		expect(await second.json()).toMatchObject({ ok: true, claimed: false, newBalance: 17 });
		const balance = await coin.fetch(new Request('https://do/get?key=-1002970430696%3A12345'));
		expect(await balance.text()).toBe('17');
	});

	it('rejects daily prayer keys that do not share one chat and user scope', async () => {
		const coin = new CoinDO(makeState(), { TOKEN: 'token' });
		const response = await coin.fetch(new Request('https://do/daily-pray', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				treasuryKey: '-1001:__treasury__',
				userKey: '-1002:12345',
				recordKey: '-1001:coin_pray:12345',
				date: '2026-09-22',
				amount: 20,
			}),
		}));

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ ok: false, claimed: false, reason: 'mismatched prayer scope' });
	});
});
