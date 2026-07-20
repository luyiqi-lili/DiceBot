import { describe, expect, it } from 'vitest';
import { handleApiKeyDonation } from '../../src/lib/apiKeyDonations';

function makeDb(existing = false) {
	const calls: Array<{ sql: string; values: unknown[] }> = [];
	return {
		calls,
		prepare(sql: string) {
			return {
				bind(...values: unknown[]) {
					calls.push({ sql, values });
					return {
						first: async () => existing ? { id: 'existing-id' } : null,
						run: async () => ({ success: true }),
					};
				},
			};
		},
	} as any;
}

const encryptionKey = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';

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

	it('encrypts the key and returns only non-secret metadata', async () => {
		const db = makeDb();
		const response = await handleApiKeyDonation(request({
			provider: 'OpenAI',
			apiKey: 'sk-test-value',
			donorLabel: 'alice',
		}), {
			DB: db,
			DONATION_INTAKE_KEY: 'intake-secret',
			DONATION_ENCRYPTION_KEY: encryptionKey,
		});
		const result = await response.json<any>();

		expect(response.status).toBe(201);
		expect(result).toMatchObject({ provider: 'openai', status: 'pending' });
		expect(result.fingerprint).toMatch(/^[a-f0-9]{16}$/);
		expect(JSON.stringify(result)).not.toContain('sk-test-value');

		const insert = db.calls.find((call: any) => call.sql.includes('INSERT INTO api_key_donations'));
		expect(insert).toBeTruthy();
		expect(insert.values).not.toContain('sk-test-value');
		expect(String(insert.values[3])).not.toContain('sk-test-value');
	});

	it('returns duplicate without inserting the same provider and fingerprint', async () => {
		const db = makeDb(true);
		const response = await handleApiKeyDonation(request({ provider: 'openai', apiKey: 'sk-test-value' }), {
			DB: db,
			DONATION_INTAKE_KEY: 'intake-secret',
			DONATION_ENCRYPTION_KEY: encryptionKey,
		});
		const result = await response.json<any>();

		expect(response.status).toBe(200);
		expect(result).toMatchObject({ id: 'existing-id', status: 'duplicate' });
		expect(db.calls.some((call: any) => call.sql.includes('INSERT INTO api_key_donations'))).toBe(false);
	});

	it('rejects invalid provider and short keys', async () => {
		const env = { DB: makeDb(), DONATION_INTAKE_KEY: 'intake-secret', DONATION_ENCRYPTION_KEY: encryptionKey };
		const badProvider = await handleApiKeyDonation(request({ provider: '../openai', apiKey: 'sk-test-value' }), env);
		const shortKey = await handleApiKeyDonation(request({ provider: 'openai', apiKey: 'short' }), env);

		expect(badProvider.status).toBe(400);
		expect(shortKey.status).toBe(400);
	});

	it('fails closed when D1 or the encryption key is unavailable', async () => {
		const withoutDb = await handleApiKeyDonation(request({ provider: 'openai', apiKey: 'sk-test-value' }), {
			DONATION_INTAKE_KEY: 'intake-secret',
			DONATION_ENCRYPTION_KEY: encryptionKey,
		});
		const invalidEncryption = await handleApiKeyDonation(request({ provider: 'openai', apiKey: 'sk-test-value' }), {
			DB: makeDb(),
			DONATION_INTAKE_KEY: 'intake-secret',
			DONATION_ENCRYPTION_KEY: 'not-a-32-byte-key',
		});

		expect(withoutDb.status).toBe(503);
		expect(invalidEncryption.status).toBe(503);
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
});
