import type { Env } from '../index';

type DonationEnv = Pick<Env, 'DB' | 'DONATION_INTAKE_KEY' | 'DONATION_ENCRYPTION_KEY'>;

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

export async function handleApiKeyDonation(request: Request, env: DonationEnv): Promise<Response> {
	if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
	const url = new URL(request.url);
	if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
		return json({ error: 'HTTPS Required' }, 400);
	}

	const expectedToken = env.DONATION_INTAKE_KEY;
	const authorization = request.headers.get('Authorization') ?? '';
	const suppliedToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
	if (!expectedToken || !suppliedToken || !constantTimeEqual(suppliedToken, expectedToken)) {
		return json({ error: 'Unauthorized' }, 401);
	}
	if (!env.DB || !env.DONATION_ENCRYPTION_KEY) return json({ error: 'Donation intake is not configured' }, 503);
	const masterKey = base64ToBytes(env.DONATION_ENCRYPTION_KEY);
	if (!masterKey || masterKey.byteLength !== 32) return json({ error: 'Donation encryption is not configured correctly' }, 503);
	if (!(request.headers.get('Content-Type') ?? '').toLowerCase().startsWith('application/json')) {
		return json({ error: 'Content-Type must be application/json' }, 415);
	}
	const contentLength = Number(request.headers.get('Content-Length') ?? 0);
	if (contentLength > 8192) return json({ error: 'Payload Too Large' }, 413);

	let payload: { provider?: unknown; apiKey?: unknown; donorLabel?: unknown };
	try {
		payload = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, 400);
	}

	const provider = typeof payload.provider === 'string' ? payload.provider.trim().toLowerCase() : '';
	const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : '';
	const donorLabel = typeof payload.donorLabel === 'string' ? payload.donorLabel.trim().slice(0, 100) : null;
	if (!/^[a-z0-9][a-z0-9._-]{0,39}$/.test(provider)) return json({ error: 'Invalid provider' }, 400);
	if (apiKey.length < 8 || apiKey.length > 4096) return json({ error: 'Invalid API key length' }, 400);

	const fullFingerprint = await sha256Hex(`${provider}\0${apiKey}`);
	const publicFingerprint = fullFingerprint.slice(0, 16);
	try {
		const existing = await env.DB.prepare(
			'SELECT id FROM api_key_donations WHERE provider = ? AND key_fingerprint = ? LIMIT 1',
		).bind(provider, fullFingerprint).first<{ id: string }>();
		if (existing) return json({ id: existing.id, provider, fingerprint: publicFingerprint, status: 'duplicate' });

		const encrypted = await encryptApiKey(apiKey, masterKey);
		const id = crypto.randomUUID();
		await env.DB.prepare(
			`INSERT INTO api_key_donations
			(id, provider, key_fingerprint, encrypted_key, encryption_iv, donor_label, status)
			VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
		).bind(id, provider, fullFingerprint, encrypted.ciphertext, encrypted.iv, donorLabel).run();

		return json({ id, provider, fingerprint: publicFingerprint, status: 'pending' }, 201);
	} catch (error) {
		console.error('[api-key-donations] storage failed', {
			provider,
			error: error instanceof Error ? error.message.slice(0, 300) : 'Unknown D1 error',
		});
		return json({ error: 'Donation storage is temporarily unavailable' }, 503);
	}
}
