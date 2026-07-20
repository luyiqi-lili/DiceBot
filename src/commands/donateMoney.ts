import type { Env } from '../index';
import { MAX_STAR_DONATION, STAR_DONATION_AMOUNTS } from '../lib/financialDonations';
import TgMessage, { type ParsedUpdate } from '../lib/telegram';
import { handleDonateToken } from './donateToken';
import { sendStarsInvoice } from './donationStars';
import { sendTonInstructions } from './donationTon';

type DonationCallback = { type: 'donation'; action: 'stars' | 'ton'; amount?: number };

function privateChatButton(env: Env) {
	const username = env.BOT_USERNAME?.trim().replace(/^@/, '');
	if (!username || !/^[A-Za-z0-9_]+$/.test(username)) return undefined;
	return { inline_keyboard: [[{ text: '💝 打开机器人私聊', url: `https://t.me/${username}` }]] };
}

function donationMenu() {
	return {
		inline_keyboard: [
			STAR_DONATION_AMOUNTS.map((amount) => ({
				text: `⭐ ${amount}`,
				callback_data: JSON.stringify({ type: 'donation', action: 'stars', amount }),
			})),
			[{ text: '💎 使用 TON 捐赠', callback_data: JSON.stringify({ type: 'donation', action: 'ton' }) }],
		],
	};
}

async function sendMenu(chatId: number, env: Env): Promise<void> {
	await TgMessage.sendText(env, {
		chat_id: chatId,
		parse_mode: 'HTML',
		text: `💝 <b>支持 DiceBot 持续运行</b>

选择 Telegram Stars 数量，或使用 TON 钱包捐赠。Stars 付款成功后自动记账；TON 会生成专属备注，链上确认上线前保持“待核对”。

自定义 Stars：<code>/donate stars 25</code>（1–${MAX_STAR_DONATION}）
指定 TON：<code>/donate ton 0.5</code>
AI Token：<code>/donatetoken 平台 授权范围 TOKEN</code>`,
		reply_markup: donationMenu(),
	});
}

export async function handleDonate(parsed: ParsedUpdate, env: Env): Promise<void> {
	const args = [...(parsed.args ?? [])];
	if (args[0]?.toLowerCase() === 'token') return handleDonateToken(parsed, env);
	if (parsed.message?.chat?.type !== 'private') {
		await TgMessage.sendText(env, {
			chat_id: parsed.chatId,
			text: '💝 金额捐赠请在与机器人单独聊天中完成。',
			reply_markup: privateChatButton(env),
		});
		return;
	}
	const chatId = parsed.chatId;
	const userId = parsed.from?.id ?? parsed.message?.from?.id;
	if (!chatId || !userId) return;
	const action = args[0]?.toLowerCase();
	if (!action) return sendMenu(chatId, env);
	if (action === 'stars' || action === 'star') return sendStarsInvoice(chatId, userId, args[1], env);
	if (action === 'ton') return sendTonInstructions(chatId, userId, args[1], env);
	await sendMenu(chatId, env);
}

export async function handleDonationCallback(cq: any, data: DonationCallback, env: Env): Promise<void> {
	const chatId = cq.message?.chat?.id;
	const userId = cq.from?.id;
	if (!chatId || !userId || cq.message?.chat?.type !== 'private') {
		await TgMessage.answerCallbackQuery(env, cq.id, { text: '请在机器人私聊中捐赠。', show_alert: true });
		return;
	}
	await TgMessage.answerCallbackQuery(env, cq.id, {
		text: data.action === 'stars' ? '正在生成 Stars 发票…' : '正在生成 TON 捐赠信息…',
	});
	if (data.action === 'stars') return sendStarsInvoice(chatId, userId, data.amount, env);
	return sendTonInstructions(chatId, userId, undefined, env);
}
