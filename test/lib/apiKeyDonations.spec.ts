import { describe, expect, it, vi } from 'vitest';
import { handleApiCredentialAdmin, handleApiKeyDonation, handleTrustedApiKeyDonation, validateCredentialDonation } from '../../src/lib/apiKeyDonations';

function makeDb(existing = false) {
	const calls: Array<{ sql: string; values: unknown[] }> = [];
	return {
		calls,
		prepare(sql: string) {
			const run = async () => {
				calls.push({ sql, values: [] });
				return { success: true };
			};
			return {
				run,
				bind(...values: unknown[]) {
					calls.push({ sql, values });
					return {
						first: async () => sql.includes('SELECT id FROM api_key_donations') && existing ? { id: 'existing-id' } : null,
						run: async () => ({ success: true }),
					};
				},
			};
		},
	} as any;
}

const encryptionKey = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';

function gatewayEnv(db: any, extra: Record<string, unknown> = {}) {
	vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
		if (String(input).includes('/provider_configs')) {
			return new Response(JSON.stringify({ success: true, result: { secret_id: 'secret-id' } }), { status: 200 });
		}
		if (String(input).includes('/secrets_store/stores/store-id/secrets')) {
			return new Response(JSON.stringify({ success: true, result: [{ id: 'secret-id' }] }), { status: 200 });
		}
		return new Response(JSON.stringify({
			success: true,
			result: [{ id: 'store-id', name: 'default_secrets_store' }],
		}), { status: 200 });
	}));
	return {
		DB: db,
		DONATION_INTAKE_KEY: 'intake-secret',
		DONATION_ENCRYPTION_KEY: encryptionKey,
		AI_GATEWAY_MANAGEMENT_TOKEN: 'management-token',
		AI_GATEWAY_ACCOUNT_ID: 'account-id',
		AI_GATEWAY_ID: 'default',
		...extra,
	} as any;
}

function request(body: unknown, token = 'intake-secret') {
	return new Request('https://example.com/api/donations/api-keys', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
	});
}

