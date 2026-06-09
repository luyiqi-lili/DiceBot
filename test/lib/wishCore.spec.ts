import { describe, expect, it } from 'vitest';
import {
	approveWishSummaryItems,
	claimApprovedWishTask,
	createWish,
	createWishSummary,
	isMeaningfulWish,
	updateWishTaskStatus,
} from '../../src/lib/wishCore';

type Wish = {
	id: number;
	chat_id: string;
	thread_id: string | null;
	user_id: string;
	first_name: string;
	body: string;
	status: string;
	summary_id: number | null;
};

type Summary = {
	id: number;
	message_id: number;
	chat_id: string;
	thread_id: string | null;
	body: string;
	items_json: string;
};

type Task = {
	id: number;
	summary_id: number;
	item_number: number;
	title: string;
	body: string;
	wish_ids_json: string;
	status: string;
	approved_by: string | null;
	result_text: string | null;
	updated_at?: string;
};

class MemoryWishDB {
	wishes: Wish[] = [];
	summaries: Summary[] = [];
	tasks: Task[] = [];
	nextWishId = 1;
	nextSummaryId = 1;
	nextTaskId = 1;

	prepare(sql: string) {
		const db = this;
		return {
			binds: [] as any[],
			bind(...args: any[]) {
				this.binds = args;
				return this;
			},
			async run() {
				if (sql.includes('CREATE TABLE')) return { success: true };
				if (sql.includes('INSERT INTO wishes')) {
					const [chatId, threadId, userId, firstName, body] = this.binds;
					db.wishes.push({
						id: db.nextWishId++,
						chat_id: String(chatId),
						thread_id: threadId === null || threadId === undefined ? null : String(threadId),
						user_id: String(userId),
						first_name: String(firstName),
						body: String(body),
						status: 'pending',
						summary_id: null,
					});
					return { meta: { last_row_id: db.nextWishId - 1 } };
				}
				if (sql.includes('INSERT INTO wish_summaries')) {
					const [messageId, chatId, threadId, body, itemsJson] = this.binds;
					db.summaries.push({
						id: db.nextSummaryId++,
						message_id: Number(messageId),
						chat_id: String(chatId),
						thread_id: threadId === null || threadId === undefined ? null : String(threadId),
						body: String(body),
						items_json: String(itemsJson),
					});
					return { meta: { last_row_id: db.nextSummaryId - 1 } };
				}
				if (sql.includes('INSERT INTO wish_tasks')) {
					const [summaryId, itemNumber, title, body, wishIdsJson] = this.binds;
					db.tasks.push({
						id: db.nextTaskId++,
						summary_id: Number(summaryId),
						item_number: Number(itemNumber),
						title: String(title),
						body: String(body),
						wish_ids_json: String(wishIdsJson),
						status: 'summarized',
						approved_by: null,
						result_text: null,
						updated_at: '2026-06-09 00:00:00',
					});
					return { meta: { last_row_id: db.nextTaskId - 1 } };
				}
				if (sql.includes('SET status = "approved"') && sql.includes('status = "in_progress"')) {
					for (const task of db.tasks) {
						if (task.status === 'in_progress') {
							task.status = 'approved';
							task.result_text = 'requeued';
						}
					}
					return { success: true };
				}
				if (sql.includes('UPDATE wishes SET status =')) {
					const status = String(this.binds[0]);
					const summaryId = Number(this.binds[1]);
					const ids = this.binds.slice(2).map(Number);
					for (const wish of db.wishes) {
						if (ids.includes(wish.id)) {
							wish.status = status;
							wish.summary_id = summaryId;
						}
					}
					return { success: true };
				}
				if (sql.includes('UPDATE wish_tasks SET status = ?, result_text = ?')) {
					const [status, resultText, id] = this.binds;
					const task = db.tasks.find(t => t.id === Number(id));
					if (task) {
						task.status = String(status);
						task.result_text = String(resultText);
					}
					return { success: true };
				}
				if (sql.includes('UPDATE wish_tasks SET status = "in_progress"')) {
					const [id] = this.binds;
					const task = db.tasks.find(t => t.id === Number(id));
					if (task) task.status = 'in_progress';
					return { success: true };
				}
				if (sql.includes('UPDATE wish_tasks SET status = ?')) {
					const [status, approvedBy, id] = this.binds;
					const task = db.tasks.find(t => t.id === Number(id));
					if (task && (!sql.includes('AND status = "summarized"') || task.status === 'summarized')) {
						task.status = String(status);
						task.approved_by = String(approvedBy);
					}
					return { success: true };
				}
				throw new Error(`unexpected run SQL: ${sql}`);
			},
			async first() {
				if (sql.includes('SELECT id FROM wishes')) {
					return db.wishes.at(-1) ?? null;
				}
				if (sql.includes('SELECT * FROM wish_summaries')) {
					const [messageId, chatId, threadId] = this.binds;
					const row = db.summaries.find(s =>
						s.message_id === Number(messageId)
						&& (chatId === undefined || s.chat_id === String(chatId))
						&& (threadId === undefined || s.thread_id === (threadId === null ? null : String(threadId)))
					);
					return row ? { ...row } : null;
				}
				if (sql.includes('SELECT * FROM wish_tasks WHERE status = "approved"')) {
					const row = db.tasks.find(t => t.status === 'approved');
					return row ? { ...row } : null;
				}
				throw new Error(`unexpected first SQL: ${sql}`);
			},
			async all() {
				if (sql.includes('SELECT * FROM wishes WHERE status = "pending"')) {
					return { results: db.wishes.filter(w => w.status === 'pending').map(w => ({ ...w })) };
				}
				if (sql.includes('SELECT * FROM wish_tasks WHERE summary_id = ?')) {
					const [summaryId] = this.binds;
					return { results: db.tasks.filter(t => t.summary_id === Number(summaryId)).map(t => ({ ...t })) };
				}
				throw new Error(`unexpected all SQL: ${sql}`);
			},
		};
	}
}

