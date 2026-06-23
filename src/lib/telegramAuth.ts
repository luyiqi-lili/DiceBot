type WebhookAuthEnv = {
	TELEGRAM_WEBHOOK_SECRET?: string;
};

type GameAuthEnv = {
	TOKEN: string;
};

const TELEGRAM_WEBHOOK_CIDRS = [
	'149.154.160.0/20',
	'91.108.4.0/22',
] as const;

const WEB_GAME_AUTH_TTL_SECONDS = 6 * 60 * 60;

function ipv4ToInt(ip: string): number | null {
	const parts = ip.split('.');
	if (parts.length !== 4) return null;
	let value = 0;
	for (const part of parts) {
		if (!/^\d+$/.test(part)) return null;
		const n = Number(part);
		if (n < 0 || n > 255) return null;
		value = (value << 8) + n;
	}
	return value >>> 0;
}

function isIpInCidr(ip: string, cidr: string): boolean {
	const [range, bitsText] = cidr.split('/');
	const bits = Number(bitsText);
	const ipInt = ipv4ToInt(ip);
	const rangeInt = ipv4ToInt(range);
	if (ipInt === null || rangeInt === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
		return false;
	}
	const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
	return (ipInt & mask) === (rangeInt & mask);
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i += 1) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

export function isTelegramWebhookRequest(request: Request, env: WebhookAuthEnv): boolean {
	const configuredSecret = env.TELEGRAM_WEBHOOK_SECRET?.trim();
	const suppliedSecret = request.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? '';
	if (configuredSecret && timingSafeEqual(suppliedSecret, configuredSecret)) {
		return true;
	}

	const ip = request.headers.get('CF-Connecting-IP')?.trim();
	if (!ip) return false;
	return TELEGRAM_WEBHOOK_CIDRS.some(cidr => isIpInCidr(ip, cidr));
}

function base64Url(bytes: ArrayBuffer): string {
	let binary = '';
	for (const byte of new Uint8Array(bytes)) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function hmacSha256(secret: string, data: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
	return base64Url(signature);
}

function webGamePayload(userId: string, game: string, issuedAt: number): string {
	return `${game}\n${userId}\n${issuedAt}`;
}

export async function createWebGameAuth(
	env: GameAuthEnv,
	input: { userId: string; game: string; issuedAt?: number },
): Promise<string> {
	const issuedAt = input.issuedAt ?? Math.floor(Date.now() / 1000);
	return hmacSha256(env.TOKEN, webGamePayload(input.userId, input.game, issuedAt));
}

export async function verifyWebGameAuth(
	env: GameAuthEnv,
	input: { userId: string; game: string; issuedAt: number; auth: string; now?: number },
): Promise<boolean> {
	if (!input.userId || !input.game || !input.auth || !Number.isFinite(input.issuedAt)) {
		return false;
	}
	const now = input.now ?? Math.floor(Date.now() / 1000);
	if (input.issuedAt > now + 60) return false;
	if (now - input.issuedAt > WEB_GAME_AUTH_TTL_SECONDS) return false;

	const expected = await createWebGameAuth(env, {
		userId: input.userId,
		game: input.game,
		issuedAt: input.issuedAt,
	});
	return timingSafeEqual(input.auth, expected);
}

export async function getVerifiedWebGameUserId(
	request: Request,
	env: GameAuthEnv,
	game: string,
	body?: Record<string, unknown>,
): Promise<string | null> {
	const url = new URL(request.url);
	const userId = String(body?.userId ?? body?.user_id ?? url.searchParams.get('user_id') ?? '');
	const auth = String(body?.auth ?? url.searchParams.get('auth') ?? '');
	const issuedAt = Number(body?.auth_ts ?? body?.authTs ?? url.searchParams.get('auth_ts') ?? NaN);
	const ok = await verifyWebGameAuth(env, { userId, game, issuedAt, auth });
	return ok ? userId : null;
}