describe('API key donations', () => {
	it('rejects callers without the donation-scoped bearer token', async () => {
		const response = await handleApiKeyDonation(request({ provider: 'openai', apiKey: 'sk-test-value' }, 'wrong'), {
			DB: makeDb(),
			DONATION_INTAKE_KEY: 'intake-secret',
			DONATION_ENCRYPTION_KEY: encryptionKey,
		});

		expect(response.status).toBe(401);
	});

	it('allows a trusted Telegram caller to store without the HTTP intake bearer secret', async () => {
		const response = await handleTrustedApiKeyDonation({
			provider: 'deepseek',
			apiKey: 'sk-trusted-telegram-token',
			usagePolicy: 'shared_inference',
		}, gatewayEnv(makeDb(), { DONATION_INTAKE_KEY: undefined }));

		expect(response.status).toBe(201);
		expect(await response.json<any>()).toMatchObject({ provider: 'deepseek', status: 'pending' });
	});

	it('stores the key only in AI Gateway and returns non-secret metadata', async () => {
		const db = makeDb();
		const response = await handleApiKeyDonation(request({
			provider: 'OpenAI',
			apiKey: 'sk-test-value',
			donorLabel: 'alice',
			usagePolicy: 'shared_inference',
		}), gatewayEnv(db));
		const result = await response.json<any>();

		expect(response.status).toBe(201);
		expect(result).toMatchObject({ provider: 'openai', platform: 'OpenAI', usagePolicy: 'shared_inference', status: 'pending' });
		expect(result.fingerprint).toMatch(/^[a-f0-9]{16}$/);
		expect(JSON.stringify(result)).not.toContain('sk-test-value');

		const insert = db.calls.find((call: any) => call.sql.includes('INSERT INTO api_key_donations'));
		expect(insert).toBeTruthy();
		expect(insert.values).not.toContain('sk-test-value');
		expect(String(insert.values[3])).not.toContain('sk-test-value');
	});

	it('normalizes Gemini aliases to the canonical platform id', async () => {
		const response = await handleApiKeyDonation(
			request({ provider: 'Gemini', apiKey: 'AIza-test-value' }),
			gatewayEnv(makeDb()),
		);
		const result = await response.json<any>();

		expect(result).toMatchObject({ provider: 'google-gemini', platform: 'Google Gemini', usagePolicy: 'validation_only' });
	});

	it('returns duplicate without inserting the same provider and fingerprint', async () => {
		const db = makeDb(true);
		const response = await handleApiKeyDonation(
			request({ provider: 'openai', apiKey: 'sk-test-value' }),
			gatewayEnv(db),
		);
		const result = await response.json<any>();

		expect(response.status).toBe(200);
		expect(result).toMatchObject({ id: 'existing-id', status: 'duplicate' });
		expect(db.calls.some((call: any) => call.sql.includes('INSERT INTO api_key_donations'))).toBe(false);
	});

	it('rejects invalid provider and short keys', async () => {
		const env = gatewayEnv(makeDb());
		const badProvider = await handleApiKeyDonation(request({ provider: '../openai', apiKey: 'sk-test-value' }), env);
		const shortKey = await handleApiKeyDonation(request({ provider: 'openai', apiKey: 'short' }), env);
		const badPolicy = await handleApiKeyDonation(request({ provider: 'openai', apiKey: 'sk-test-value', usagePolicy: 'anything' }), env);

		expect(badProvider.status).toBe(400);
		expect(shortKey.status).toBe(400);
		expect(badPolicy.status).toBe(400);
	});

	it('fails closed when D1 or Gateway management is unavailable', async () => {
		const withoutDb = await handleApiKeyDonation(request({ provider: 'openai', apiKey: 'sk-test-value' }), {
			DONATION_INTAKE_KEY: 'intake-secret',
			DONATION_ENCRYPTION_KEY: encryptionKey,
		});
		const missingManagement = await handleApiKeyDonation(request({ provider: 'openai', apiKey: 'sk-test-value' }), {
			DB: makeDb(),
			DONATION_INTAKE_KEY: 'intake-secret',
			DONATION_ENCRYPTION_KEY: encryptionKey,
		});

		expect(withoutDb.status).toBe(503);
		expect(missingManagement.status).toBe(503);
	});

	it('requires HTTPS and JSON content type', async () => {
		const env = { DB: makeDb(), DONATION_INTAKE_KEY: 'intake-secret', DONATION_ENCRYPTION_KEY: encryptionKey };
		const insecure = new Request('http://example.com/api/donations/api-keys', {
			method: 'POST',
			headers: { Authorization: 'Bearer intake-secret', 'Content-Type': 'application/json' },
			body: JSON.stringify({ provider: 'openai', apiKey: 'sk-test-value' }),
		});
		const wrongType = new Request('https://example.com/api/donations/api-keys', {
			method: 'POST',
			headers: { Authorization: 'Bearer intake-secret', 'Content-Type': 'text/plain' },
			body: '{}',
		});

		expect((await handleApiKeyDonation(insecure, env)).status).toBe(400);
		expect((await handleApiKeyDonation(wrongType, env)).status).toBe(415);
	});

	it('validates a Gemini credential through its Gateway alias and records visible models', async () => {
		const calls: Array<{ sql: string; values: unknown[] }> = [];
		const stored = {
			id: 'gateway-donation',
			provider: 'google-gemini',
			encrypted_key: '',
			encryption_iv: '',
			gateway_alias: 'donation-gateway',
			status: 'pending',
		};
		const db = {
			prepare(sql: string) {
				return {
					run: async () => ({ success: true }),
					bind(...values: unknown[]) {
						calls.push({ sql, values });
						return {
							run: async () => ({ success: true }),
							first: async () => sql.includes('SELECT id, provider, encrypted_key') ? stored : null,
						};
					},
				};
			},
		} as any;
		const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ models: [{
			name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'],
		}] }), { status: 200 }));
		const getUrl = vi.fn().mockResolvedValue('https://gateway.example/google-ai-studio');
		const result = await validateCredentialDonation({
			DB: db,
			AI: { gateway: vi.fn().mockReturnValue({ getUrl }) },
			AI_GATEWAY_ID: 'default',
			AI_GATEWAY_TOKEN: 'gateway-run-token',
		} as any, stored.id, { fetchFn });

		expect(result).toEqual({ status: 'ok', provider: 'google-gemini', models: ['gemini-2.5-flash'] });
		expect(fetchFn.mock.calls[0][1].headers['cf-aig-byok-alias']).toBe('donation-gateway');
		expect(fetchFn.mock.calls[0][1].headers).not.toHaveProperty('x-goog-api-key');
		expect(calls.some((call) => call.sql.includes('UPDATE api_key_donations') && call.values.includes('active'))).toBe(true);
	});

	it('marks an already managed DeepSeek credential without reading a local key', async () => {
		const calls: Array<{ sql: string; values: unknown[] }> = [];
		const stored = {
			id: 'gateway-deepseek',
			provider: 'deepseek',
			encrypted_key: '',
			encryption_iv: '',
			gateway_alias: 'donation-deepseek',
			status: 'pending',
		};
		const db = {
			prepare(sql: string) {
				return {
					run: async () => ({ success: true }),
					bind(...values: unknown[]) {
						calls.push({ sql, values });
						return {
							run: async () => ({ success: true }),
							first: async () => sql.includes('SELECT id, provider, encrypted_key') ? stored : null,
						};
					},
				};
			},
		} as any;
		const result = await validateCredentialDonation({ DB: db } as any, stored.id, { fetchFn: vi.fn() });

		expect(result).toEqual({
			status: 'ok',
			provider: 'deepseek',
			models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
		});
		expect(calls.some((call) => call.sql.includes('UPDATE api_key_donations') && call.values.includes('active'))).toBe(true);
	});

	it('keeps intake and administration credentials separate and cannot restore erased ciphertext', async () => {
		const db = {
			prepare(sql: string) {
				return {
					run: async () => ({ success: true }),
					bind() {
						return {
							run: async () => ({ success: true }),
							first: async () => sql.includes('SELECT status, encrypted_key') ? { status: 'revoked', encrypted_key: '' } : null,
						};
					},
				};
			},
		} as any;
		const url = 'https://example.com/api/donations/api-keys/00000000-0000-4000-8000-000000000000/status';
		const wrongScope = await handleApiCredentialAdmin(new Request(url, {
			method: 'POST', headers: { Authorization: 'Bearer intake-secret', 'Content-Type': 'application/json' }, body: '{"status":"pending"}',
		}), { DB: db, DONATION_ADMIN_KEY: 'admin-secret' });
		const restore = await handleApiCredentialAdmin(new Request(url, {
			method: 'POST', headers: { Authorization: 'Bearer admin-secret', 'Content-Type': 'application/json' }, body: '{"status":"pending"}',
		}), { DB: db, DONATION_ADMIN_KEY: 'admin-secret' });

		expect(wrongScope.status).toBe(401);
		expect(restore.status).toBe(409);
	});
});
