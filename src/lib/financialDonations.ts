import type { Env } from '../index';

export const STAR_DONATION_AMOUNTS = [10, 50, 100, 500] as const;
export const MAX_STAR_DONATION = 10_000;

const STAR_PAYLOAD_PREFIX = 'dicebot-stars:v1';

export type FinancialDonationStatus = 'pending' | 'awaiting_chain' | 'paid' | 'failed' | 'cancelled';

type DonationIntent = {
	id: string;
	method: 'stars' | 'ton';
	status: FinancialDonationStatus;
	donor_user_id: string;
	source_chat_id: string;
	amount: string | null;
	currency: string;
	invoice_payload: string | null;
	telegram_payment_charge_id: string | null;
};

export type StarsPreCheckoutQuery = {
	id: string;
	from?: { id?: number };
	currency?: string;
	total_amount?: number;
	invoice_payload?: string;
};

export type StarsPaymentMessage = {
	chat?: { id?: number };
	from?: { id?: number };
	successful_payment?: {
		currency?: string;
		total_amount?: number;
		invoice_payload?: string;
		telegram_payment_charge_id?: string;
		provider_payment_charge_id?: string;
	};
};

export async function ensureFinancialDonationSchema(db: D1Database): Promise<void> {
	await db.prepare(`
		CREATE TABLE IF NOT EXISTS financial_donations (
			id TEXT PRIMARY KEY,
			method TEXT NOT NULL CHECK (method IN ('stars', 'ton')),
			status TEXT NOT NULL CHECK (status IN ('pending', 'awaiting_chain', 'paid', 'failed', 'cancelled')),
			donor_user_id TEXT NOT NULL,
			source_chat_id TEXT NOT NULL,
			amount TEXT,
			currency TEXT NOT NULL,
			memo TEXT,
			invoice_payload TEXT,
			telegram_payment_charge_id TEXT UNIQUE,
			provider_payment_charge_id TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at TEXT NOT NULL DEFAULT (datetime('now')),
			paid_at TEXT
		)
	`).run();
	await db.prepare(`
		CREATE INDEX IF NOT EXISTS idx_financial_donations_donor_created
		ON financial_donations (donor_user_id, created_at)
	`).run();
	await db.prepare(`
		CREATE INDEX IF NOT EXISTS idx_financial_donations_method_status
		ON financial_donations (method, status, created_at)
	`).run();
}

export function normalizeStarAmount(value: unknown): number | null {
	const amount = typeof value === 'number' ? value : Number(String(value ?? '').trim());
	if (!Number.isSafeInteger(amount) || amount < 1 || amount > MAX_STAR_DONATION) return null;
	return amount;
}

function starPayload(id: string, userId: number, amount: number): string {
	return `${STAR_PAYLOAD_PREFIX}:${id}:${userId}:${amount}`;
}

function parseStarPayload(payload: unknown): { id: string; userId: number; amount: number } | null {
	if (typeof payload !== 'string') return null;
	const match = payload.match(/^dicebot-stars:v1:([0-9a-f-]{36}):(\d{1,20}):(\d{1,5})$/i);
	if (!match) return null;
	const userId = Number(match[2]);
	const amount = normalizeStarAmount(match[3]);
	if (!Number.isSafeInteger(userId) || userId <= 0 || amount === null) return null;
	return { id: match[1], userId, amount };
}

export async function createStarsDonationIntent(
	db: D1Database,
	input: { userId: number; chatId: number; amount: number },
): Promise<{ id: string; payload: string }> {
	const amount = normalizeStarAmount(input.amount);
	if (amount === null) throw new Error('Invalid Stars amount');
	await ensureFinancialDonationSchema(db);
	const id = crypto.randomUUID();
	const payload = starPayload(id, input.userId, amount);
	await db.prepare(`
		INSERT INTO financial_donations
		(id, method, status, donor_user_id, source_chat_id, amount, currency, invoice_payload)
		VALUES (?, 'stars', 'pending', ?, ?, ?, 'XTR', ?)
	`).bind(id, String(input.userId), String(input.chatId), String(amount), payload).run();
	return { id, payload };
}

export async function markFinancialDonationFailed(db: D1Database, id: string): Promise<void> {
	await db.prepare(`
		UPDATE financial_donations SET status = 'failed', updated_at = datetime('now')
		WHERE id = ? AND status = 'pending'
	`).bind(id).run();
}

