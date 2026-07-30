import type { Env } from '../index';
import { normalizeProvider, providerById } from '../lib/aiProviderRegistry';
import { pseudonymousTelegramDonorLabel } from '../lib/apiKeyDonations';
import { deleteGatewayCredential } from '../lib/cloudflareAiGateway';
import TgMessage, { type ParsedUpdate } from '../lib/telegram';
import { escapeHtml } from '../lib/util';

type OwnedDonation = {
	id: string;
	provider: string;
	status: string;
	usage_policy: string | null;
	health_status: string | null;
	gateway_secret_id: string | null;
	gateway_store_id: string | null;
};

function normalizedArgs(parsed: ParsedUpdate): string[] {
	const args = [...(parsed.args ?? [])];
	if (parsed.command === 'revoke' && args[0]?.toLowerCase() === 'token') return args.slice(1);
	return args;
}

async function reply(parsed: ParsedUpdate, env: Env, text: string): Promise<void> {
	await TgMessage.sendText(env, {
		chat_id: parsed.chatId,
		text,
		parse_mode: 'HTML',
		disable_web_page_preview: true,
	});
}

function providerName(provider: string): string {
	return providerById(provider)?.displayName ?? '其他提供方';
}

function donationList(rows: OwnedDonation[]): string {
	if (!rows.length) return '你目前没有可撤销的 Token 捐赠。';
	return [
		'🔐 <b>你的可撤销 Token 捐赠</b>',
		'',
		...rows.map((row) => [
			`• <b>${escapeHtml(providerName(row.provider))}</b>`,
			`  编号：<code>${escapeHtml(row.id)}</code>`,
			`  状态：<code>${escapeHtml(row.status)}</code>｜授权：<code>${escapeHtml(row.usage_policy ?? 'unknown')}</code>｜健康：<code>${escapeHtml(row.health_status ?? 'unchecked')}</code>`,
		].join('\n')),
		'',
		'撤销单个：<code>/revoketoken 凭证编号</code>',
		'撤销某平台全部：<code>/revoketoken google</code>',
		'撤销全部：<code>/revoketoken all</code>',
		'命令会先显示警告，必须再次加 <code>confirm</code> 才会执行。',
	].join('\n');
}

function selectDonations(rows: OwnedDonation[], target: string): {
	rows: OwnedDonation[];
	kind: 'all' | 'provider' | 'id';
	value?: string;
} | null {
	if (target.toLowerCase() === 'all') return { rows, kind: 'all' };
	const provider = normalizeProvider(target);
	if (provider) {
		return {
			rows: rows.filter((row) => row.provider === provider.id),
			kind: 'provider',
			value: provider.id,
		};
	}
	if (!/^[A-Za-z0-9-]{8,80}$/.test(target)) return null;
	return {
		rows: rows.filter((row) => row.id === target),
		kind: 'id',
		value: target,
	};
}

function mutationFilter(selection: Exclude<ReturnType<typeof selectDonations>, null>): {
	sql: string;
	values: string[];
} {
	if (selection.kind === 'provider') return { sql: ' AND provider = ?', values: [selection.value!] };
	if (selection.kind === 'id') return { sql: ' AND id = ?', values: [selection.value!] };
	return { sql: '', values: [] };
}

export async function handleRevokeToken(parsed: ParsedUpdate, env: Env): Promise<void> {
	const chatId = parsed.chatId ?? parsed.message?.chat?.id;
	if (!chatId) return;
	const isPrivate = parsed.message?.chat?.type === 'private';
	const userId = parsed.from?.id ?? parsed.message?.from?.id;
	if (!isPrivate) {
		await reply(parsed, env, '🔐 Token 查询与撤销仅支持和机器人<b>单独聊天</b>，避免公开你的捐赠记录。');
		return;
	}
	if (!userId || !env.DB || !env.DONATION_ENCRYPTION_KEY) {
		await reply(parsed, env, '⚠️ Token 撤销服务当前不可用，请稍后再试。');
		return;
	}

	const donorLabel = await pseudonymousTelegramDonorLabel(userId, env.DONATION_ENCRYPTION_KEY);
	let rows: OwnedDonation[];
	try {
		const result = await env.DB.prepare(`
			SELECT d.id, d.provider, d.status, d.gateway_secret_id, d.gateway_store_id,
				p.usage_policy, p.health_status
			FROM api_key_donations d
			LEFT JOIN api_credential_profiles p ON p.donation_id = d.id
			WHERE d.donor_label = ? AND d.status <> 'revoked'
			ORDER BY d.created_at ASC
			LIMIT 100
		`).bind(donorLabel).all<OwnedDonation>();
		rows = result.results ?? [];
	} catch {
		await reply(parsed, env, '⚠️ 无法读取你的捐赠记录，请稍后再试。');
		return;
	}

	const args = normalizedArgs(parsed);
	if (!args.length) {
		await reply(parsed, env, donationList(rows));
		return;
	}
	if (args.length > 2 || (args.length === 2 && args[1].toLowerCase() !== 'confirm')) {
		await reply(parsed, env, '⚠️ 格式不正确。请使用 <code>/revoketoken</code> 查看可撤销项目。');
		return;
	}

	const selection = selectDonations(rows, args[0]);
	if (!selection) {
		await reply(parsed, env, '⚠️ 平台名称或凭证编号无效。请使用 <code>/revoketoken</code> 查看可撤销项目。');
		return;
	}
	if (!selection.rows.length) {
		await reply(parsed, env, '没有找到属于你的匹配捐赠，未做任何修改。');
		return;
	}
	if (args.length === 1) {
		await reply(parsed, env, `⚠️ <b>撤销后不可恢复</b>

将撤销 ${selection.rows.length} 个 Token，永久清空加密密文，并立即停止验证和共享推理。

确认执行请发送：
<code>/revoketoken ${escapeHtml(args[0])} confirm</code>`);
		return;
	}

	const filter = mutationFilter(selection);
	try {
		for (const row of selection.rows) {
			if (row.gateway_secret_id && row.gateway_store_id) {
				await deleteGatewayCredential(env, {
					secretId: row.gateway_secret_id,
					storeId: row.gateway_store_id,
				});
			}
		}
		const donationUpdate = env.DB.prepare(`
			UPDATE api_key_donations
			SET status = 'revoked', encrypted_key = '', encryption_iv = '',
				validation_error = 'revoked_by_donor', updated_at = datetime('now')
			WHERE donor_label = ? AND status <> 'revoked'${filter.sql}
		`).bind(donorLabel, ...filter.values);
		const profileUpdate = env.DB.prepare(`
			UPDATE api_credential_profiles
			SET health_status = 'revoked', available_models_json = '[]',
				last_error_code = 'revoked_by_donor', updated_at = datetime('now')
			WHERE donation_id IN (
				SELECT id FROM api_key_donations
				WHERE donor_label = ? AND status = 'revoked'${filter.sql}
			)
		`).bind(donorLabel, ...filter.values);
		const result = await env.DB.batch([donationUpdate, profileUpdate]);
		const revoked = Number(result[0]?.meta?.changes ?? 0);
		if (!revoked) {
			await reply(parsed, env, '没有找到仍可撤销的匹配捐赠，未做任何修改。');
			return;
		}
		await reply(parsed, env, `✅ 已撤销 ${revoked} 个 Token 捐赠。加密密文已永久清空，该凭据不会再用于验证或共享推理。`);
	} catch {
		await reply(parsed, env, '⚠️ 撤销失败，未确认完成任何修改。请稍后重新查询状态。');
	}
}

export default handleRevokeToken;
