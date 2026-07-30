import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then((m) => m.mockTgMessageModule));

import { handleDonateToken } from '../../src/commands/donateToken';
import TgMessage from '../../src/lib/telegram';

const ENCRYPTION_KEY = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';
const API_KEY = 'sk-private-donated-token';

function makeDb(recentCount = 0) {
	const calls: Array<{ sql: string; values: unknown[] }> = [];
	return {
		calls,
		prepare(sql: string) {
			return {
				async run() {
					calls.push({ sql, values: [] });
					return { success: true };
				},
				bind(...values: unknown[]) {
					calls.push({ sql, values });
					return {
						async first() {
							if (sql.includes('SELECT COUNT(*) AS count')) return { count: recentCount };
							return null;
						},
						async run() {
							return { success: true };
						},
					};
				},
			};
		},
	} as any;
}

function makeParsed(overrides: Record<string, unknown> = {}) {
	return {
		type: 'message',
		chatId: 123456,
		from: { id: 123456, first_name: 'Donor' },
		isCommand: true,
		command: 'donatetoken',
		args: ['deepseek', 'shared_inference', API_KEY],
		message: {
			message_id: 77,
			chat: { id: 123456, type: 'private', first_name: 'Donor' },
			from: { id: 123456, first_name: 'Donor' },
		},
		...overrides,
	} as any;
}

function makeEnv(db = makeDb(), includeIntakeKey = true) {
	return {
		TOKEN: 'telegram-token',
		BOT_USERNAME: 'lili_DiceBot',
		DB: db,
		...(includeIntakeKey ? { DONATION_INTAKE_KEY: 'donation-intake-secret' } : {}),
		DONATION_ENCRYPTION_KEY: ENCRYPTION_KEY,
		AI_GATEWAY_MANAGEMENT_TOKEN: 'gateway-management-token',
		AI_GATEWAY_ACCOUNT_ID: 'account-id',
		AI_GATEWAY_ID: 'default',
	} as any;
}

describe('/donatetoken', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(TgMessage.deleteMessage).mockResolvedValue({ ok: true } as any);
		vi.mocked(TgMessage.sendText).mockResolvedValue({ ok: true } as any);
		vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/provider_configs')) {
				return new Response(JSON.stringify({ success: true, result: { secret_id: 'secret-id' } }), { status: 200 });
			}
			if (url.includes('/secrets_store/stores/store-id/secrets')) {
				return new Response(JSON.stringify({ success: true, result: [{ id: 'secret-id' }] }), { status: 200 });
			}
			return new Response(JSON.stringify({
				success: true,
				result: [{ id: 'store-id', name: 'default_secrets_store' }],
			}), { status: 200 });
		}));
	});

	it('deletes the private source first, stores it in Gateway, and never echoes secret or raw Telegram id', async () => {
		const db = makeDb();
		const parsed = makeParsed({
			command: 'donate',
			args: ['token', 'deepseek', 'shared_inference', API_KEY],
		});

		await handleDonateToken(parsed, makeEnv(db, false));

		expect(TgMessage.deleteMessage).toHaveBeenCalledWith(expect.anything(), 123456, 77);
		expect(vi.mocked(TgMessage.deleteMessage).mock.invocationCallOrder[0])
			.toBeLessThan(vi.mocked(TgMessage.sendText).mock.invocationCallOrder[0]);
		const insert = db.calls.find((call: any) => call.sql.includes('INSERT INTO api_key_donations'));
		expect(insert).toBeTruthy();
		expect(String(insert?.values[3])).toMatch(/^telegram:[a-f0-9]{16}$/);
		expect(String(insert?.values[3])).not.toContain('123456');
		expect(JSON.stringify(db.calls)).not.toContain(API_KEY);
		expect(JSON.stringify(insert?.values)).toContain('donation-');
		const reply = vi.mocked(TgMessage.sendText).mock.calls.at(-1)?.[1]?.text ?? '';
		expect(reply).toContain('Token 已安全接收');
		expect(reply).toContain('DeepSeek');
		expect(reply).toContain('shared_inference');
		expect(reply).not.toContain(API_KEY);
	});

	it('rejects group donations after deleting a message that may contain a token', async () => {
		const db = makeDb();
		await handleDonateToken(makeParsed({
			chatId: -100999,
			message: { message_id: 78, chat: { id: -100999, type: 'supergroup' }, from: { id: 123456 } },
		}), makeEnv(db));

		expect(TgMessage.deleteMessage).toHaveBeenCalledWith(expect.anything(), -100999, 78);
		expect(db.calls).toHaveLength(0);
		const reply = vi.mocked(TgMessage.sendText).mock.calls.at(-1)?.[1];
		expect(reply?.text).toContain('仅支持与机器人<b>单独聊天</b>');
		expect(reply?.text).not.toContain(API_KEY);
		expect(reply?.reply_markup).toEqual({
			inline_keyboard: [[{ text: '🔐 打开机器人私聊', url: 'https://t.me/lili_DiceBot' }]],
		});
	});

	it('fails closed and stores nothing when Telegram cannot delete the source', async () => {
		const db = makeDb();
		vi.mocked(TgMessage.deleteMessage).mockRejectedValueOnce(new Error('delete denied'));

		await handleDonateToken(makeParsed(), makeEnv(db));

		expect(db.calls).toHaveLength(0);
		const reply = vi.mocked(TgMessage.sendText).mock.calls.at(-1)?.[1]?.text ?? '';
		expect(reply).toContain('没有保存任何 Token');
		expect(reply).not.toContain(API_KEY);
	});

	it('shows private usage without treating the instruction command as a secret', async () => {
		await handleDonateToken(makeParsed({ args: [] }), makeEnv());

		expect(TgMessage.deleteMessage).not.toHaveBeenCalled();
		const reply = vi.mocked(TgMessage.sendText).mock.calls.at(-1)?.[1]?.text ?? '';
		expect(reply).toContain('/donatetoken ollama shared_inference YOUR_OLLAMA_API_KEY');
		expect(reply).toContain('validation_only');
	});

	it('enforces the five-per-day pseudonymous donor limit before storage', async () => {
		const db = makeDb(5);
		await handleDonateToken(makeParsed(), makeEnv(db));

		expect(db.calls.some((call: any) => call.sql.includes('INSERT INTO api_key_donations'))).toBe(false);
		const reply = vi.mocked(TgMessage.sendText).mock.calls.at(-1)?.[1]?.text ?? '';
		expect(reply).toContain('24 小时最多捐赠 5 个');
		expect(reply).not.toContain(API_KEY);
	});
});