async function readIntent(db: D1Database, id: string): Promise<DonationIntent | null> {
	return await db.prepare(`
		SELECT id, method, status, donor_user_id, source_chat_id, amount, currency,
		       invoice_payload, telegram_payment_charge_id
		FROM financial_donations WHERE id = ? LIMIT 1
	`).bind(id).first<DonationIntent>();
}

function intentMatchesStars(
	intent: DonationIntent | null,
	parsed: { id: string; userId: number; amount: number },
	payload: string,
): intent is DonationIntent {
	return Boolean(
		intent
		&& intent.method === 'stars'
		&& intent.donor_user_id === String(parsed.userId)
		&& intent.amount === String(parsed.amount)
		&& intent.currency === 'XTR'
		&& intent.invoice_payload === payload,
	);
}

export async function validateStarsPreCheckout(
	query: StarsPreCheckoutQuery,
	env: Pick<Env, 'DB'>,
): Promise<{ ok: boolean; error?: string }> {
	if (!env.DB) return { ok: false, error: '捐赠账本暂时不可用，请稍后重试。' };
	const parsed = parseStarPayload(query.invoice_payload);
	if (
		!parsed
		|| query.currency !== 'XTR'
		|| query.total_amount !== parsed.amount
		|| query.from?.id !== parsed.userId
	) return { ok: false, error: '捐赠发票校验失败，请重新生成发票。' };

	try {
		await ensureFinancialDonationSchema(env.DB);
		const intent = await readIntent(env.DB, parsed.id);
		if (!intentMatchesStars(intent, parsed, query.invoice_payload!)) {
			return { ok: false, error: '捐赠记录不存在或金额不一致，请重新生成。' };
		}
		if (intent.status !== 'pending') return { ok: false, error: '这张捐赠发票已处理，请重新生成。' };
		return { ok: true };
	} catch (error) {
		console.error('[financial-donations] pre-checkout validation failed', { message: String(error) });
		return { ok: false, error: '捐赠账本暂时不可用，请稍后重试。' };
	}
}

export async function recordSuccessfulStarsPayment(
	message: StarsPaymentMessage,
	env: Pick<Env, 'DB'>,
): Promise<{ status: 'saved' | 'duplicate' | 'rejected'; id?: string; amount?: number; reason?: string }> {
	if (!env.DB) return { status: 'rejected', reason: 'database-unavailable' };
	const payment = message.successful_payment;
	const parsed = parseStarPayload(payment?.invoice_payload);
	const chargeId = payment?.telegram_payment_charge_id?.trim();
	if (
		!payment
		|| !parsed
		|| !chargeId
		|| payment.currency !== 'XTR'
		|| payment.total_amount !== parsed.amount
		|| message.from?.id !== parsed.userId
	) return { status: 'rejected', reason: 'payment-mismatch' };

	try {
		await ensureFinancialDonationSchema(env.DB);
		const intent = await readIntent(env.DB, parsed.id);
		if (!intentMatchesStars(intent, parsed, payment.invoice_payload!)) {
			return { status: 'rejected', reason: 'intent-mismatch' };
		}
		if (intent.source_chat_id !== String(message.chat?.id ?? '')) {
			return { status: 'rejected', reason: 'payment-chat-mismatch' };
		}
		if (intent.status === 'paid') {
			return intent.telegram_payment_charge_id === chargeId
				? { status: 'duplicate', id: parsed.id, amount: parsed.amount }
				: { status: 'rejected', reason: 'intent-already-paid' };
		}
		if (intent.status !== 'pending') return { status: 'rejected', reason: 'intent-not-pending' };

		const write = await env.DB.prepare(`
			UPDATE financial_donations
			SET status = 'paid', telegram_payment_charge_id = ?, provider_payment_charge_id = ?,
			    paid_at = datetime('now'), updated_at = datetime('now')
			WHERE id = ? AND status = 'pending'
		`).bind(chargeId, payment.provider_payment_charge_id?.trim() || null, parsed.id).run();
		if (Number(write.meta?.changes ?? 0) !== 1) {
			const finalIntent = await readIntent(env.DB, parsed.id);
			if (finalIntent?.status === 'paid' && finalIntent.telegram_payment_charge_id === chargeId) {
				return { status: 'duplicate', id: parsed.id, amount: parsed.amount };
			}
			return { status: 'rejected', reason: 'concurrent-payment-conflict' };
		}
		return { status: 'saved', id: parsed.id, amount: parsed.amount };
	} catch (error) {
		console.error('[financial-donations] successful payment storage failed', {
			id: parsed.id,
			message: String(error),
		});
		return { status: 'rejected', reason: 'storage-failed' };
	}
}
