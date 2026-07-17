/**
 * @file commands/perm.ts
 * @description /perm 命令 — 群主管理某用户的动态权限（按群组隔离）。
 *   用法（需群主执行）：
 *     回复目标用户消息后：
 *       /perm grant  <权限名|all>   授予权限
 *       /perm revoke <权限名|all>   移除权限
 *       /perm list                  查看该用户已被授予的权限
 *     无需回复：
 *       /perm keys                  列出全部可用权限名
 *       /perm help                  查看用法
 *   目标用户默认取被回复消息的发送者，也可用命令末尾附带的数字用户 ID 指定。
 */

import TgMessage, { ParsedUpdate } from '../lib/telegram';
import type { Env } from '../index';
import { escapeHtml } from '../lib/util';
import {
	PERMISSIONS,
	PERMISSION_KEYS,
	isPermissionKey,
	isChatOwner,
	grantPermission,
	revokePermission,
	listUserGrants,
	type PermissionKey,
} from '../lib/permissions';

function keysText(): string {
	const lines = PERMISSION_KEYS.map(k => `• <code>${k}</code> — ${PERMISSIONS[k].label}`);
	return `🔑 可用权限名：\n${lines.join('\n')}\n• <code>all</code> — 上述全部权限`;
}

function usageText(): string {
	return [
		'📖 <b>/perm 权限管理</b>（仅群主）',
		'',
		'回复目标用户的一条消息后：',
		'• <code>/perm grant &lt;权限名|all&gt;</code> — 授予权限',
		'• <code>/perm revoke &lt;权限名|all&gt;</code> — 移除权限',
		'• <code>/perm list</code> — 查看该用户已被授予的权限',
		'',
		'无需回复：',
		'• <code>/perm keys</code> — 列出全部可用权限名',
		'',
		keysText(),
	].join('\n');
}

async function resolveName(env: Env, chatId: number, uid: number): Promise<string> {
	try {
		const member = await TgMessage.fetchChatMember(env, chatId, uid);
		return String(member.first_name || member.username || uid);
	} catch {
		return String(uid);
	}
}

export async function handlePerm(parsedMessage: ParsedUpdate, env: Env): Promise<void> {
	const chatId = parsedMessage.chatId ?? parsedMessage.message?.chat?.id;
	const threadId =
		parsedMessage.threadId ??
		parsedMessage.message?.message_thread_id ??
		parsedMessage.message?.reply_to_message?.message_thread_id ??
		undefined;
	const from = parsedMessage.from ?? parsedMessage.message?.from;
	if (!chatId || !from) {
		console.error('[perm] 找不到 chatId 或 from，跳过');
		return;
	}

	const args = Array.isArray(parsedMessage.args) ? parsedMessage.args.slice() : [];
	const action = (args[0] || '').toLowerCase();

	const reply = (text: string) =>
		TgMessage.sendText(env, { chat_id: chatId, text, parse_mode: 'HTML', message_thread_id: threadId });

	// 开放给所有人的只读子命令
	if (!action || action === 'help') {
		await reply(usageText());
		return;
	}
	if (action === 'keys') {
		await reply(keysText());
		return;
	}

	if (action !== 'grant' && action !== 'revoke' && action !== 'list') {
		await reply(`❓ 未知子命令：<code>${escapeHtml(action)}</code>\n\n${usageText()}`);
		return;
	}

	// grant / revoke / list 仅群主可用
	if (!(await isChatOwner(env, chatId, Number(from.id)))) {
		await reply('❌ 只有群主可以管理权限。');
		return;
	}

	if (!env.DB) {
		await reply('⚠️ 动态权限需要 D1 数据库支持，当前环境未配置。');
		return;
	}

	// 解析目标用户：优先被回复消息的发送者，其次命令中出现的数字用户 ID
	const repliedFrom = parsedMessage.message?.reply_to_message?.from;
	let targetId: number | null = null;
	if (repliedFrom?.id) {
		targetId = Number(repliedFrom.id);
	} else {
		const numericArg = args.slice(1).find(a => /^\d+$/.test(a));
		if (numericArg) targetId = Number(numericArg);
	}
	if (!targetId) {
		await reply('❌ 请回复目标用户的一条消息，或在命令后附上其数字用户 ID。');
		return;
	}
	if (repliedFrom?.is_bot) {
		await reply('❌ 不能给机器人授予权限。');
		return;
	}

	const targetName = await resolveName(env, chatId, targetId);

	if (action === 'list') {
		const grants = await listUserGrants(env, chatId, targetId);
		if (!grants.length) {
			await reply(`ℹ️ ${targetName} 暂无被授予的动态权限。`);
			return;
		}
		const lines = grants.map(k => `• <code>${escapeHtml(k)}</code> — ${PERMISSIONS[k as PermissionKey]?.label ?? k}`);
		await reply(`📋 ${targetName} 的动态权限：\n${lines.join('\n')}`);
		return;
	}

	// grant / revoke 需要权限名
	const keyArg = (args[1] || '').toLowerCase();
	if (!keyArg) {
		await reply(`❌ 请指定权限名。\n\n${keysText()}`);
		return;
	}

	const keys: PermissionKey[] = keyArg === 'all' ? [...PERMISSION_KEYS] : isPermissionKey(keyArg) ? [keyArg] : [];
	if (!keys.length) {
		await reply(`❌ 未知权限名：<code>${escapeHtml(keyArg)}</code>\n\n${keysText()}`);
		return;
	}

	for (const key of keys) {
		if (action === 'grant') {
			await grantPermission(env, chatId, targetId, key, Number(from.id));
		} else {
			await revokePermission(env, chatId, targetId, key);
		}
	}

	const verb = action === 'grant' ? '授予' : '移除';
	const permLabel =
		keyArg === 'all' ? '全部权限' : `<code>${escapeHtml(keyArg)}</code>（${PERMISSIONS[keys[0]].label}）`;
	await reply(`✅ 已${verb} ${targetName} 的 ${permLabel}。`);
}
