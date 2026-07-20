import type { Env } from '../index';
import TgMessage from './telegram';
import { recordSuccessfulStarsPayment, validateStarsPreCheckout } from './financialDonations';

export async function handlePreCheckoutUpdate(botCtx: any, env: Env): Promise<boolean> {
	const query = botCtx.preCheckoutQuery ?? botCtx.update?.pre_checkout_query;
	if (!query) return false;
	const result = await validateStarsPreCheckout(query, env);
	await botCtx.api.answerPreCheckoutQuery(
		query.id,
		result.ok,
		result.ok ? undefined : { error_message: result.error ?? '捐赠发票校验失败，请重新生成。' },
	);
	return true;
}

export async function handleSuccessfulPaymentUpdate(botCtx: any, env: Env): Promise<boolean> {
	const message = botCtx.message;
	if (!message?.successful_payment) return false;
	const result = await recordSuccessfulStarsPayment(message, env);
	if (result.status === 'saved') {
		await TgMessage.sendText(env, {
			chat_id: message.chat.id,
			parse_mode: 'HTML',
			text: `✅ <b>感谢支持 DiceBot！</b>\n\n已收到 <b>${result.amount} Telegram Stars</b>，并安全记入捐赠账本。\n记录编号：<code>${result.id}</code>`,
		});
	} else if (result.status === 'rejected') {
		console.error('[financial-donations] rejected successful payment', { reason: result.reason });
	}
	return true;
}
