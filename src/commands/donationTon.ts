import type { Env } from '../index';
import {
	buildTonTransferLink,
	createTonDonationIntent,
	isValidTonAddress,
	normalizeTonAmount,
} from '../lib/tonDonations';
import TgMessage from '../lib/telegram';
import { escapeHtml } from '../lib/util';

export async function sendTonInstructions(
	chatId: number,
	userId: number,
	amountInput: unknown,
	env: Env,
): Promise<void> {
	const address = env.TON_DONATION_ADDRESS?.trim();
	if (!address || !isValidTonAddress(address)) {
		await TgMessage.sendText(env, {
			chat_id: chatId,
			text: '⚠️ TON 收款地址尚未配置，请先使用 Stars 或捐赠 AI Token。',
		});
		return;
	}
	if (!env.DB) {
		await TgMessage.sendText(env, { chat_id: chatId, text: '⚠️ TON 捐赠账本暂时不可用，请稍后再试。' });
		return;
	}

	const hasAmount = amountInput !== undefined && String(amountInput).trim() !== '';
	const amount = hasAmount ? normalizeTonAmount(amountInput) : null;
	if (hasAmount && !amount) {
		await TgMessage.sendText(env, {
			chat_id: chatId,
			text: '⚠️ TON 数量无效，最多支持 9 位小数，例如：<code>/donate ton 0.5</code>',
			parse_mode: 'HTML',
		});
		return;
	}

	try {
		const intent = await createTonDonationIntent(env.DB, { userId, chatId, amount: amount?.display });
		const link = buildTonTransferLink(address, intent.memo, amount?.nano);
		await TgMessage.sendText(env, {
			chat_id: chatId,
			parse_mode: 'HTML',
			disable_web_page_preview: true,
			text: `💎 <b>TON 捐赠</b>

收款地址：
<code>${escapeHtml(address)}</code>

金额：${amount ? `<b>${escapeHtml(amount.display)} TON</b>` : '由你在钱包中填写'}
备注：<code>${escapeHtml(intent.memo)}</code>

钱包转账链接：
<code>${escapeHtml(link)}</code>

请务必保留备注以便后续链上核对。当前机器人不会持有钱包私钥，也不会自动转出收到的 TON。`,
			reply_markup: {
				inline_keyboard: [[
					{ text: '复制 TON 地址', copy_text: { text: address } },
					{ text: '复制备注', copy_text: { text: intent.memo } },
				]],
			},
		});
	} catch (error) {
		console.error('[donate] create TON intent failed', { message: String(error) });
		await TgMessage.sendText(env, { chat_id: chatId, text: '⚠️ 无法生成 TON 捐赠记录，请稍后再试。' });
	}
}
