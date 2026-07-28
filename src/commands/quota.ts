import type { Env } from '../index';
import { inspectPersonalApiQuotas } from '../lib/personalApiQuota';
import TgMessage, { type ParsedUpdate } from '../lib/telegram';
import { escapeHtml } from '../lib/util';

function amount(value: number): string {
	return Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: 6 }) : '—';
}

function renderStatus(item: Awaited<ReturnType<typeof inspectPersonalApiQuotas>>[number]): string {
	const icon = item.status === 'available' ? '✅' : item.status === 'rate_limited' ? '🟡' : item.status === 'disabled' ? '⚪' : '❌';
	const lines = [`${icon} <b>${escapeHtml(item.displayName)}</b> <code>${escapeHtml(item.fingerprint)}</code>`, escapeHtml(item.detail)];
	for (const balance of item.balances ?? []) lines.push(`余额：<code>${escapeHtml(balance.currency)} ${amount(balance.remaining)}</code>（充值 ${amount(balance.toppedUp ?? 0)}，赠送 ${amount(balance.granted ?? 0)}）`);
	if (item.credits) lines.push(`额度：<code>总 ${amount(item.credits.total)} / 已用 ${amount(item.credits.used)} / 剩余 ${amount(item.credits.remaining)}</code>`);
	if (item.models?.length) lines.push(`模型示例：<code>${escapeHtml(item.models.slice(0, 4).join(', '))}</code>`);
	if (item.lastCheckedAt) lines.push(`上次定时验证：<code>${escapeHtml(item.lastCheckedAt)}</code>`);
	return lines.join('\n');
}

export async function handleQuota(parsed: ParsedUpdate, env: Env): Promise<void> {
	const chatId = parsed.chatId ?? parsed.message?.chat?.id;
	const isPrivate = parsed.message?.chat?.type === 'private';
	const userId = parsed.from?.id ?? parsed.message?.from?.id;
	if (!chatId) return;
	if (!isPrivate) {
		await TgMessage.sendText(env, { chat_id: chatId, text: '🔐 <code>/quota</code> 只支持与机器人单独聊天，避免在群里暴露你的凭据状态。', parse_mode: 'HTML', message_thread_id: parsed.threadId });
		return;
	}
	if (!userId || !env.DB || !env.DONATION_ENCRYPTION_KEY) {
		await TgMessage.sendText(env, { chat_id: chatId, text: '⚠️ 额度查询当前未配置。', message_thread_id: parsed.threadId });
		return;
	}
	const statuses = await inspectPersonalApiQuotas(env, userId);
	const text = statuses.length
		? `🔍 <b>你的 API 额度与可用性</b>\n\n${statuses.map(renderStatus).join('\n\n')}`
		: 'ℹ️ 未找到你通过私聊捐赠的 API 凭据。可使用 <code>/donatetoken 平台 授权范围 TOKEN</code> 添加。';
	await TgMessage.sendText(env, { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, message_thread_id: parsed.threadId });
}

export default handleQuota;
