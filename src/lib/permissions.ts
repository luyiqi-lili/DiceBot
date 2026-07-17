/**
 * @file src/lib/permissions.ts
 * @description 命令权限判定。权限来源有三层，命中任意一层即通过：
 *   1. 静态 UID 白名单（src/data/admin.ts，全局生效）。
 *   2. 群主（Telegram status === 'creator'）自动拥有全部管理员命令权限。
 *   3. 群主通过 /perm 命令动态授予的、按群组（chat_id）隔离的用户权限（存于 D1）。
 */

import Telegram, { type EnvLike } from './telegram';
import {
	ADMIN_UIDS_CHECK,
	ADMIN_UIDS_TAKE,
	ADMIN_UIDS_CREATE,
	ADMIN_UIDS_REMOVE,
	LOTTERY_ADMIN_UIDS,
	TOP_ADMIN_UIDS,
} from '../data/admin';

/** 需要 D1 的权限存储环境。DB 缺失时动态授权不可用，仅退化为静态白名单 + 群主。 */
export type PermStoreEnv = EnvLike & { DB?: D1Database };

/** 可被动态授予/撤销的权限注册表。key 即 /perm 命令中使用的权限名。 */
export const PERMISSIONS = {
	coin_check: { label: '/coin check 查询余额', staticUids: ADMIN_UIDS_CHECK },
	coin_take: { label: '/coin take 取款', staticUids: ADMIN_UIDS_TAKE },
	coin_create: { label: '/coin create 增发', staticUids: ADMIN_UIDS_CREATE },
	coin_remove: { label: '/coin remove 扣款', staticUids: ADMIN_UIDS_REMOVE },
	lottery: { label: '/lottery 管理', staticUids: LOTTERY_ADMIN_UIDS },
	top: { label: '/top 主题排行', staticUids: TOP_ADMIN_UIDS },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export function isPermissionKey(key: string): key is PermissionKey {
	return Object.prototype.hasOwnProperty.call(PERMISSIONS, key);
}

/** 判断用户是否为该群组的群主（Telegram status === 'creator'）。查询失败时保守返回 false。 */
export async function isChatOwner(env: EnvLike, chatId: number | string, userId: number): Promise<boolean> {
	try {
		const member = await Telegram.checkChatMemberStatus(env, chatId, userId);
		return member?.status === 'creator';
	} catch (e) {
		console.warn('[permissions] isChatOwner 查询失败，默认非群主', e);
		return false;
	}
}

/**
 * 判断用户是否有权执行某管理命令。
 * 命中静态 UID 白名单、拥有动态授权、或为该群群主，任一成立即视为通过。
 */
export async function hasAdminPermission(
	env: PermStoreEnv,
	chatId: number | string,
	userId: number,
	permission: PermissionKey,
): Promise<boolean> {
	const def = PERMISSIONS[permission];
	if (def && def.staticUids.includes(userId)) return true;
	if (await hasGrant(env, chatId, userId, permission)) return true;
	if (await isChatOwner(env, chatId, userId)) return true;
	return false;
}

/* ------------------------- 动态授权存储（D1） ------------------------- */

async function ensurePermissionGrantsTable(env: PermStoreEnv): Promise<boolean> {
	if (!env.DB) return false;
	await env.DB.prepare(`
		CREATE TABLE IF NOT EXISTS permission_grants (
			chat_id INTEGER NOT NULL,
			user_id INTEGER NOT NULL,
			permission TEXT NOT NULL,
			granted_by INTEGER,
			granted_at TEXT NOT NULL DEFAULT (datetime('now')),
			PRIMARY KEY (chat_id, user_id, permission)
		)
	`).run();
	return true;
}

/** 授予某用户某权限（幂等）。返回 false 表示无 D1、未生效。 */
export async function grantPermission(
	env: PermStoreEnv,
	chatId: number | string,
	userId: number,
	permission: PermissionKey,
	grantedBy?: number,
): Promise<boolean> {
	if (!(await ensurePermissionGrantsTable(env))) return false;
	await env.DB!.prepare(`
		INSERT INTO permission_grants (chat_id, user_id, permission, granted_by)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(chat_id, user_id, permission)
		DO UPDATE SET granted_by = excluded.granted_by, granted_at = datetime('now')
	`).bind(Number(chatId), Number(userId), permission, grantedBy ?? null).run();
	return true;
}

/** 撤销某用户某权限（幂等）。返回 false 表示无 D1、未生效。 */
export async function revokePermission(
	env: PermStoreEnv,
	chatId: number | string,
	userId: number,
	permission: PermissionKey,
): Promise<boolean> {
	if (!(await ensurePermissionGrantsTable(env))) return false;
	await env.DB!.prepare(
		`DELETE FROM permission_grants WHERE chat_id = ? AND user_id = ? AND permission = ?`,
	).bind(Number(chatId), Number(userId), permission).run();
	return true;
}

/** 列出某用户在该群被动态授予的权限 key。无 D1 或表不存在时返回空数组。 */
export async function listUserGrants(env: PermStoreEnv, chatId: number | string, userId: number): Promise<string[]> {
	if (!env.DB) return [];
	try {
		const res = await env.DB.prepare(
			`SELECT permission FROM permission_grants WHERE chat_id = ? AND user_id = ? ORDER BY permission`,
		).bind(Number(chatId), Number(userId)).all();
		return ((res.results as any[]) ?? []).map(row => String(row.permission));
	} catch (e) {
		console.warn('[permissions] listUserGrants 失败', e);
		return [];
	}
}

/** 查询某用户是否被动态授予某权限。读路径不建表，表不存在时视为无授权。 */
export async function hasGrant(
	env: PermStoreEnv,
	chatId: number | string,
	userId: number,
	permission: PermissionKey,
): Promise<boolean> {
	if (!env.DB) return false;
	try {
		const row = await env.DB.prepare(
			`SELECT 1 FROM permission_grants WHERE chat_id = ? AND user_id = ? AND permission = ? LIMIT 1`,
		).bind(Number(chatId), Number(userId), permission).first();
		return !!row;
	} catch (e) {
		// 表尚未创建（无人授权过）等情况，视为无授权。
		return false;
	}
}
