export const WISH_ADMIN_UID = 8080375150;

export type WishStatus = 'pending' | 'summarized' | 'approved' | 'in_progress' | 'done' | 'failed' | 'rejected';
export type WishTaskStatus = 'summarized' | 'approved' | 'in_progress' | 'done' | 'failed';
const STALE_IN_PROGRESS_MINUTES = 30;

export interface WishRecord {
	id: number;
	chat_id: string;
	thread_id: string | null;
	user_id: string;
	first_name: string;
	body: string;
	status: WishStatus;
	summary_id: number | null;
	created_at?: string;
	updated_at?: string;
}

export interface WishSummaryRecord {
	id: number;
	message_id: number;
	chat_id: string;
	thread_id: string | null;
	body: string;
	items_json: string;
	created_at?: string;
}

export interface WishTaskRecord {
	id: number;
	summary_id: number;
	item_number: number;
	title: string;
	body: string;
	wish_ids_json: string;
	status: WishTaskStatus;
	approved_by: string | null;
	approved_at?: string | null;
	result_text: string | null;
	wishers_json?: string;
	created_at?: string;
	updated_at?: string;
}

export interface WishSummaryItem {
	itemNumber: number;
	title: string;
	body: string;
	wishIds: number[];
}

export interface WishMention {
	userId: string;
	firstName: string;
}

const MEANINGLESS_WORDS = new Set([
	'test',
	'testing',
	'测试',
	'随便',
	'无',
	'没有',
	'不知道',
	'none',
	'n/a',
	'na',
	'aaa',
	'哈哈',
	'哈哈哈',
]);

export function isMeaningfulWish(input: string): boolean {
	const text = String(input ?? '').trim();
	if (text.length < 4) return false;
	const compact = text.replace(/\s+/g, '').toLowerCase();
	if (MEANINGLESS_WORDS.has(compact)) return false;
	if (/^[\p{P}\p{S}\d_]+$/u.test(compact)) return false;
	if (/^(.)\1{3,}$/u.test(compact)) return false;
	return true;
}

export async function ensureWishTables(db: D1Database): Promise<void> {
	await db.prepare(`
		CREATE TABLE IF NOT EXISTS wishes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			chat_id TEXT NOT NULL,
			thread_id TEXT,
			user_id TEXT NOT NULL,
			first_name TEXT NOT NULL DEFAULT '',
			body TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'pending',
			summary_id INTEGER,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`).run();
	await db.prepare(`
		CREATE TABLE IF NOT EXISTS wish_summaries (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			message_id INTEGER NOT NULL,
			chat_id TEXT NOT NULL,
			thread_id TEXT,
			body TEXT NOT NULL,
			items_json TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`).run();
	await db.prepare(`
		CREATE TABLE IF NOT EXISTS wish_tasks (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			summary_id INTEGER NOT NULL,
			item_number INTEGER NOT NULL,
			title TEXT NOT NULL,
			body TEXT NOT NULL,
			wish_ids_json TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'summarized',
			approved_by TEXT,
			approved_at TEXT,
			result_text TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`).run();
}

function lastRowId(result: any): number {
	return Number(result?.meta?.last_row_id ?? result?.lastRowId ?? result?.last_row_id ?? 0);
}

function parseWishIds(raw: string | null | undefined): number[] {
	try {
		const ids = JSON.parse(String(raw ?? '[]'));
		if (!Array.isArray(ids)) return [];
		return Array.from(new Set(ids.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0)));
	} catch {
		return [];
	}
}

