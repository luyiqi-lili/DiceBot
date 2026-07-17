/**
 * @file src/lib/topicAccess.ts
 * @description 按主题（topic / message_thread_id）限制的功能开关，可由群主动态配置，按群组（chat_id）隔离。
 *   适用于「仅在特定主题可用」的命令：/coin pray、/fate、/f。
 *
 *   生效优先级（isFeatureAllowed）：
 *   1. 群内已通过 /topic 配置 → 以配置为准（含「任意主题」哨兵）。
 *   2. 未配置但命中历史硬编码默认 → 沿用默认（保持既有 3 个群的行为不变）。
 *   3. 未配置且无默认（新群）→ 放开，所有主题可用。
 */

import { type EnvLike } from './telegram';

export type TopicAccessEnv = EnvLike & { DB?: D1Database };

/** 可按主题限制的功能注册表。key 即 /topic 命令中使用的功能名。 */
export const TOPIC_FEATURES = {
	pray: { label: '/coin pray 每日祈祷' },
	fate: { label: '/fate 塔罗占卜' },
	fish: { label: '/f 钓鱼' },
} as const;

export type TopicFeature = keyof typeof TOPIC_FEATURES;

export const TOPIC_FEATURE_KEYS = Object.keys(TOPIC_FEATURES) as TopicFeature[];

export function isTopicFeature(key: string): key is TopicFeature {
	return Object.prototype.hasOwnProperty.call(TOPIC_FEATURES, key);
}

/** thread_id 哨兵值：表示「该功能在本群所有主题可用」。真实主题 id 恒为非负。 */
export const ANYWHERE = -1;

/** 历史硬编码默认。未配置时沿用，保持既有群组行为不变。 */
const DEFAULTS: Record<TopicFeature, Map<number, number[]>> = {
	pray: new Map([
		[-1002848481881, [66]],
		[-1002970430696, [89, 157]],
		[-1002742074355, [638714]],
	]),
	fate: new Map([
		[-1002848481881, [66]],
		[-1002970430696, [89, 160]],
		[-1002742074355, [345]],
	]),
	fish: new Map([
		[-1002848481881, [66]],
		[-1002970430696, [89, 166]],
		[-1002742074355, [454656]],
	]),
};

/** 归一化主题 id：General（无 thread）视为 0。 */
function normThread(threadId: number | null | undefined): number {
	return threadId ?? 0;
}

/* ------------------------- 配置存储（D1） ------------------------- */

async function ensureTable(env: TopicAccessEnv): Promise<boolean> {
	if (!env.DB) return false;
	await env.DB.prepare(`
		CREATE TABLE IF NOT EXISTS topic_access (
			chat_id INTEGER NOT NULL,
			feature TEXT NOT NULL,
			thread_id INTEGER NOT NULL,
			updated_at TEXT NOT NULL DEFAULT (datetime('now')),
			PRIMARY KEY (chat_id, feature, thread_id)
		)
	`).run();
	return true;
}

/** 读取某群某功能已配置的 thread_id 列表；未配置（无行）返回 null。读路径不建表。 */
async function getConfiguredTopics(env: TopicAccessEnv, chatId: number | string, feature: TopicFeature): Promise<number[] | null> {
	if (!env.DB) return null;
	try {
		const res = await env.DB.prepare(
			`SELECT thread_id FROM topic_access WHERE chat_id = ? AND feature = ?`,
		).bind(Number(chatId), feature).all();
		const rows = (res.results as any[]) ?? [];
		if (!rows.length) return null;
		return rows.map(r => Number(r.thread_id));
	} catch {
		return null;
	}
}

/** 判断某功能在当前群+主题是否可用。 */
export async function isFeatureAllowed(
	env: TopicAccessEnv,
	chatId: number | string,
	threadId: number | null | undefined,
	feature: TopicFeature,
): Promise<boolean> {
	const configured = await getConfiguredTopics(env, chatId, feature);
	if (configured) {
		if (configured.includes(ANYWHERE)) return true;
		return configured.includes(normThread(threadId));
	}
	const def = DEFAULTS[feature].get(Number(chatId));
	if (def) return def.includes(normThread(threadId));
	// 未配置且无历史默认（新群）→ 放开
	return true;
}

export type TopicConfigView = {
	source: 'config' | 'default' | 'open';
	anywhere: boolean;
	topics: number[];
};

/** 返回某功能在本群的生效配置视图，供展示。 */
export async function getFeatureConfig(env: TopicAccessEnv, chatId: number | string, feature: TopicFeature): Promise<TopicConfigView> {
	const configured = await getConfiguredTopics(env, chatId, feature);
	if (configured) {
		if (configured.includes(ANYWHERE)) return { source: 'config', anywhere: true, topics: [] };
		return { source: 'config', anywhere: false, topics: configured.slice().sort((a, b) => a - b) };
	}
	const def = DEFAULTS[feature].get(Number(chatId));
	if (def) return { source: 'default', anywhere: false, topics: def.slice().sort((a, b) => a - b) };
	return { source: 'open', anywhere: true, topics: [] };
}

/** 允许某功能在指定主题使用（同时清除「任意主题」哨兵，转为按主题限制）。 */
export async function allowTopic(env: TopicAccessEnv, chatId: number | string, feature: TopicFeature, threadId: number | null | undefined): Promise<boolean> {
	if (!(await ensureTable(env))) return false;
	await env.DB!.prepare(
		`DELETE FROM topic_access WHERE chat_id = ? AND feature = ? AND thread_id = ?`,
	).bind(Number(chatId), feature, ANYWHERE).run();
	await env.DB!.prepare(
		`INSERT INTO topic_access (chat_id, feature, thread_id) VALUES (?, ?, ?)
		 ON CONFLICT(chat_id, feature, thread_id) DO UPDATE SET updated_at = datetime('now')`,
	).bind(Number(chatId), feature, normThread(threadId)).run();
	return true;
}

/** 取消某功能在指定主题的使用许可。 */
export async function disallowTopic(env: TopicAccessEnv, chatId: number | string, feature: TopicFeature, threadId: number | null | undefined): Promise<boolean> {
	if (!(await ensureTable(env))) return false;
	await env.DB!.prepare(
		`DELETE FROM topic_access WHERE chat_id = ? AND feature = ? AND thread_id = ?`,
	).bind(Number(chatId), feature, normThread(threadId)).run();
	return true;
}

/** 设为「本群所有主题可用」。 */
export async function setAnywhere(env: TopicAccessEnv, chatId: number | string, feature: TopicFeature): Promise<boolean> {
	if (!(await ensureTable(env))) return false;
	await env.DB!.prepare(`DELETE FROM topic_access WHERE chat_id = ? AND feature = ?`).bind(Number(chatId), feature).run();
	await env.DB!.prepare(`INSERT INTO topic_access (chat_id, feature, thread_id) VALUES (?, ?, ?)`).bind(Number(chatId), feature, ANYWHERE).run();
	return true;
}

/** 清除本群该功能的全部配置，恢复到历史默认（或新群的「放开」）。 */
export async function resetFeature(env: TopicAccessEnv, chatId: number | string, feature: TopicFeature): Promise<boolean> {
	if (!(await ensureTable(env))) return false;
	await env.DB!.prepare(`DELETE FROM topic_access WHERE chat_id = ? AND feature = ?`).bind(Number(chatId), feature).run();
	return true;
}
