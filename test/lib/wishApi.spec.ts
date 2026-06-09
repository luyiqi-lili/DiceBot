import { describe, expect, it } from 'vitest';
import { handleWishAPI } from '../../src/lib/wishApi';
import { createWish, createWishSummary } from '../../src/lib/wishCore';

class MemoryWishDB {
	wishes: any[] = [];
	summaries: any[] = [];
	tasks: any[] = [];
	nextWishId = 1;
	nextSummaryId = 1;
	nextTaskId = 1;
	prepare(sql: string) {
		const db = this;
		return {
			binds: [] as any[],
			bind(...args: any[]) { this.binds = args; return this; },
			async run() {
				if (sql.includes('CREATE TABLE')) return {};
				if (sql.includes('INSERT INTO wishes')) {
					const [chatId, threadId, userId, firstName, body] = this.binds;
					db.wishes.push({ id: db.nextWishId++, chat_id: String(chatId), thread_id: threadId, user_id: String(userId), first_name: String(firstName), body: String(body), status: 'pending', summary_id: null });
					return { meta: { last_row_id: db.nextWishId - 1 } };
				}
				if (sql.includes('INSERT INTO wish_summaries')) {
					const [messageId, chatId, threadId, body, itemsJson] = this.binds;
					db.summaries.push({ id: db.nextSummaryId++, message_id: Number(messageId), chat_id: String(chatId), thread_id: threadId, body: String(body), items_json: String(itemsJson) });
					return { meta: { last_row_id: db.nextSummaryId - 1 } };
				}
				if (sql.includes('INSERT INTO wish_tasks')) {
					const [summaryId, itemNumber, title, body, wishIdsJson] = this.binds;
					db.tasks.push({ id: db.nextTaskId++, summary_id: Number(summaryId), item_number: Number(itemNumber), title: String(title), body: String(body), wish_ids_json: String(wishIdsJson), status: 'summarized', approved_by: null, result_text: null });
					return { meta: { last_row_id: db.nextTaskId - 1 } };
				}
				if (sql.includes('UPDATE wishes SET status =')) {
					const [status, summaryId, ...ids] = this.binds;
					for (const wish of db.wishes) if (ids.map(Number).includes(wish.id)) { wish.status = String(status); wish.summary_id = Number(summaryId); }
					return {};
				}
				if (sql.includes('SET status = "approved"') && sql.includes('status = "in_progress"')) {
					for (const task of db.tasks) {
						if (task.status === 'in_progress') task.status = 'approved';
					}
					return {};
				}
				if (sql.includes('UPDATE wish_tasks SET status = "in_progress"')) {
					const [id] = this.binds;
					const task = db.tasks.find(t => t.id === Number(id));
					if (task) task.status = 'in_progress';
					return {};
				}
				if (sql.includes('UPDATE wish_tasks SET status = ?, result_text = ?')) {
					const [status, resultText, id] = this.binds;
					const task = db.tasks.find(t => t.id === Number(id));
					if (task) { task.status = String(status); task.result_text = String(resultText); }
					return {};
				}
				throw new Error(`unexpected run SQL: ${sql}`);
			},
			async first() {
				if (sql.includes('SELECT id FROM wishes')) return db.wishes.at(-1) ?? null;
				if (sql.includes('SELECT * FROM wish_tasks WHERE status = "approved"')) {
					const task = db.tasks.find(t => t.status === 'approved');
					return task ? { ...task } : null;
				}
				throw new Error(`unexpected first SQL: ${sql}`);
			},
			async all() {
				if (sql.includes('SELECT * FROM wishes WHERE status = "pending"')) return { results: db.wishes.filter(w => w.status === 'pending').map(w => ({ ...w })) };
				throw new Error(`unexpected all SQL: ${sql}`);
			},
		};
	}
}

async function json(resp: Response) {
	return await resp.json() as any;
}

describe('wishApi', () => {
	it('returns pending wishes', async () => {
		const db = new MemoryWishDB();
		await createWish(db as any, { chatId: -1001, threadId: 89, userId: 1, firstName: 'A', body: '增加签到' });

		const resp = await handleWishAPI(new Request('https://x/api/wish/pending'), { DB: db } as any, '/api/wish/pending');

		expect(resp.status).toBe(200);
		expect((await json(resp)).wishes[0].body).toBe('增加签到');
	});

	it('stores summaries and claims approved tasks', async () => {
		const db = new MemoryWishDB();
		await createWish(db as any, { chatId: -1001, threadId: 89, userId: 1, firstName: 'A', body: '增加签到' });

		const summaryResp = await handleWishAPI(new Request('https://x/api/wish/summaries', {
			method: 'POST',
			body: JSON.stringify({
				messageId: 500,
				chatId: -1001,
				threadId: 89,
				body: '1. 新增签到',
				items: [{ itemNumber: 1, title: '新增签到', body: '实现 /checkin', wishIds: [1] }],
			}),
		}), { DB: db } as any, '/api/wish/summaries');
		db.tasks[0].status = 'approved';

		const claimResp = await handleWishAPI(new Request('https://x/api/wish/approved/claim', { method: 'POST' }), { DB: db } as any, '/api/wish/approved/claim');
		const statusResp = await handleWishAPI(new Request('https://x/api/wish/tasks/1/status', {
			method: 'POST',
			body: JSON.stringify({ status: 'done', resultText: 'pushed abc123' }),
		}), { DB: db } as any, '/api/wish/tasks/1/status');

		expect(summaryResp.status).toBe(200);
		expect((await json(claimResp)).task.title).toBe('新增签到');
		expect(statusResp.status).toBe(200);
		expect(db.tasks[0]).toMatchObject({ status: 'done', result_text: 'pushed abc123' });
	});
});
