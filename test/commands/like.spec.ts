import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));
import TgMessage from '../../src/lib/telegram';

function makeMsg(o: any = {}): any {
	return { type: 'message', chatId: -100999, from: { id: 1, first_name: 'FreqUser' }, isCommand: true, command: 'like', message: { message_id: 1, chat: { id: -100999 } }, ...o };
}

function makeDB(overrides: { first?: any; all?: any; run?: any } = {}) {
	const db: any = {
		prepare: vi.fn().mockReturnValue({
			bind: vi.fn().mockReturnThis(),
			first: vi.fn().mockResolvedValue(overrides.first ?? null),
			all: vi.fn().mockResolvedValue(overrides.all ?? { results: [] }),
			run: vi.fn().mockResolvedValue(undefined),
		}),
	};
	return db;
}

import { handleLike } from '../../src/commands/like';

describe('/like', () => {
	beforeEach(() => vi.clearAllMocks());

	it('个人次数', async () => {
		const env: any = { DB: makeDB({ first: { usage_count: 42 } }) };
		await handleLike(makeMsg(), env);
		expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('42');
	});

	it('all 榜单', async () => {
		const env: any = {
			DB: makeDB({
				all: {
					results: [
						{ user_id: 1, first_name: 'Alice', usage_count: 100 },
						{ user_id: 2, first_name: 'Bob', usage_count: 50 },
					]
				}
			})
		};
		await handleLike(makeMsg({ args: ['all'] }), env);
		expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('Top');
	});
});
