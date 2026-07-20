import type { Env } from '../index';
import {
	AI_PROVIDERS,
	normalizeProvider,
	providerById,
	publicProviderCatalog,
	routableGeminiModels,
	type CredentialUsagePolicy,
} from './aiProviderRegistry';
import { DEEPSEEK_PREMIUM_MODELS, checkDeepSeekPaidBalance } from './deepseekPremium';

type DonationEnv = Pick<
	Env,
	'DB' | 'DONATION_INTAKE_KEY' | 'DONATION_ADMIN_KEY' | 'DONATION_ENCRYPTION_KEY'
>;

type DonationRecord = {
	id: string;
	provider: string;
	encrypted_key: string;
	encryption_iv: string;
	status: 'pending' | 'active' | 'invalid' | 'disabled' | 'revoked';
};

export type ApiKeyDonationPayload = {
	provider?: unknown;
	apiKey?: unknown;
	donorLabel?: unknown;
	usagePolicy?: unknown;
};

const JSON_HEADERS = {
	'Content-Type': 'application/json; charset=utf-8',
	'Cache-Control': 'no-store',
};

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function constantTimeEqual(left: string, right: string): boolean {
	const encoder = new TextEncoder();
	const a = encoder.encode(left);
	const b = encoder.encode(right);
	let mismatch = a.length ^ b.length;
	const length = Math.max(a.length, b.length);
	for (let i = 0; i < length; i += 1) mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0);
	return mismatch === 0;
}

function bearerToken(request: Request): string {
	const authorization = request.headers.get('Authorization') ?? '';
	return authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
}

function hasBearerToken(request: Request, expected: string | undefined): boolean {
	const supplied = bearerToken(request);
	return Boolean(expected && supplied && constantTimeEqual(supplied, expected));
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array | null {
	try {
		const binary = atob(value);
		return Uint8Array.from(binary, (char) => char.charCodeAt(0));
	} catch {
		return null;
	}
}

function masterKeyFromEnv(env: DonationEnv): Uint8Array | null {
	if (!env.DONATION_ENCRYPTION_KEY) return null;
	const key = base64ToBytes(env.DONATION_ENCRYPTION_KEY);
	return key?.byteLength === 32 ? key : null;
}

async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function encryptApiKey(apiKey: string, masterKey: Uint8Array): Promise<{ ciphertext: string; iv: string }> {
	const key = await crypto.subtle.importKey('raw', masterKey, { name: 'AES-GCM' }, false, ['encrypt']);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(apiKey));
	return { ciphertext: bytesToBase64(new Uint8Array(encrypted)), iv: bytesToBase64(iv) };
}

async function decryptApiKey(record: Pick<DonationRecord, 'encrypted_key' | 'encryption_iv'>, masterKey: Uint8Array): Promise<string> {
	const ciphertext = base64ToBytes(record.encrypted_key);
	const iv = base64ToBytes(record.encryption_iv);
	if (!ciphertext || !iv || iv.byteLength !== 12) throw new Error('Stored credential ciphertext is invalid');
	const key = await crypto.subtle.importKey('raw', masterKey, { name: 'AES-GCM' }, false, ['decrypt']);
	const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
	return new TextDecoder().decode(decrypted);
}

export async function decryptDonationCredentialForRuntime(
	env: Pick<Env, 'DONATION_ENCRYPTION_KEY'>,
	record: Pick<DonationRecord, 'encrypted_key' | 'encryption_iv'>,
): Promise<string> {
	const masterKey = masterKeyFromEnv(env);
	if (!masterKey) throw new Error('Donation encryption is not configured correctly');
	return decryptApiKey(record, masterKey);
}

