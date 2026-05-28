/**
 * @file commands/like.ts
 * @description 调用次数查询命令处理器（/like）。
 *   统计每位用户调用机器人的总次数，基于 D1 数据库（user_usage_count 表）。
 *   同时导出 incrementUsageCount 供 index.ts 在每次用户交互时自增计数。
 */

import TgMessage, { ParsedUpdate, EnvLike, extractCmdContext } from "../lib/tgMessage";
import type { Env } from "../index";
import { likeTextMapFriend } from "../lib/liveConfig";
import { escapeHtml } from "../lib/util";

/** 单次调用自增（UPSERT 原子操作） */
export async function incrementUsageCount(parsedMessage: ParsedUpdate, env: Env): Promise<void> {
	if (!parsedMessage || parsedMessage.type !== "message" || !parsedMessage.message) return;

	const from = parsedMessage.from ?? parsedMessage.message.from;
	if (!from || typeof from.id === "undefined") return;

	const userId = from.id;
	const firstName = from.first_name ?? "";

	try {
		await env.DB!.prepare(
			`INSERT INTO user_usage_count (user_id, first_name, usage_count, updated_at)
			 VALUES (?, ?, 1, datetime('now'))
			 ON CONFLICT(user_id) DO UPDATE SET
			   first_name = excluded.first_name,
			   usage_count = usage_count + 1,
			   updated_at = datetime('now')`
		).bind(userId, firstName).run();
	} catch (e) {
		console.error("[incrementUsageCount] DB 写入失败", e);
	}
}

/** 处理 /like 和 /like all */
export async function handleLike(parsedMessage: ParsedUpdate, env: Env) {
	const chatId = parsedMessage.chatId || parsedMessage.message?.chat?.id;
	if (!chatId) {
		console.error("[like] 找不到 chatId");
		return;
	}

	const isAllQuery =
		(parsedMessage.command === "like" && Array.isArray(parsedMessage.args) && parsedMessage.args[0] === "all");

	if (isAllQuery) {
		// ── Top10 排行榜 ──
		const { results } = await env.DB!.prepare(
			`SELECT user_id, first_name, usage_count
			 FROM user_usage_count
			 ORDER BY usage_count DESC
			 LIMIT 10`
		).all<{ user_id: number; first_name: string; usage_count: number }>();

		const rows = (results ?? []).map(r => {
			const name = r.first_name ? escapeHtml(r.first_name) : `ID ${r.user_id}`;
			return `${name}：${r.usage_count} 次`;
		});

		const text = rows.length > 0
			? `<b>骰娘 Top10 使用榜：</b>\n<blockquote expandable>${rows.join("\n")}</blockquote>`
			: "📭 暂无使用记录。";

		return await TgMessage.sendText(env, {
			chat_id: chatId,
			text,
			parse_mode: "HTML",
			message_thread_id: parsedMessage.threadId,
		});
	}

	// ── 个人查询 ──
	const from = parsedMessage.from || parsedMessage.message?.from;
	if (!from) {
		console.error("[like] 找不到用户信息");
		return;
	}

	const userId = from.id;
	const row = await env.DB!.prepare(
		`SELECT usage_count FROM user_usage_count WHERE user_id = ?`
	).bind(userId).first<{ usage_count: number }>();

	const count = row?.usage_count ?? 0;

	// 好感文本匹配
	const likeTextMap = likeTextMapFriend;
	let attitudePool: string[] = [];
	for (const entry of likeTextMap) {
		if (entry.range === "above" && count > 1000) {
			attitudePool = entry.texts;
			break;
		} else if (Array.isArray(entry.range)) {
			const [min, max] = entry.range;
			if (count >= min && count <= max) {
				attitudePool = entry.texts;
				break;
			}
		}
	}
	if (attitudePool.length === 0) attitudePool = ["骰娘一时搞不清你属于哪个等级啦！🤔"];

	const remark = escapeHtml(attitudePool[Math.floor(Math.random() * attitudePool.length)]);
	const displayName = (from.first_name as string) || `ID ${userId}`;

	const text = `${escapeHtml(displayName)}，你已经召唤骰娘 <b>${count}</b> 次了！${remark}`;

	return await TgMessage.sendText(env, {
		chat_id: chatId,
		text,
		parse_mode: "HTML",
		message_thread_id: parsedMessage.threadId,
	});
}

export default handleLike;
