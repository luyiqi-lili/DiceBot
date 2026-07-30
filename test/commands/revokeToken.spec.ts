import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then((m) => m.mockTgMessageModule));

import { handleRevokeToken } from '../../src/commands/revokeToken';
import TgMessage from '../../src/lib/telegram';

const ENCRYPTION_KEY = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';
const OWN_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';

function makeParsed(args: string[] = [], overrides: Record<string, unknown> = {}) {
	return {
		type: 'message',
		chatId: 123456,
		from: { id: 123456, first_name: 'Donor' },
		isCommand: true,
		command: 'revoketoken',
		args,
		message: {
			message_id: 88,
			chat: { id: 123456, type: 'private', first_name: 'Donor' },
			from: { id: 123456, first_name: 'Donor' },
		},
		...overrides,
	} as any;
}

function makeDb(rows = [{
	id: OWN_ID,
	provider: 'google-gemini',
	status: 'active',
	usage_policy: 'shared_inference',
	health_status: 'healthy',
}]) {
	const calls: Array<{ sql: string; values: unknown[] }> = [];
	const batches: Array<Array<{ sql: string; values: unknown[] }>> = [];
	return {
		calls,
		batches,
		prepare(sql: string) {
			return {
				sql,
				values: [] as unknown[],
				bind(...values: unknown[]) {
					const statement = {
						sql,
						values,
						async all() {
							calls.push({ sql, values });
							return { results: rows };
						},
					};
					return statement;
				},
			};
		},
		async batch(statements: Array<{ sql: string; values: unknown[] }>) {
			batches.push(statements.map((statement) => ({ sql: statement.sql, values: statement.values })));
			return [{ meta: { changes: rows.length } }, { meta: { changes: rows.length } }];
		},
	} as any;
}

function makeEnv(db = makeDb()) {
	return { DB: db, DONATION_ENCRYPTION_KEY: ENCRYPTION_KEY } as any;
}

describe('/revoketoken', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(TgMessage.sendText).mockResolvedValue({ ok: true } as any);
	});

	it('lists only the current donor records without exposing a Token or raw Telegram id', async () => {
		const db = makeDb();
		await handleRevokeToken(makeParsed(), makeEnv(db));

		const query = db.calls[0];
		expect(query.sql).toContain('WHERE d.donor_label = ?');
		expect(String(query.values[0])).toMatch(/^telegram:[a-f0-9]{16}$/);
		expect(String(query.values[0])).not.toContain('123456');
		const text = vi.mocked(TgMessage.sendText).mock.calls[0][1].text;
		expect(text).toContain(OWN_ID);
		expect(text).toContain('Google Gemini');
		expect(text).toContain('/revoketoken google');
		expect(text).not.toContain('123456');
	});

	it('requires an explicit second-step confirmation before revoking a provider', async () => {
		const db = makeDb();
		await handleRevokeToken(makeParsed(['google']), makeEnv(db));

		expect(db.batches).toHaveLength(0);
		const text = vi.mocked(TgMessage.sendText).mock.calls[0][1].text;
		expect(text).toContain('撤销后不可恢复');
		expect(text).toContain('/revoketoken google confirm');
	});

	it('permanently erases only the current donor matching credential after confirmation', async () => {
		const db = makeDb();
		await handleRevokeToken(makeParsed([OWN_ID, 'confirm']), makeEnv(db));

		expect(db.batches).toHaveLength(1);
		const [donationUpdate, profileUpdate] = db.batches[0];
		expect(donationUpdate.sql).toContain("encrypted_key = ''");
		expect(donationUpdate.sql).toContain("encryption_iv = ''");
		expect(donationUpdate.sql).toContain('WHERE donor_label = ?');
		expect(donationUpdate.sql).toContain('AND id = ?');
		expect(donationUpdate.values[1]).toBe(OWN_ID);
		expect(profileUpdate.sql).toContain("health_status = 'revoked'");
		expect(vi.mocked(TgMessage.sendText).mock.calls[0][1].text).toContain('已撤销 1 个 Token');
	});

	it('cannot target a credential that is not in the authenticated donor query result', async () => {
		const db = makeDb();
		await handleRevokeToken(makeParsed([OTHER_ID, 'confirm']), makeEnv(db));

		expect(db.batches).toHaveLength(0);
		expect(vi.mocked(TgMessage.sendText).mock.calls[0][1].text).toContain('没有找到属于你的匹配捐赠');
	});

	it('keeps donation records private when invoked in a group', async () => {
		const db = makeDb();
		await handleRevokeToken(makeParsed([], {
			chatId: -100999,
			message: { message_id: 89, chat: { id: -100999, type: 'supergroup' }, from: { id: 123456 } },
		}), makeEnv(db));

		expect(db.calls).toHaveLength(0);
		expect(vi.mocked(TgMessage.sendText).mock.calls[0][1].text).toContain('仅支持和机器人<b>单独聊天</b>');
	});
});