export async function ensureCredentialProfileTable(db: D1Database): Promise<void> {
	await db.prepare(`
		CREATE TABLE IF NOT EXISTS api_credential_profiles (
			donation_id TEXT PRIMARY KEY,
			provider TEXT NOT NULL,
			credential_type TEXT NOT NULL DEFAULT 'api_key',
			usage_policy TEXT NOT NULL DEFAULT 'validation_only'
				CHECK (usage_policy IN ('validation_only', 'shared_inference')),
			available_models_json TEXT NOT NULL DEFAULT '[]',
			health_status TEXT NOT NULL DEFAULT 'unchecked'
				CHECK (health_status IN ('unchecked', 'healthy', 'rate_limited', 'error', 'disabled', 'revoked')),
			last_checked_at TEXT,
			last_error_code TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`).run();
	await db.prepare(`
		CREATE INDEX IF NOT EXISTS idx_api_credential_profiles_routing
		ON api_credential_profiles (provider, usage_policy, health_status, last_checked_at)
	`).run();
}

async function ensureProfile(
	db: D1Database,
	donationId: string,
	provider: string,
	usagePolicy: CredentialUsagePolicy,
): Promise<void> {
	await ensureCredentialProfileTable(db);
	await db.prepare(`
		INSERT OR IGNORE INTO api_credential_profiles
		(donation_id, provider, credential_type, usage_policy, health_status, created_at, updated_at)
		VALUES (?, ?, 'api_key', ?, 'unchecked', datetime('now'), datetime('now'))
	`).bind(donationId, provider, usagePolicy).run();
}

export async function handleApiKeyDonation(request: Request, env: DonationEnv): Promise<Response> {
	if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
	const url = new URL(request.url);
	if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
		return json({ error: 'HTTPS Required' }, 400);
	}
	if (!hasBearerToken(request, env.DONATION_INTAKE_KEY)) return json({ error: 'Unauthorized' }, 401);
	if (!(request.headers.get('Content-Type') ?? '').toLowerCase().startsWith('application/json')) {
		return json({ error: 'Content-Type must be application/json' }, 415);
	}
	const contentLength = Number(request.headers.get('Content-Length') ?? 0);
	if (contentLength > 8192) return json({ error: 'Payload Too Large' }, 413);

	let payload: ApiKeyDonationPayload;
	try {
		const rawBody = await request.text();
		if (new TextEncoder().encode(rawBody).byteLength > 8192) return json({ error: 'Payload Too Large' }, 413);
		const decoded = JSON.parse(rawBody);
		if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return json({ error: 'Invalid JSON object' }, 400);
		payload = decoded;
	} catch {
		return json({ error: 'Invalid JSON' }, 400);
	}
	return storeApiKeyDonation(payload, env);
}

/**
 * Stores a validated credential for an already-authenticated caller. HTTP
 * callers must pass the intake bearer check above; Telegram webhook callers
 * are authenticated by the webhook verifier and use this same function
 * directly, so they do not depend on an unrelated HTTP bearer secret.
 */
