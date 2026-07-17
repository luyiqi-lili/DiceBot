import { describe, it, expect } from 'vitest';
import {
	isFeatureAllowed,
	getFeatureConfig,
	allowTopic,
	disallowTopic,
	setAnywhere,
	resetFeature,
	ANYWHERE,
} from '../../src/lib/topicAccess';

// 一个历史默认群：pray 默认仅 [66]
const DEFAULT_CHAT = -1002848481881;
// 一个全新群：无默认
const NEW_CHAT = -100999;

/** 极简内存版 D1，仅实现 topic_access 所用的几条 SQL。 */
function makeFakeDb() {
	const store = new Set<string>(); // key = `${chat}:${feature}:${thread}`
	const k = (c: any, f: any, t: any) => `${c}:${f}:${t}`;
	return {
		store,
		prepare(sql: string) {
			const s = sql.trim();
			let params: any[] = [];
			const stmt: any = {
				bind(...p: any[]) {
					params = p;
					return stmt;
				},
				async run() {
					if (s.startsWith('CREATE TABLE')) return { success: true };
					if (s.startsWith('INSERT INTO topic_access')) {
						store.add(k(params[0], params[1], params[2]));
						return { success: true };
					}
					if (s.startsWith('DELETE FROM topic_access')) {
						if (params.length === 3) store.delete(k(params[0], params[1], params[2]));
						else {
							// DELETE ... WHERE chat_id=? AND feature=?
							const prefix = `${params[0]}:${params[1]}:`;
							for (const key of [...store]) if (key.startsWith(prefix)) store.delete(key);
						}
						return { success: true };
					}
					return { success: true };
				},
				async all() {
					// SELECT thread_id ... WHERE chat_id=? AND feature=?
					const prefix = `${params[0]}:${params[1]}:`;
					const results = [...store]
						.filter(key => key.startsWith(prefix))
						.map(key => ({ thread_id: Number(key.slice(prefix.length)) }));
					return { results };
				},
			};
			return stmt;
		},
	};
}

describe('topicAccess — 默认与放开', () => {
	it('无 DB 时沿用历史默认：默认群 pray 仅默认主题', async () => {
		const env = { TOKEN: 't' } as any;
		expect(await isFeatureAllowed(env, DEFAULT_CHAT, 66, 'pray')).toBe(true);
		expect(await isFeatureAllowed(env, DEFAULT_CHAT, 99, 'pray')).toBe(false);
	});

	it('新群无默认时放开所有主题', async () => {
		const env = { TOKEN: 't' } as any;
		expect(await isFeatureAllowed(env, NEW_CHAT, 0, 'fish')).toBe(true);
		expect(await isFeatureAllowed(env, NEW_CHAT, 12345, 'fish')).toBe(true);
	});
});

describe('topicAccess — 动态配置', () => {
	it('allow 指定主题后仅该主题可用，覆盖历史默认', async () => {
		const env = { TOKEN: 't', DB: makeFakeDb() } as any;
		await allowTopic(env, DEFAULT_CHAT, 'pray', 500);
		expect(await isFeatureAllowed(env, DEFAULT_CHAT, 500, 'pray')).toBe(true);
		// 原默认主题 66 不再自动可用（已切换为配置模式）
		expect(await isFeatureAllowed(env, DEFAULT_CHAT, 66, 'pray')).toBe(false);
	});

	it('anywhere 放开所有主题', async () => {
		const env = { TOKEN: 't', DB: makeFakeDb() } as any;
		await setAnywhere(env, NEW_CHAT, 'fate');
		expect(await isFeatureAllowed(env, NEW_CHAT, 1, 'fate')).toBe(true);
		expect(await isFeatureAllowed(env, NEW_CHAT, 2, 'fate')).toBe(true);
		const view = await getFeatureConfig(env, NEW_CHAT, 'fate');
		expect(view).toMatchObject({ source: 'config', anywhere: true });
	});

	it('allow 会清除 anywhere 哨兵，转为按主题限制', async () => {
		const env = { TOKEN: 't', DB: makeFakeDb() } as any;
		await setAnywhere(env, NEW_CHAT, 'fish');
		await allowTopic(env, NEW_CHAT, 'fish', 7);
		expect(env.DB.store.has(`${NEW_CHAT}:fish:${ANYWHERE}`)).toBe(false);
		expect(await isFeatureAllowed(env, NEW_CHAT, 7, 'fish')).toBe(true);
		expect(await isFeatureAllowed(env, NEW_CHAT, 8, 'fish')).toBe(false);
	});

	it('disallow 移除某主题', async () => {
		const env = { TOKEN: 't', DB: makeFakeDb() } as any;
		await allowTopic(env, NEW_CHAT, 'pray', 10);
		await allowTopic(env, NEW_CHAT, 'pray', 20);
		await disallowTopic(env, NEW_CHAT, 'pray', 10);
		expect(await isFeatureAllowed(env, NEW_CHAT, 10, 'pray')).toBe(false);
		expect(await isFeatureAllowed(env, NEW_CHAT, 20, 'pray')).toBe(true);
	});

	it('reset 清空配置，恢复默认', async () => {
		const env = { TOKEN: 't', DB: makeFakeDb() } as any;
		await allowTopic(env, DEFAULT_CHAT, 'pray', 999);
		await resetFeature(env, DEFAULT_CHAT, 'pray');
		const view = await getFeatureConfig(env, DEFAULT_CHAT, 'pray');
		expect(view).toMatchObject({ source: 'default', topics: [66] });
		expect(await isFeatureAllowed(env, DEFAULT_CHAT, 66, 'pray')).toBe(true);
	});

	it('配置按群组隔离', async () => {
		const env = { TOKEN: 't', DB: makeFakeDb() } as any;
		await allowTopic(env, NEW_CHAT, 'fish', 3);
		// 另一个新群不受影响，仍放开
		expect(await isFeatureAllowed(env, -100888, 3, 'fish')).toBe(true);
		expect(await isFeatureAllowed(env, -100888, 999, 'fish')).toBe(true);
	});
});
