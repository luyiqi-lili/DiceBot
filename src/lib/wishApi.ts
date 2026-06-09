import type { Env } from '../index';
import {
	claimApprovedWishTask,
	createWishSummary,
	listPendingWishes,
	updateWishTaskStatus,
	type WishTaskStatus,
} from './wishCore';

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

async function readJson(request: Request): Promise<any> {
	return await request.json().catch(() => ({}));
}

function taskIdFromPath(path: string): number | null {
	const match = path.match(/^\/api\/wish\/tasks\/(\d+)\/status$/);
	if (!match) return null;
	return Number(match[1]);
}

export async function handleWishAPI(request: Request, env: Env, path: string): Promise<Response> {
	if (!env.DB) {
		return jsonResponse({ error: 'D1 database is not configured' }, 500);
	}

	if (path === '/api/wish/pending' && request.method === 'GET') {
		const url = new URL(request.url);
		const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
		const wishes = await listPendingWishes(env.DB, limit);
		return jsonResponse({ wishes });
	}

	if (path === '/api/wish/summaries' && request.method === 'POST') {
		const body = await readJson(request);
		const summary = await createWishSummary(env.DB, {
			messageId: Number(body.messageId),
			chatId: body.chatId,
			threadId: body.threadId ?? null,
			body: String(body.body ?? ''),
			items: Array.isArray(body.items) ? body.items : [],
		});
		return jsonResponse({ summary });
	}

	if (path === '/api/wish/approved/claim' && request.method === 'POST') {
		const task = await claimApprovedWishTask(env.DB);
		return jsonResponse({ task });
	}

	const taskId = taskIdFromPath(path);
	if (taskId !== null && request.method === 'POST') {
		const body = await readJson(request);
		const status = String(body.status ?? '') as WishTaskStatus;
		if (!['summarized', 'approved', 'in_progress', 'done', 'failed'].includes(status)) {
			return jsonResponse({ error: 'Invalid status' }, 400);
		}
		await updateWishTaskStatus(env.DB, taskId, status, String(body.resultText ?? ''));
		return jsonResponse({ ok: true });
	}

	return jsonResponse({ error: 'Not Found' }, 404);
}