export async function storeApiKeyDonation(
	payload: ApiKeyDonationPayload,
	env: Pick<Env, 'DB' | 'DONATION_ENCRYPTION_KEY'>,
): Promise<Response> {
	if (!env.DB || !env.DONATION_ENCRYPTION_KEY) return json({ error: 'Donation intake is not configured' }, 503);
	const masterKey = masterKeyFromEnv(env);
	if (!masterKey) return json({ error: 'Donation encryption is not configured correctly' }, 503);

	const provider = normalizeProvider(payload.provider);
	const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : '';
	const donorLabel = typeof payload.donorLabel === 'string' ? payload.donorLabel.trim().slice(0, 100) : null;
	const usagePolicy = payload.usagePolicy === 'shared_inference' ? 'shared_inference' : 'validation_only';
	if (!provider) {
		return json({
			error: 'Unsupported provider',
			supportedProviders: AI_PROVIDERS.map((item) => item.id),
		}, 400);
	}
	if (payload.usagePolicy !== undefined && payload.usagePolicy !== 'validation_only' && payload.usagePolicy !== 'shared_inference') {
		return json({ error: 'Invalid usagePolicy' }, 400);
	}
	if (apiKey.length < 8 || apiKey.length > 4096) return json({ error: 'Invalid API key length' }, 400);

	const fullFingerprint = await sha256Hex(`${provider.id}\0${apiKey}`);
	const publicFingerprint = fullFingerprint.slice(0, 16);
	try {
		const existing = await env.DB.prepare(
			'SELECT id FROM api_key_donations WHERE provider = ? AND key_fingerprint = ? LIMIT 1',
		).bind(provider.id, fullFingerprint).first<{ id: string }>();
		if (existing) {
			await ensureProfile(env.DB, existing.id, provider.id, usagePolicy);
			const profile = await env.DB.prepare(`
				SELECT usage_policy FROM api_credential_profiles WHERE donation_id = ? LIMIT 1
			`).bind(existing.id).first<{ usage_policy: CredentialUsagePolicy }>();
			return json({
				id: existing.id,
				provider: provider.id,
				platform: provider.displayName,
				fingerprint: publicFingerprint,
				usagePolicy: profile?.usage_policy ?? usagePolicy,
				status: 'duplicate',
			});
		}

		const encrypted = await encryptApiKey(apiKey, masterKey);
		const id = crypto.randomUUID();
		await env.DB.prepare(
			`INSERT INTO api_key_donations
			(id, provider, key_fingerprint, encrypted_key, encryption_iv, donor_label, status)
			VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
		).bind(id, provider.id, fullFingerprint, encrypted.ciphertext, encrypted.iv, donorLabel).run();
		await ensureProfile(env.DB, id, provider.id, usagePolicy);

		return json({
			id,
			provider: provider.id,
			platform: provider.displayName,
			fingerprint: publicFingerprint,
			usagePolicy,
			status: 'pending',
		}, 201);
	} catch (error) {
		console.error('[api-key-donations] storage failed', {
			provider: provider.id,
			error: error instanceof Error ? error.message.slice(0, 300) : 'Unknown D1 error',
		});
		return json({ error: 'Donation storage is temporarily unavailable' }, 503);
	}
}

/** Trusted Telegram webhook intake; it shares validation and storage with HTTP. */
export async function handleTrustedApiKeyDonation(
	payload: ApiKeyDonationPayload,
	env: DonationEnv,
): Promise<Response> {
	return storeApiKeyDonation(payload, env);
}

async function updateValidationResult(
	db: D1Database,
	record: DonationRecord,
	input: { status: DonationRecord['status']; health: string; models?: string[]; errorCode?: string | null },
): Promise<void> {
	await db.prepare(`
		UPDATE api_key_donations
		SET status = ?, last_validated_at = datetime('now'), validation_error = ?, updated_at = datetime('now')
		WHERE id = ?
	`).bind(input.status, input.errorCode ?? null, record.id).run();
	await db.prepare(`
		UPDATE api_credential_profiles
		SET available_models_json = ?, health_status = ?, last_checked_at = datetime('now'),
			last_error_code = ?, updated_at = datetime('now')
		WHERE donation_id = ?
	`).bind(JSON.stringify(input.models ?? []), input.health, input.errorCode ?? null, record.id).run();
}

export async function validateCredentialDonation(
	env: DonationEnv,
	donationId: string,
	options: { fetchFn?: typeof fetch } = {},
): Promise<{
	status: 'ok' | 'skipped' | 'error';
	provider?: string;
	models?: string[];
	paidBalanceAvailable?: boolean;
	reason?: string;
}> {
	if (!env.DB) return { status: 'skipped', reason: 'D1 is not configured' };
	const masterKey = masterKeyFromEnv(env);
	if (!masterKey) return { status: 'skipped', reason: 'Donation encryption is not configured correctly' };
	await ensureCredentialProfileTable(env.DB);
	const record = await env.DB.prepare(`
		SELECT id, provider, encrypted_key, encryption_iv, status
		FROM api_key_donations WHERE id = ? LIMIT 1
	`).bind(donationId).first<DonationRecord>();
	if (!record) return { status: 'skipped', reason: 'Credential donation was not found' };
	if (record.status === 'revoked' || record.status === 'disabled') {
		return { status: 'skipped', provider: record.provider, reason: `Credential is ${record.status}` };
	}
	const provider = providerById(record.provider);
	if (!provider || provider.validation === 'not-implemented') {
		return { status: 'skipped', provider: record.provider, reason: 'Provider validation is not implemented' };
	}

	try {
		const apiKey = await decryptApiKey(record, masterKey);
		if (provider.validation === 'google-models') {
			const response = await (options.fetchFn ?? fetch)(
				'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
				{
					method: 'GET',
					signal: AbortSignal.timeout(10_000),
					headers: {
						Accept: 'application/json',
						'x-goog-api-key': apiKey,
						'User-Agent': 'dicebot-credential-validator',
					},
				},
			);
			if (response.ok) {
				const models = routableGeminiModels(await response.json());
				await updateValidationResult(env.DB, record, { status: 'active', health: 'healthy', models });
				console.log('[api-key-donations] validation complete', { id: record.id, provider: record.provider, models: models.length });
				return { status: 'ok', provider: record.provider, models };
			}

			const errorCode = `http_${response.status}`;
			if ([400, 401, 403].includes(response.status)) {
				await updateValidationResult(env.DB, record, { status: 'invalid', health: 'error', errorCode });
			} else if (response.status === 429) {
				await updateValidationResult(env.DB, record, { status: record.status, health: 'rate_limited', errorCode });
			} else {
				await updateValidationResult(env.DB, record, { status: record.status, health: 'error', errorCode });
			}
			return { status: 'error', provider: record.provider, reason: errorCode };
		}

		const balance = await checkDeepSeekPaidBalance(apiKey, options);
		if (balance.status === 'error') {
			const invalid = balance.reason === 'balance_http_401' || balance.reason === 'balance_http_403';
			await updateValidationResult(env.DB, record, {
				status: invalid ? 'invalid' : record.status,
				health: 'error',
				errorCode: balance.reason,
			});
			return { status: 'error', provider: record.provider, reason: balance.reason };
		}
		const models = [...DEEPSEEK_PREMIUM_MODELS];
		const errorCode = balance.apiAvailable ? null : 'balance_unavailable';
		await updateValidationResult(env.DB, record, {
			status: 'active',
			health: balance.apiAvailable ? 'healthy' : 'error',
			models,
			errorCode,
		});
		console.log('[api-key-donations] validation complete', {
			id: record.id,
			provider: record.provider,
			models: models.length,
			paidBalanceAvailable: balance.paidBalanceAvailable,
		});
		return {
			status: 'ok',
			provider: record.provider,
			models,
			paidBalanceAvailable: balance.paidBalanceAvailable,
		};
	} catch (error) {
		const reason = error instanceof Error ? error.message.slice(0, 160) : 'Credential validation failed';
		await updateValidationResult(env.DB, record, { status: record.status, health: 'error', errorCode: 'validation_error' });
		console.error('[api-key-donations] validation failed', { id: record.id, provider: record.provider, reason });
		return { status: 'error', provider: record.provider, reason: 'validation_error' };
	}
}

export async function refreshOneSharedCredential(
	env: DonationEnv,
	options: { fetchFn?: typeof fetch } = {},
): Promise<{
	status: 'ok' | 'skipped' | 'error';
	provider?: string;
	models?: string[];
	paidBalanceAvailable?: boolean;
	reason?: string;
}> {
	if (!env.DB) return { status: 'skipped', reason: 'D1 is not configured' };
	await ensureCredentialProfileTable(env.DB);
	const row = await env.DB.prepare(`
		SELECT d.id
		FROM api_key_donations d
		JOIN api_credential_profiles p ON p.donation_id = d.id
		WHERE d.status IN ('pending', 'active') AND p.usage_policy = 'shared_inference'
		ORDER BY CASE WHEN p.last_checked_at IS NULL THEN 0 ELSE 1 END, p.last_checked_at ASC, d.created_at ASC
		LIMIT 1
	`).first<{ id: string }>();
	if (!row) return { status: 'skipped', reason: 'No shared credential is due for validation' };
	return validateCredentialDonation(env, row.id, options);
}

async function listCredentialMetadata(db: D1Database): Promise<Response> {
	await ensureCredentialProfileTable(db);
	const result = await db.prepare(`
		SELECT d.id, d.provider, substr(d.key_fingerprint, 1, 16) AS fingerprint,
			d.donor_label, d.status, d.created_at, d.updated_at, d.last_validated_at,
			p.credential_type, p.usage_policy, p.available_models_json, p.health_status,
			p.last_checked_at, p.last_error_code
		FROM api_key_donations d
		LEFT JOIN api_credential_profiles p ON p.donation_id = d.id
		ORDER BY d.created_at DESC LIMIT 100
	`).all<Record<string, unknown>>();
	return json({ credentials: result.results ?? [], providers: publicProviderCatalog() });
}

async function updateCredentialStatus(request: Request, db: D1Database, donationId: string): Promise<Response> {
	let payload: { status?: unknown };
	try {
		const decoded = await request.json();
		if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return json({ error: 'Invalid JSON object' }, 400);
		payload = decoded;
	} catch {
		return json({ error: 'Invalid JSON' }, 400);
	}
	if (payload.status !== 'disabled' && payload.status !== 'revoked' && payload.status !== 'pending') {
		return json({ error: 'status must be disabled, revoked, or pending' }, 400);
	}
	await ensureCredentialProfileTable(db);
	const existing = await db.prepare(`
		SELECT status, encrypted_key FROM api_key_donations WHERE id = ? LIMIT 1
	`).bind(donationId).first<{ status: DonationRecord['status']; encrypted_key: string }>();
	if (!existing) return json({ error: 'Credential donation was not found' }, 404);
	if (existing.status === 'revoked' && payload.status !== 'revoked') {
		return json({ error: 'A revoked credential cannot be restored because its ciphertext was erased' }, 409);
	}
	if (payload.status === 'revoked') {
		await db.prepare(`
			UPDATE api_key_donations SET status = 'revoked', encrypted_key = '', encryption_iv = '',
				validation_error = NULL, updated_at = datetime('now') WHERE id = ?
		`).bind(donationId).run();
	} else {
		await db.prepare(`
			UPDATE api_key_donations SET status = ?, validation_error = NULL, updated_at = datetime('now') WHERE id = ?
		`).bind(payload.status, donationId).run();
	}
	const health = payload.status === 'pending' ? 'unchecked' : payload.status;
	await db.prepare(`
		UPDATE api_credential_profiles SET health_status = ?, available_models_json = '[]',
			last_error_code = NULL, updated_at = datetime('now') WHERE donation_id = ?
	`).bind(health, donationId).run();
	return json({ id: donationId, status: payload.status });
}

export async function handleApiCredentialAdmin(request: Request, env: DonationEnv): Promise<Response> {
	const url = new URL(request.url);
	if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
		return json({ error: 'HTTPS Required' }, 400);
	}
	if (!hasBearerToken(request, env.DONATION_ADMIN_KEY)) return json({ error: 'Unauthorized' }, 401);
	if (!env.DB) return json({ error: 'Credential management is not configured' }, 503);
	const path = url.pathname;
	if (path === '/api/donations/api-keys' && request.method === 'GET') return listCredentialMetadata(env.DB);

	const validateMatch = path.match(/^\/api\/donations\/api-keys\/([0-9a-f-]{36})\/validate$/i);
	if (validateMatch && request.method === 'POST') {
		const result = await validateCredentialDonation(env, validateMatch[1]);
		const status = result.status === 'ok' ? 200 : result.status === 'skipped' ? 409 : 502;
		return json(result, status);
	}
	const statusMatch = path.match(/^\/api\/donations\/api-keys\/([0-9a-f-]{36})\/status$/i);
	if (statusMatch && request.method === 'POST') return updateCredentialStatus(request, env.DB, statusMatch[1]);
	return json({ error: 'Not Found' }, 404);
}
