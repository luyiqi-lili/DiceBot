import type { Env } from '../index';
import TgMessage, { ParsedUpdate } from '../lib/tgMessage';
import { approveWishSummaryItems, createWish, isMeaningfulWish, WISH_ADMIN_UID } from '../lib/wishCore';
import { escapeHtml } from '../lib/util';

function wishTextFromArgs(args: string[] | undefined): string {
	return (args ?? []).join(' ').trim();
}

function parseApprovedItemNumbers(text: string | undefined): number[] {
	const raw = String(text ?? '').trim();
	if (!raw) return [];
	const normalized = raw.replace(/^做\s*/, '').replace(/[，,]/g, ' ');
	const nums = normalized
		.split(/\s+/)
		.map(part => Number(part))
		.filter(num => Number.isInteger(num) && num > 0);
	return Array.from(new Set(nums));
}

export async function handleWish(parsedMessage: ParsedUpdate, env: Env) {
	const chatId = parsedMessage.chatId ?? parsedMessage.message?.chat?.id;
	const threadId = parsedMessage.threadId;
	const from = parsedMessage.from ?? parsedMessage.message?.from;
	if (!chatId || !from) return;

	if (!env.DB) {
		await TgMessage.sendText(env, {
			chat_id: chatId,
			text: '⚠️ wish 系统需要 D1 数据库支持，当前环境未配置。',
			parse_mode: 'HTML',
			message_thread_id: threadId,
		});
		return;
	}

	const body = wishTextFromArgs(parsedMessage.args);
	if (!isMeaningfulWish(body)) {
		await TgMessage.sendText(env, {
			chat_id: chatId,
			text: '愿望太模糊啦，请说具体一点，比如：<code>/wish 增加每日签到奖励</code>',
			parse_mode: 'HTML',
			message_thread_id: threadId,
		});
		return;
	}

	const wish = await createWish(env.DB, {
		chatId,
		threadId,
		userId: from.id,
		firstName: from.first_name ?? '',
		body,
	});

	await TgMessage.sendText(env, {
		chat_id: chatId,
		text: `收到愿望 <b>#${wish.id}</b>：${escapeHtml(body)}\n我会把它放进下一次愿望汇总里。`,
		parse_mode: 'HTML',
		message_thread_id: threadId,
	});
}

export async function handleWishApproval(parsedMessage: ParsedUpdate, env: Env): Promise<boolean> {
	const from = parsedMessage.from ?? parsedMessage.message?.from;
	if (Number(from?.id) !== WISH_ADMIN_UID) return false;
	if (!parsedMessage.replyToMessage?.message_id) return false;
	if (!env.DB) return false;

	const itemNumbers = parseApprovedItemNumbers(parsedMessage.text ?? parsedMessage.message?.text);
	if (!itemNumbers.length) return false;

	const approved = await approveWishSummaryItems(env.DB, {
		messageId: Number(parsedMessage.replyToMessage.message_id),
		chatId: parsedMessage.chatId ?? parsedMessage.message?.chat?.id,
		threadId: parsedMessage.threadId ?? null,
		itemNumbers,
		approvedBy: WISH_ADMIN_UID,
	});
	if (!approved.length) return false;

	const chatId = parsedMessage.chatId ?? parsedMessage.message?.chat?.id;
	if (chatId) {
		const titles = approved.map(task => `#${task.item_number} ${escapeHtml(task.title)}`).join('\n');
		await TgMessage.sendText(env, {
			chat_id: chatId,
			text: `莉莉收下啦，已批准这些愿望：\n<blockquote>${titles}</blockquote>\n下一轮我会掷骰开工。`,
			parse_mode: 'HTML',
			message_thread_id: parsedMessage.threadId,
		});
	}
	return true;
}

export default handleWish;
