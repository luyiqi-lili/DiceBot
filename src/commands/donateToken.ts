import type { Env } from '../index';
import { handleTrustedApiKeyDonation, pseudonymousTelegramDonorLabel } from '../lib/apiKeyDonations';
import TgMessage, { type ParsedUpdate } from '../lib/telegram';
import { escapeHtml } from '../lib/util';

const DAILY_DONATION_LIMIT = 5;
const USAGE_POLICIES = new Set(['validation_only', 'shared_inference']);

type DonationResult = {
	id?: string;
	provider?: string;
	platform?: string;
	fingerprint?: string;
	usagePolicy?: string;
	status?: string;
	error?: string;
};

function normalizedArgs(parsed: ParsedUpdate): string[] {
	const args = [...(parsed.args ?? [])];
	// Telegram commands may contain underscores. The shared parser converts
	// /donate_token into command "donate" plus a leading "token" argument.
	if (parsed.command === 'donate' && args[0]?.toLowerCase() === 'token') return args.slice(1);
	return args;
}

function privateChatButton(env: Env) {
	const username = env.BOT_USERNAME?.trim().replace(/^@/, '');
	if (!username || !/^[A-Za-z0-9_]+$/.test(username)) return undefined;
	return { inline_keyboard: [[{ text: '🔐 打开机器人私聊', url: `https://t.me/${username}` }]] };
}

function usageText(): string {
	return `🔐 <b>私聊捐赠 AI Token</b>

只在与机器人单独聊天时发送：
<code>/donatetoken deepseek shared_inference YOUR_TOKEN</code>

也兼容 <code>/donate_token</code>。支持平台：<code>gemini</code>、<code>ollama</code>、<code>deepseek</code>、<code>openai</code>、<code>anthropic</code>、<code>openrouter</code>。

授权范围：
• <code>validation_only</code> — 只允许验证 Token 和模型可用性；
• <code>shared_inference</code> — 明确允许机器人将其用于共享推理。

含 Token 的原消息必须先被机器人删除，之后才会加密入库。请勿在群聊、Issue 或普通表单中发送 Token。`;
}

async function sendText(parsed: ParsedUpdate, env: Env, text: string, replyMarkup?: unknown): Promise<void> {
	await TgMessage.sendText(env, {
		chat_id: parsed.chatId,
		text,
		parse_mode: 'HTML',
		reply_markup: replyMarkup,
		disable_web_page_preview: true,
	});
}

async function deleteSensitiveSource(parsed: ParsedUpdate, env: Env): Promise<boolean> {
	const messageId = parsed.message?.message_id;
	if (!messageId || !parsed.chatId) return false;
	try {
		await TgMessage.deleteMessage(env, parsed.chatId, messageId);
		return true;
	} catch {
		return false;
	}
}

export async function handleDonateToken(parsed: ParsedUpdate, env: Env): Promise<void> {
	const args = normalizedArgs(parsed);
	const isPrivate = parsed.message?.chat?.type === 'private';
	const userId = parsed.from?.id ?? parsed.message?.from?.id;

	// Any arguments may contain a credential. Delete the source before checking,
	// storing, querying D1, or producing a response. Failure is fail-closed.
	if (args.length > 0 && !await deleteSensitiveSource(parsed, env)) {
		await sendText(parsed, env, '⚠️ 无法删除你刚才的消息，因此<b>没有保存任何 Token</b>。请立即手动删除该消息后再试。');
		return;
	}

	if (!isPrivate) {
		await sendText(
			parsed,
			env,
			'🔐 Token 捐赠仅支持与机器人<b>单独聊天</b>。如果刚才的命令含有 Token，机器人已尝试删除原消息；请勿再次在群内发送。',
			privateChatButton(env),
		);
		return;
	}

	if (args.length === 0) {
		await sendText(parsed, env, usageText());
		return;
	}

	if (!userId || args.length !== 3 || !USAGE_POLICIES.has(args[1])) {
		await sendText(parsed, env, `⚠️ 参数格式不正确，原消息已删除且未保存。\n\n${usageText()}`);
		return;
	}

	if (!env.DB || !env.DONATION_ENCRYPTION_KEY || !env.AI_GATEWAY_MANAGEMENT_TOKEN || !env.AI_GATEWAY_ACCOUNT_ID) {
		await sendText(parsed, env, '⚠️ Token 捐赠入口当前未配置，原消息已删除且未保存，请稍后再试。');
		return;
	}

	const [provider, usagePolicy, apiKey] = args;
	const donorLabel = await pseudonymousTelegramDonorLabel(userId, env.DONATION_ENCRYPTION_KEY);
	try {
		const recent = await env.DB.prepare(`
			SELECT COUNT(*) AS count FROM api_key_donations
			WHERE donor_label = ? AND created_at >= datetime('now', '-1 day')
		`).bind(donorLabel).first<{ count: number }>();
		if (Number(recent?.count ?? 0) >= DAILY_DONATION_LIMIT) {
			await sendText(parsed, env, `⏳ 每位用户 24 小时最多捐赠 ${DAILY_DONATION_LIMIT} 个 Token；原消息已删除且未保存，请稍后再试。`);
			return;
		}
	} catch {
		await sendText(parsed, env, '⚠️ 无法检查捐赠频率，原消息已删除且未保存，请稍后再试。');
		return;
	}

	const response = await handleTrustedApiKeyDonation({
		provider,
		apiKey,
		donorLabel,
		usagePolicy: usagePolicy as 'validation_only' | 'shared_inference',
	}, env);
	const result = await response.json<DonationResult>();
	if (!response.ok) {
		const reason = result.error === 'Unsupported provider'
			? '不支持的平台名称'
			: result.error === 'Invalid API key length'
				? 'Token 长度无效'
				: 'Cloudflare AI Gateway 托管暂时不可用';
		await sendText(parsed, env, `⚠️ ${reason}，原消息已删除且未保存。请检查后重试。`);
		return;
	}

	const statusText = result.status === 'duplicate' ? '已存在（未重复保存）' : '已托管到 Cloudflare AI Gateway，待验证';
	await sendText(parsed, env, `✅ <b>Token 已安全接收</b>

平台：<b>${escapeHtml(result.platform ?? result.provider ?? provider)}</b>
授权：<code>${escapeHtml(result.usagePolicy ?? usagePolicy)}</code>
状态：${statusText}
凭证编号：<code>${escapeHtml(result.id ?? 'unknown')}</code>
指纹：<code>${escapeHtml(result.fingerprint ?? 'unknown')}</code>

原消息已删除；回复中不会回显 Token，Worker 与 D1 也不会保存密钥值。密钥由 Cloudflare AI Gateway Provider Keys 托管；共享推理凭证验证通过后进入轮询池。`);
}

export default handleDonateToken;
