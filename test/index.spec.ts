import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('DiceBot Worker — 基础请求处理', () => {
	it('GET 请求返回存活确认 "I am alive"', async () => {
		const request = new IncomingRequest('http://example.com');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		const text = await response.text();
		expect(response.status).toBe(200);
		expect(text).toBe('I am alive');
	});

	it('POST 到根路径返回存活确认', async () => {
		// POST 到非 /web/ 非 /api/ 路径，无 body 或空 body 会返回 "I am alive"
		// 因为 handler 在识别为非 POST 之前会先检查 Web/API 路径
		// 但 POST 会先尝试解析 JSON
		const request = new IncomingRequest('http://example.com', {
			method: 'POST',
			headers: { 'CF-Connecting-IP': '149.154.160.1' },
			body: 'not json',
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		// 非法的 JSON 会返回 400
		expect(response.status).toBe(400);
	});

	it('拒绝非 Telegram 来源的 webhook POST', async () => {
		const request = new IncomingRequest('http://example.com', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'CF-Connecting-IP': '203.0.113.10',
			},
			body: JSON.stringify({ message: { chat: { id: -1002742074355 }, text: '/help' } }),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(403);
	});

	it('拒绝未提供 API key 的外部 API 请求', async () => {
		const response = await worker.fetch(new IncomingRequest('http://example.com/api/health'), env, createExecutionContext());

		expect(response.status).toBe(401);
	});

	it('API key 捐赠入口不接受普通外部 API key 代替专用 bearer token', async () => {
		const request = new IncomingRequest('https://example.com/api/donations/api-keys', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-API-Key': 'external-key',
			},
			body: JSON.stringify({ provider: 'openai', apiKey: 'sk-test-value' }),
		});
		const response = await worker.fetch(request, { ...env, EXTERNAL_API_KEY: 'external-key', DONATION_INTAKE_KEY: 'donation-key' } as any, createExecutionContext());

		expect(response.status).toBe(401);
	});

	it('Web 页面 /web/hello 返回 HTML 页面', async () => {
		const request = new IncomingRequest('http://example.com/web/hello');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		const ct = response.headers.get('Content-Type');
		expect(ct).toContain('text/html');
	});
});
