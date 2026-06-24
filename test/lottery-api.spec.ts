import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

function makeEnv(stub: { fetch: ReturnType<typeof vi.fn> }) {
	return {
		EXTERNAL_API_KEY: 'secret',
		LOTTERY_DO: {
			idFromName: vi.fn(() => 'lottery-id'),
			get: vi.fn(() => stub),
		},
	} as any;
}

describe('lottery external API', () => {
	it('forwards authenticated lottery state reads to LotteryDO', async () => {
		const stub = {
			fetch: vi.fn(async () => new Response(JSON.stringify({ pool: 4709 }), {
				headers: { 'Content-Type': 'application/json' },
			})),
		};
		const env = makeEnv(stub);
		const request = new IncomingRequest('http://example.com/api/lottery/debug-state', {
			headers: { 'X-API-Key': 'secret' },
		});
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		const body = await response.json() as any;

		expect(response.status).toBe(200);
		expect(body.pool).toBe(4709);
		expect(env.LOTTERY_DO.idFromName).toHaveBeenCalledWith('lottery');
		expect(stub.fetch).toHaveBeenCalledWith(expect.objectContaining({
			url: 'http://example.com/debug-state',
			method: 'GET',
		}));
	});

	it('keeps lottery recovery API behind the external API key', async () => {
		const stub = { fetch: vi.fn() };
		const response = await worker.fetch(
			new IncomingRequest('http://example.com/api/lottery/debug-state'),
			makeEnv(stub),
			createExecutionContext(),
		);

		expect(response.status).toBe(401);
		expect(stub.fetch).not.toHaveBeenCalled();
	});
});
