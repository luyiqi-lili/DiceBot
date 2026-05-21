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
			body: 'not json',
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		// 非法的 JSON 会返回 400
		expect(response.status).toBe(400);
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
