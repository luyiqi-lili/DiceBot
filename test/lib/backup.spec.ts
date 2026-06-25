import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));

import { handleBackup } from '../../src/lib/backup';

function makeDb() {
	const run = vi.fn().mockResolvedValue({ meta: { changes: 1 } });
	const bind = vi.fn(() => ({ run }));
	const prepare = vi.fn(() => ({ bind }));
	return { prepare, bind, run };
}

describe('backup message history', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('records topic name from implicit forum topic root reply', async () => {
		const db = makeDb();

		await handleBackup({
			type: 'message',
			chatId: -100999,
			threadId: 210,
			from: { id: 123, first_name: 'User' },
			isCommand: false,
			text: 'hello',
			message: {
				message_id: 77,
				chat: { id: -100999 },
				message_thread_id: 210,
				from: { id: 123, first_name: 'User' },
				text: 'hello',
				reply_to_message: {
					message_id: 210,
					forum_topic_created: { name: '酒馆' },
				},
			},
		} as any, { DB: db } as any);

		const historyBind = db.bind.mock.calls.find((call) => call.length === 10);
		expect(historyBind?.[6]).toBe('酒馆');
	});
});
