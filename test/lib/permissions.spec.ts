import { afterEach, describe, expect, it, vi } from 'vitest';
import Telegram from '../../src/lib/telegram';
import {
	PERMISSIONS,
	grantPermission,
	revokePermission,
	listUserGrants,
	hasGrant,
	hasAdminPermission,
	isChatOwner,
} from '../../src/lib/permissions';

const CHAT_ID = -1002848481881;
const ALLOWLISTED_UID = PERMISSIONS.coin_take.staticUids[0];
const OUTSIDER_UID = 424242;

function mockStatus(status: string | null) {
	return vi
		.spyOn(Telegram, 'checkChatMemberStatus')
		.mockResolvedValue(status === null ? {} : ({ status } as any));
}

/** 极简内存版 D1，仅实现 permission_grants 所用的几条 SQL。 */
function makeFakeDb() {
	const store = new Set<string>(); // key = `${chat}:${user}:${perm}`
	const key = (c: any, u: any, p: any) => `${c}:${u}:${p}`;
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
					if (s.startsWith('INSERT INTO permission_grants')) {
						store.add(key(params[0], params[1], params[2]));
						return { success: true };
					}
					if (s.startsWith('DELETE FROM permission_grants')) {
						store.delete(key(params[0], params[1], params[2]));
						return { success: true };
					}
					return { success: true };
				},
				async all() {
					const prefix = `${params[0]}:${params[1]}:`;
					const results = [...store]
						.filter(k => k.startsWith(prefix))
						.map(k => ({ permission: k.slice(prefix.length) }));
					return { results };
				},
				async first() {
					return store.has(key(params[0], params[1], params[2])) ? { 1: 1 } : null;
				},
			};
			return stmt;
		},
	};
}

describe('permissions — isChatOwner', () => {
	afterEach(() => vi.restoreAllMocks());

	it('群主（creator）返回 true', async () => {
		mockStatus('creator');
		expect(await isChatOwner({ TOKEN: 't' } as any, CHAT_ID, 999)).toBe(true);
	});

	it('普通管理员（administrator）返回 false', async () => {
		mockStatus('administrator');
		expect(await isChatOwner({ TOKEN: 't' } as any, CHAT_ID, 999)).toBe(false);
	});

	it('查询抛错时保守返回 false', async () => {
		vi.spyOn(Telegram, 'checkChatMemberStatus').mockRejectedValue(new Error('api down'));
		expect(await isChatOwner({ TOKEN: 't' } as any, CHAT_ID, 999)).toBe(false);
	});
});

describe('permissions — hasAdminPermission', () => {
	afterEach(() => vi.restoreAllMocks());

	it('静态白名单用户直接通过，不查询群成员状态', async () => {
		const spy = mockStatus('member');
		const env = { TOKEN: 't' } as any; // 无 DB
		expect(await hasAdminPermission(env, CHAT_ID, ALLOWLISTED_UID, 'coin_take')).toBe(true);
		expect(spy).not.toHaveBeenCalled();
	});

	it('非白名单但为群主时通过', async () => {
		mockStatus('creator');
		const env = { TOKEN: 't' } as any;
		expect(await hasAdminPermission(env, CHAT_ID, OUTSIDER_UID, 'coin_take')).toBe(true);
	});

	it('非白名单、非群主、无动态授权时拒绝', async () => {
		mockStatus('member');
		const env = { TOKEN: 't', DB: makeFakeDb() } as any;
		expect(await hasAdminPermission(env, CHAT_ID, OUTSIDER_UID, 'coin_take')).toBe(false);
	});

	it('被动态授予后通过，且不触发群主查询', async () => {
		const spy = mockStatus('member');
		const env = { TOKEN: 't', DB: makeFakeDb() } as any;
		await grantPermission(env, CHAT_ID, OUTSIDER_UID, 'coin_take', 1);
		expect(await hasAdminPermission(env, CHAT_ID, OUTSIDER_UID, 'coin_take')).toBe(true);
		expect(spy).not.toHaveBeenCalled();
	});

	it('动态授权按群组隔离', async () => {
		mockStatus('member');
		const env = { TOKEN: 't', DB: makeFakeDb() } as any;
		await grantPermission(env, CHAT_ID, OUTSIDER_UID, 'coin_take', 1);
		expect(await hasAdminPermission(env, -100999, OUTSIDER_UID, 'coin_take')).toBe(false);
	});
});

describe('permissions — 动态授权存储', () => {
	afterEach(() => vi.restoreAllMocks());

	it('grant / list / revoke 生命周期', async () => {
		const env = { TOKEN: 't', DB: makeFakeDb() } as any;
		expect(await hasGrant(env, CHAT_ID, OUTSIDER_UID, 'lottery')).toBe(false);

		await grantPermission(env, CHAT_ID, OUTSIDER_UID, 'lottery', 1);
		await grantPermission(env, CHAT_ID, OUTSIDER_UID, 'top', 1);
		expect(await hasGrant(env, CHAT_ID, OUTSIDER_UID, 'lottery')).toBe(true);
		expect((await listUserGrants(env, CHAT_ID, OUTSIDER_UID)).sort()).toEqual(['lottery', 'top']);

		await revokePermission(env, CHAT_ID, OUTSIDER_UID, 'lottery');
		expect(await hasGrant(env, CHAT_ID, OUTSIDER_UID, 'lottery')).toBe(false);
		expect(await listUserGrants(env, CHAT_ID, OUTSIDER_UID)).toEqual(['top']);
	});

	it('无 D1 时授权操作为 no-op，查询返回空', async () => {
		const env = { TOKEN: 't' } as any;
		expect(await grantPermission(env, CHAT_ID, OUTSIDER_UID, 'lottery', 1)).toBe(false);
		expect(await hasGrant(env, CHAT_ID, OUTSIDER_UID, 'lottery')).toBe(false);
		expect(await listUserGrants(env, CHAT_ID, OUTSIDER_UID)).toEqual([]);
	});
});