async function getWishMentionsForTask(db: D1Database, task: WishTaskRecord): Promise<WishMention[]> {
	const wishIds = parseWishIds(task.wish_ids_json);
	if (!wishIds.length) return [];

	const placeholders = wishIds.map(() => '?').join(', ');
	const result = await db.prepare(`
		SELECT id, user_id, first_name FROM wishes WHERE id IN (${placeholders})
	`).bind(...wishIds).all<Pick<WishRecord, 'id' | 'user_id' | 'first_name'>>();
	const rows = (result.results ?? []) as Pick<WishRecord, 'id' | 'user_id' | 'first_name'>[];
	const byId = new Map(rows.map(row => [Number(row.id), row]));
	const seen = new Set<string>();
	const mentions: WishMention[] = [];

	for (const wishId of wishIds) {
		const row = byId.get(wishId);
		const userId = String(row?.user_id ?? '');
		if (!userId || seen.has(userId)) continue;
		seen.add(userId);
		mentions.push({
			userId,
			firstName: String(row?.first_name ?? ''),
		});
	}
	return mentions;
}

export async function createWish(
	db: D1Database,
	input: { chatId: string | number; threadId?: string | number | null; userId: string | number; firstName?: string; body: string },
): Promise<WishRecord> {
	await ensureWishTables(db);
	const body = input.body.trim();
	const result = await db.prepare(`
		INSERT INTO wishes (chat_id, thread_id, user_id, first_name, body, status, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
	`).bind(
		String(input.chatId),
		input.threadId === undefined || input.threadId === null ? null : String(input.threadId),
		String(input.userId),
		String(input.firstName ?? ''),
		body,
	).run();
	const id = lastRowId(result);
	const row = await db.prepare(`SELECT id FROM wishes ORDER BY id DESC LIMIT 1`).first<Pick<WishRecord, 'id'>>();
	return {
		id: id || Number(row?.id ?? 0),
		chat_id: String(input.chatId),
		thread_id: input.threadId === undefined || input.threadId === null ? null : String(input.threadId),
		user_id: String(input.userId),
		first_name: String(input.firstName ?? ''),
		body,
		status: 'pending',
		summary_id: null,
	};
}

export async function listPendingWishes(db: D1Database, limit = 50): Promise<WishRecord[]> {
	await ensureWishTables(db);
	const result = await db.prepare(`
		SELECT * FROM wishes WHERE status = "pending" ORDER BY id ASC LIMIT ?
	`).bind(limit).all<WishRecord>();
	return (result.results ?? []) as WishRecord[];
}

export async function createWishSummary(
	db: D1Database,
	input: {
		messageId: number;
		chatId: string | number;
		threadId?: string | number | null;
		body: string;
		items: WishSummaryItem[];
	},
): Promise<WishSummaryRecord> {
	await ensureWishTables(db);
	const existing = await findWishSummaryByMessageId(db, input.messageId, {
		chatId: input.chatId,
		threadId: input.threadId ?? null,
	});
	if (existing) return existing;

	const itemsJson = JSON.stringify(input.items);
	const summaryResult = await db.prepare(`
		INSERT INTO wish_summaries (message_id, chat_id, thread_id, body, items_json, created_at)
		VALUES (?, ?, ?, ?, ?, datetime('now'))
	`).bind(
		input.messageId,
		String(input.chatId),
		input.threadId === undefined || input.threadId === null ? null : String(input.threadId),
		input.body,
		itemsJson,
	).run();
	const summaryId = lastRowId(summaryResult);

	for (const item of input.items) {
		await db.prepare(`
			INSERT INTO wish_tasks (summary_id, item_number, title, body, wish_ids_json, status, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, 'summarized', datetime('now'), datetime('now'))
		`).bind(summaryId, item.itemNumber, item.title, item.body, JSON.stringify(item.wishIds)).run();

		if (item.wishIds.length > 0) {
			const placeholders = item.wishIds.map(() => '?').join(', ');
			await db.prepare(`
				UPDATE wishes SET status = ?, summary_id = ?, updated_at = datetime('now')
				WHERE id IN (${placeholders})
			`).bind('summarized', summaryId, ...item.wishIds).run();
		}
	}

	return {
		id: summaryId,
		message_id: input.messageId,
		chat_id: String(input.chatId),
		thread_id: input.threadId === undefined || input.threadId === null ? null : String(input.threadId),
		body: input.body,
		items_json: itemsJson,
	};
}