describe('wishCore', () => {
	it('filters obviously meaningless wishes', () => {
		expect(isMeaningfulWish('加一个狼人杀功能')).toBe(true);
		expect(isMeaningfulWish('   ')).toBe(false);
		expect(isMeaningfulWish('。。。。。。')).toBe(false);
		expect(isMeaningfulWish('test')).toBe(false);
		expect(isMeaningfulWish('啊')).toBe(false);
	});

	it('creates a pending wish', async () => {
		const db = new MemoryWishDB();

		const wish = await createWish(db as any, {
			chatId: -1001,
			threadId: 89,
			userId: 123,
			firstName: 'Alice',
			body: '希望增加每日任务',
		});

		expect(wish.id).toBe(1);
		expect(db.wishes[0]).toMatchObject({ status: 'pending', body: '希望增加每日任务' });
	});

	it('creates a summary and executable tasks, then marks wishes summarized', async () => {
		const db = new MemoryWishDB();
		await createWish(db as any, { chatId: -1001, threadId: 89, userId: 1, firstName: 'A', body: '加签到' });
		await createWish(db as any, { chatId: -1001, threadId: 89, userId: 2, firstName: 'B', body: '加每日奖励' });

		const summary = await createWishSummary(db as any, {
			messageId: 500,
			chatId: -1001,
			threadId: 89,
			body: '1. 每日签到奖励',
			items: [{ itemNumber: 1, title: '每日签到奖励', body: '增加 /checkin', wishIds: [1, 2] }],
		});

		expect(summary.id).toBe(1);
		expect(db.tasks).toHaveLength(1);
		expect(db.tasks[0]).toMatchObject({ status: 'summarized', title: '每日签到奖励' });
		expect(db.wishes.map(w => w.status)).toEqual(['summarized', 'summarized']);
	});

	it('approves tasks by summary message number, then claims one approved task', async () => {
		const db = new MemoryWishDB();
		await createWishSummary(db as any, {
			messageId: 500,
			chatId: -1001,
			threadId: 89,
			body: '1. 每日签到奖励',
			items: [{ itemNumber: 1, title: '每日签到奖励', body: '增加 /checkin', wishIds: [1] }],
		});

		const approved = await approveWishSummaryItems(db as any, {
			messageId: 500,
			itemNumbers: [1],
			approvedBy: 8080375150,
		});
		const claimed = await claimApprovedWishTask(db as any);
		await updateWishTaskStatus(db as any, claimed!.id, 'done', 'pushed abc123');

		expect(approved.map(t => t.title)).toEqual(['每日签到奖励']);
		expect(claimed).toMatchObject({ title: '每日签到奖励', status: 'approved' });
		expect(db.tasks[0]).toMatchObject({ status: 'done', result_text: 'pushed abc123' });
	});

	it('requeues stale in-progress tasks before claiming', async () => {
		const db = new MemoryWishDB();
		await createWishSummary(db as any, {
			messageId: 500,
			chatId: -1001,
			threadId: 89,
			body: '1. 每日签到奖励',
			items: [{ itemNumber: 1, title: '每日签到奖励', body: '增加 /checkin', wishIds: [1] }],
		});
		await approveWishSummaryItems(db as any, {
			messageId: 500,
			itemNumbers: [1],
			approvedBy: 8080375150,
		});
		const firstClaim = await claimApprovedWishTask(db as any);
		db.tasks[0].updated_at = '2000-01-01 00:00:00';

		const recoveredClaim = await claimApprovedWishTask(db as any);

		expect(firstClaim?.id).toBe(1);
		expect(recoveredClaim?.id).toBe(1);
		expect(db.tasks[0].status).toBe('in_progress');
	});

	it('scopes approval to the replied chat and topic', async () => {
		const db = new MemoryWishDB();
		await createWishSummary(db as any, {
			messageId: 500,
			chatId: -1001,
			threadId: 89,
			body: '1. A',
			items: [{ itemNumber: 1, title: 'A', body: 'A task', wishIds: [] }],
		});
		await createWishSummary(db as any, {
			messageId: 500,
			chatId: -2002,
			threadId: 90,
			body: '1. B',
			items: [{ itemNumber: 1, title: 'B', body: 'B task', wishIds: [] }],
		});

		const approved = await approveWishSummaryItems(db as any, {
			messageId: 500,
			chatId: -2002,
			threadId: 90,
			itemNumbers: [1],
			approvedBy: 8080375150,
		});

		expect(approved.map(t => t.title)).toEqual(['B']);
		expect(db.tasks[0].status).toBe('summarized');
		expect(db.tasks[1].status).toBe('approved');
	});

	it('does not re-approve tasks that already left summarized status', async () => {
		const db = new MemoryWishDB();
		await createWishSummary(db as any, {
			messageId: 500,
			chatId: -1001,
			threadId: 89,
			body: '1. 每日签到奖励',
			items: [{ itemNumber: 1, title: '每日签到奖励', body: '增加 /checkin', wishIds: [1] }],
		});
		db.tasks[0].status = 'done';

		const approved = await approveWishSummaryItems(db as any, {
			messageId: 500,
			chatId: -1001,
			threadId: 89,
			itemNumbers: [1],
			approvedBy: 8080375150,
		});

		expect(approved).toEqual([]);
		expect(db.tasks[0].status).toBe('done');
	});
});
