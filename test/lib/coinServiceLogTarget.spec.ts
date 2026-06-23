import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));

import TgMessage from '../../src/lib/telegram';
import { transfer } from '../../src/lib/coinService';

const COIN_LOG_CHAT_ID = -1002661676227;
const COIN_LOG_THREAD_ID = 3677;

describe('coinService coin log target', () => {
	beforeEach(() => vi.clearAllMocks());

	it('sends transfer failure alerts to the shared coin log topic', async () => {
		const doNs = {
			idFromName: vi.fn(() => {
				throw new Error('stub unavailable');
			}),
		} as any;

		const result = await transfer({ TOKEN: 'token' } as any, doNs, 'alice', 'bob', 1);
		await Promise.resolve();

		expect(result).toMatchObject({ ok: false, reason: 'internal_error' });
		expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
			chat_id: COIN_LOG_CHAT_ID,
			message_thread_id: COIN_LOG_THREAD_ID,
			text: expect.stringContaining('coin transfer failed'),
		}));
	});
});
