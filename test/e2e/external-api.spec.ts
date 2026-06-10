import { describe, expect, it } from 'vitest';

const runE2E = process.env.RUN_E2E_EXTERNAL_API === '1';
const describeE2E = runE2E ? describe : describe.skip;

const workerBaseUrl = (process.env.WORKER_BASE_URL || 'https://telegram-bot.luyiqi-lili.workers.dev').replace(/\/+$/, '');
const externalApiKey = process.env.EXTERNAL_API_KEY || '';

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			return await fetch(url, init);
		} catch (err) {
			lastError = err;
			if (attempt < attempts) {
				await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
			}
		}
	}
	throw lastError;
}

describeE2E('external API E2E', () => {
	it('reads the configured coin balance with X-API-Key', async () => {
		expect(externalApiKey, 'EXTERNAL_API_KEY must be set for external API E2E').not.toBe('');

		const resp = await fetchWithRetry(`${workerBaseUrl}/api/coin/get?key=8080375150`, {
			headers: {
				'Content-Type': 'application/json',
				'X-API-Key': externalApiKey,
			},
		});
		const body = await resp.text();

		expect(resp.status).toBe(200);
		expect(body.trim()).toMatch(/^-?\d+$/);
	});
});
