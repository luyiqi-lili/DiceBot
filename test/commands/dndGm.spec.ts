import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/tgMessage', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));

import TgMessage from '../../src/lib/tgMessage';
import { handleDndGm } from '../../src/commands/dndGm';

function makeMsg(o: any = {}): any {
	return {
		type: 'message',
		chatId: -100999,
		threadId: undefined,
		from: { id: 8080375150, first_name: 'GM' },
		isCommand: true,
		command: 'gm',
		message: { message_id: 1, chat: { id: -100999 } },
		...o,
	};
}

function makeDndGmDb() {
	const calls: Array<{ sql: string; params: any[]; op: 'first' | 'run' }> = [];

	return {
		calls,
		prepare(sql: string) {
			let params: any[] = [];
			const normalized = sql.replace(/\s+/g, ' ').trim();
			const stmt = {
				bind(...bound: any[]) {
					params = bound;
					return stmt;
				},
				async first() {
					calls.push({ sql: normalized, params, op: 'first' });
					return null;
				},
				async run() {
					calls.push({ sql: normalized, params, op: 'run' });
					return { meta: { changes: 1 } };
				},
			};
			return stmt;
		},
	};
}

describe('/gm DND skill management', () => {
	beforeEach(() => vi.clearAllMocks());

	it('stores heal marker with the damage dice when creating a healing spell', async () => {
		const db = makeDndGmDb();

		await handleDndGm(makeMsg({
			args: ['技能', '治疗术', '人类+1', '牧师', '感知', '2', '2d6', 'heal', '1', '金光包裹加速愈合'],
		}), { TOKEN: 't', DB: db } as any);

		const insert = db.calls.find(call => call.op === 'run' && call.sql.startsWith('INSERT INTO dnd_skills'));
		expect(insert?.params).toEqual([
			'-100999',
			'治疗术',
			'感知',
			'牧师',
			JSON.stringify({ '人类': 1 }),
			'2d6 heal',
			2,
			1,
			'金光包裹加速愈合',
		]);

		const message = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1];
		expect(message.text).toContain('伤害 2d6 heal');
		expect(message.text).toContain('消耗 2 MP');
		expect(message.text).toContain('Lv.1');
	});
});
