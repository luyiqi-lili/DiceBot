import TgMessage, { ParsedUpdate } from '../lib/telegram';
import { TOP_ADMIN_UIDS } from '../lib/liveConfig';
import { escapeHtml } from '../lib/util';
import { getKnownTopicRoomName } from '../data/topics';

import type { Env } from '../index';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 10;

type TopicTopRow = {
	thread_id: number;
	topic_name: string | null;
	message_count: number;
};

function fallbackTopicName(threadId: number): string {
	return `主题 ${threadId}`;
}

function displayTopicName(chatId: number, row: TopicTopRow): string {
	const topicName = String(row.topic_name ?? '').trim();
	return topicName || getKnownTopicRoomName(chatId, row.thread_id) || fallbackTopicName(row.thread_id);
}

function normalizeRows(result: any): TopicTopRow[] {
	const rows = (result && result.results) || result || [];
	return Array.isArray(rows) ? rows : [];
}

function buildTopReply(chatId: number, rows: TopicTopRow[]): string {
	const first = rows[0];
	const firstName = displayTopicName(chatId, first);
	const lines = rows.map((row, index) => {
		const name = escapeHtml(displayTopicName(chatId, row));
		return `${index + 1}. ${name}：${Number(row.message_count) || 0} 条`;
	});

	return [
		`📊 最近 7 天主题消息排行`,
		`消息最多的主题：<b>${escapeHtml(firstName)}</b>（${Number(first.message_count) || 0} 条）`,
		'',
		...lines,
	].join('\n');
}

export async function handleTop(parsedMessage: ParsedUpdate, env: Env) {
	const chatId = parsedMessage.chatId || parsedMessage.message?.chat?.id;
	const threadId = parsedMessage.threadId ?? parsedMessage.message?.message_thread_id;
	const callerId = Number(parsedMessage.from?.id ?? parsedMessage.message?.from?.id ?? 0);

	if (!chatId) {
		console.error('[Top] missing chatId');
		return;
	}

	if (!TOP_ADMIN_UIDS.includes(callerId)) {
		await TgMessage.sendText(env, {
			chat_id: chatId,
			text: '❌ 你没有权限使用 /top。',
			message_thread_id: threadId,
		});
		return;
	}

	if (!env.DB) {
		await TgMessage.sendText(env, {
			chat_id: chatId,
			text: '⚠️ /top 需要 D1 数据库支持，当前环境未配置。',
			message_thread_id: threadId,
		});
		return;
	}

	const since = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

	try {
		const result = await env.DB.prepare(`
			SELECT
				mh.thread_id,
				COALESCE((
					SELECT mh2.topic_name
					FROM message_history mh2
					WHERE mh2.chat_id = mh.chat_id
						AND mh2.thread_id = mh.thread_id
						AND mh2.topic_name IS NOT NULL
						AND mh2.topic_name != ''
					ORDER BY mh2.created_at DESC
					LIMIT 1
				), '') AS topic_name,
				COUNT(*) AS message_count
			FROM message_history mh
			WHERE mh.chat_id = ?
				AND mh.created_at >= ?
				AND mh.thread_id IS NOT NULL
			GROUP BY mh.thread_id
			ORDER BY message_count DESC, mh.thread_id ASC
			LIMIT ?
		`)
			.bind(chatId, since, DEFAULT_LIMIT)
			.all<TopicTopRow>();

		const rows = normalizeRows(result);
		if (rows.length === 0) {
			await TgMessage.sendText(env, {
				chat_id: chatId,
				text: '📭 最近 7 天还没有可统计的主题消息。',
				message_thread_id: threadId,
			});
			return;
		}

		await TgMessage.sendText(env, {
			chat_id: chatId,
			text: buildTopReply(chatId, rows),
			parse_mode: 'HTML',
			message_thread_id: threadId,
		});
	} catch (error) {
		console.error('[Top] query failed', error);
		await TgMessage.sendText(env, {
			chat_id: chatId,
			text: '⚠️ 查询主题消息排行时发生错误，请稍后重试。',
			message_thread_id: threadId,
		});
	}
}

export default handleTop;
