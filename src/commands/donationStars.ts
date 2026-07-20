import type { Env } from '../index';
import {
	createStarsDonationIntent,
	markFinancialDonationFailed,
	MAX_STAR_DONATION,
	normalizeStarAmount,
} from '../lib/financialDonations';
import TgMessage, { callTelegramApi } from '../lib/telegram';

export async function sendStarsInvoice(
	chatId: number,
	userId: number,
	amountInput: unknown,
	env: Env,
): Promise<void> {
	const amount = normalizeStarAmount(amountInput);
	if (amount === null) {
		await TgMessage.sendText(env, {
			chat_id: chatId,
			text: `⚠️ Stars 数量必须是 1–${MAX_STAR_DONATION} 的整数。`,
		});
		return;
	}
	if (!env.DB) {
		await TgMessage.sendText(env, { chat_id: chatId, text: '⚠️ Stars 捐赠账本暂时不可用，请稍后再试。' });
		return;
	}

	let intent: { id: string; payload: string };
	try {
		intent = await createStarsDonationIntent(env.DB, { userId, chatId, amount });
	} catch (error) {
		console.error('[donate] create Stars intent failed', { message: String(error) });
		await TgMessage.sendText(env, { chat_id: chatId, text: '⚠️ 无法创建 Stars 捐赠记录，请稍后再试。' });
		return;
	}

	const response = await callTelegramApi(env, 'sendInvoice', {
		chat_id: chatId,
		title: '支持 DiceBot',
		description: `自愿捐赠 ${amount} Telegram Stars，支持机器人持续运行与改进。`,
		payload: intent.payload,
		provider_token: '',
		currency: 'XTR',
		prices: [{ label: 'DiceBot 捐赠', amount }],
	});
	if (!response.ok) {
		await markFinancialDonationFailed(env.DB, intent.id).catch(() => undefined);
		await TgMessage.sendText(env, { chat_id: chatId, text: '⚠️ Telegram 暂时无法创建 Stars 发票，请稍后再试。' });
	}
}