export async function findWishSummaryByMessageId(
	db: D1Database,
	messageId: number,
	scope?: { chatId?: string | number; threadId?: string | number | null },
): Promise<WishSummaryRecord | null> {
	await ensureWishTables(db);
	if (scope?.chatId !== undefined) {
		const threadId = scope.threadId === undefined || scope.threadId === null ? null : String(scope.threadId);
		return await db.prepare(`
			SELECT * FROM wish_summaries
			WHERE message_id = ? AND chat_id = ?
				AND ((thread_id IS NULL AND ? IS NULL) OR thread_id = ?)
		`).bind(messageId, String(scope.chatId), threadId, threadId).first<WishSummaryRecord>();
	}
	return await db.prepare(`SELECT * FROM wish_summaries WHERE message_id = ?`).bind(messageId).first<WishSummaryRecord>();
}

export async function getWishTasksForSummary(db: D1Database, summaryId: number): Promise<WishTaskRecord[]> {
	await ensureWishTables(db);
	const result = await db.prepare(`SELECT * FROM wish_tasks WHERE summary_id = ? ORDER BY item_number ASC`).bind(summaryId).all<WishTaskRecord>();
	return (result.results ?? []) as WishTaskRecord[];
}

export async function approveWishSummaryItems(
	db: D1Database,
	input: {
		messageId: number;
		chatId?: string | number;
		threadId?: string | number | null;
		itemNumbers: number[];
		approvedBy: string | number;
	},
): Promise<WishTaskRecord[]> {
	const summary = await findWishSummaryByMessageId(db, input.messageId, {
		chatId: input.chatId,
		threadId: input.threadId,
	});
	if (!summary) return [];
	const tasks = await getWishTasksForSummary(db, summary.id);
	const selected = tasks.filter(task =>
		task.status === 'summarized' && input.itemNumbers.includes(Number(task.item_number))
	);
	for (const task of selected) {
		await db.prepare(`
			UPDATE wish_tasks SET status = ?, approved_by = ?, approved_at = datetime('now'), updated_at = datetime('now')
			WHERE id = ? AND status = "summarized"
		`).bind('approved', String(input.approvedBy), task.id).run();
		task.status = 'approved';
		task.approved_by = String(input.approvedBy);
	}
	return selected;
}

export async function claimApprovedWishTask(db: D1Database): Promise<WishTaskRecord | null> {
	await ensureWishTables(db);
	await db.prepare(`
		UPDATE wish_tasks
		SET status = "approved",
			result_text = "莉莉发现上次处理半路断开啦，已经把愿望放回队列。",
			updated_at = datetime('now')
		WHERE status = "in_progress"
			AND updated_at < datetime('now', ?)
	`).bind(`-${STALE_IN_PROGRESS_MINUTES} minutes`).run();
	const task = await db.prepare(`
		SELECT * FROM wish_tasks WHERE status = "approved" ORDER BY approved_at ASC, id ASC LIMIT 1
	`).first<WishTaskRecord>();
	if (!task) return null;
	const wishers = await getWishMentionsForTask(db, task);
	await db.prepare(`
		UPDATE wish_tasks SET status = "in_progress", updated_at = datetime('now') WHERE id = ?
	`).bind(task.id).run();
	task.wishers_json = JSON.stringify(wishers);
	return task;
}

export async function updateWishTaskStatus(
	db: D1Database,
	taskId: number,
	status: WishTaskStatus,
	resultText = '',
): Promise<void> {
	await ensureWishTables(db);
	await db.prepare(`
		UPDATE wish_tasks SET status = ?, result_text = ?, updated_at = datetime('now') WHERE id = ?
	`).bind(status, resultText, taskId).run();
}
