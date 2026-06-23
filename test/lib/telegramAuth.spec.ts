import { describe, expect, it } from 'vitest';
import {
	createWebGameAuth,
	isTelegramWebhookRequest,
	verifyWebGameAuth,
} from '../../src/lib/telegramAuth';

describe('telegramAuth', () => {
	it('accepts webhook requests from Telegram webhook IP ranges', () => {
		const request = new Request('https://example.com', {
			headers: { 'CF-Connecting-IP': '149.154.160.1' },
		});

		expect(isTelegramWebhookRequest(request, {})).toBe(true);
	});

	it('rejects webhook requests outside Telegram webhook IP ranges', () => {
		const request = new Request('https://example.com', {
			headers: { 'CF-Connecting-IP': '203.0.113.10' },
		});

		expect(isTelegramWebhookRequest(request, {})).toBe(false);
	});

	it('accepts webhook requests with the configured Telegram secret header', () => {
		const request = new Request('https://example.com', {
			headers: { 'X-Telegram-Bot-Api-Secret-Token': 'secret-token' },
		});

		expect(isTelegramWebhookRequest(request, { TELEGRAM_WEBHOOK_SECRET: 'secret-token' })).toBe(true);
	});

	it('creates and verifies a signed web game launch token for one user and game', async () => {
		const env = { TOKEN: 'bot-token' };
		const issuedAt = 1_800_000_000;
		const auth = await createWebGameAuth(env, {
			userId: '12345',
			game: 'fish',
			issuedAt,
		});

		await expect(verifyWebGameAuth(env, {
			userId: '12345',
			game: 'fish',
			issuedAt,
			auth,
			now: issuedAt + 60,
		})).resolves.toBe(true);

		await expect(verifyWebGameAuth(env, {
			userId: '54321',
			game: 'fish',
			issuedAt,
			auth,
			now: issuedAt + 60,
		})).resolves.toBe(false);
	});

	it('rejects expired web game launch tokens', async () => {
		const env = { TOKEN: 'bot-token' };
		const issuedAt = 1_800_000_000;
		const auth = await createWebGameAuth(env, {
			userId: '12345',
			game: 'fish',
			issuedAt,
		});

		await expect(verifyWebGameAuth(env, {
			userId: '12345',
			game: 'fish',
			issuedAt,
			auth,
			now: issuedAt + 7 * 60 * 60,
		})).resolves.toBe(false);
	});
});
