import type { Env } from '../index';
import TgMessage, { type ParsedUpdate } from '../lib/telegram';

export async function handlePaySupport(parsed: ParsedUpdate, env: Env): Promise<void> {
	await TgMessage.sendText(env, {
		chat_id: parsed.chatId,
		parse_mode: 'HTML',
		text: `🧾 <b>支付支持</b>

请在机器人私聊中发送 <code>/paysupport Telegram支付编号 问题描述</code>。支付编号只用于核对和退款支持，请勿发送银行卡、钱包私钥或交易所密码。`,
	});
}

export async function handleDonationTerms(parsed: ParsedUpdate, env: Env): Promise<void> {
	await TgMessage.sendText(env, {
		chat_id: parsed.chatId,
		parse_mode: 'HTML',
		text: `📜 <b>捐赠说明</b>

捐赠完全自愿，不购买任何数字商品、投资收益或自动升级承诺。Stars 付款成功后记录 Telegram 支付编号；TON 在链上核对前仅记录捐赠意向。退款与支付问题请使用 <code>/paysupport</code>。`,
	});
}
