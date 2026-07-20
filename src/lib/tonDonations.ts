import { ensureFinancialDonationSchema } from './financialDonations';

export function normalizeTonAmount(value: unknown): { display: string; nano: string } | null {
	const raw = String(value ?? '').trim();
	if (!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,9})?$/.test(raw)) return null;
	const [whole, fraction = ''] = raw.split('.');
	const nano = BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, '0') || '0');
	if (nano <= 0n) return null;
	return {
		display: `${whole}${fraction ? `.${fraction.replace(/0+$/, '')}` : ''}`.replace(/\.$/, ''),
		nano: nano.toString(),
	};
}

export function isValidTonAddress(value: unknown): boolean {
	const address = String(value ?? '').trim();
	return /^(?:[A-Za-z0-9_-]{48}|-?\d+:[0-9a-fA-F]{64})$/.test(address);
}

export async function createTonDonationIntent(
	db: D1Database,
	input: { userId: number; chatId: number; amount?: string },
): Promise<{ id: string; memo: string }> {
	await ensureFinancialDonationSchema(db);
	const id = crypto.randomUUID();
	const memo = `dicebot-${id.slice(0, 8)}`;
	await db.prepare(`
		INSERT INTO financial_donations
		(id, method, status, donor_user_id, source_chat_id, amount, currency, memo)
		VALUES (?, 'ton', 'awaiting_chain', ?, ?, ?, 'TON', ?)
	`).bind(id, String(input.userId), String(input.chatId), input.amount ?? null, memo).run();
	return { id, memo };
}

export function buildTonTransferLink(address: string, memo: string, nano?: string): string {
	const params = new URLSearchParams();
	if (nano) params.set('amount', nano);
	params.set('text', memo);
	return `ton://transfer/${address}?${params.toString()}`;
}
