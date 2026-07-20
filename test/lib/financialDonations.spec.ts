import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import {
	createStarsDonationIntent,
	normalizeStarAmount,
	recordSuccessfulStarsPayment,
	validateStarsPreCheckout,
} from '../../src/lib/financialDonations';
import { buildTonTransferLink, normalizeTonAmount } from '../../src/lib/tonDonations';

describe('financial donations', () => {
	it('validates a Stars invoice and records the successful payment idempotently', async () => {
		const userId = 7000001;
		const chatId = 7000001;
		const intent = await createStarsDonationIntent(env.DB, { userId, chatId, amount: 50 });
		const query = {
			id: 'pre-checkout-1', from: { id: userId }, currency: 'XTR', total_amount: 50,
			invoice_payload: intent.payload,
		};

		expect(await validateStarsPreCheckout(query, { DB: env.DB })).toEqual({ ok: true });
		const message = {
			chat: { id: chatId }, from: { id: userId },
			successful_payment: {
				currency: 'XTR', total_amount: 50, invoice_payload: intent.payload,
				telegram_payment_charge_id: 'tg-charge-financial-test-1', provider_payment_charge_id: '',
			},
		};
		expect(await recordSuccessfulStarsPayment(message, { DB: env.DB })).toMatchObject({
			status: 'saved', amount: 50, id: intent.id,
		});
		expect(await recordSuccessfulStarsPayment(message, { DB: env.DB })).toMatchObject({
			status: 'duplicate', amount: 50, id: intent.id,
		});

		const row = await env.DB.prepare(`
			SELECT status, telegram_payment_charge_id FROM financial_donations WHERE id = ?
		`).bind(intent.id).first<any>();
		expect(row).toMatchObject({ status: 'paid', telegram_payment_charge_id: 'tg-charge-financial-test-1' });
	});

	it('rejects a mismatched payer or amount before checkout', async () => {
		const intent = await createStarsDonationIntent(env.DB, { userId: 7000002, chatId: 7000002, amount: 10 });
		const result = await validateStarsPreCheckout({
			id: 'pre-checkout-2', from: { id: 999 }, currency: 'XTR', total_amount: 100,
			invoice_payload: intent.payload,
		}, { DB: env.DB });
		expect(result.ok).toBe(false);
	});

	it('normalizes Stars and TON amounts and builds a memo transfer link', () => {
		expect(normalizeStarAmount('25')).toBe(25);
		expect(normalizeStarAmount('1.5')).toBeNull();
		expect(normalizeTonAmount('0.500000000')).toEqual({ display: '0.5', nano: '500000000' });
		expect(normalizeTonAmount('0')).toBeNull();
		expect(buildTonTransferLink('UQ0123456789012345678901234567890123456789012345', 'dicebot-12345678', '500000000'))
			.toContain('amount=500000000&text=dicebot-12345678');
	});
});
