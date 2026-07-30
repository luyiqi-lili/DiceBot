import { describe, expect, it, vi } from 'vitest';
import { runWorkersAiIssueTriage, WORKERS_AI_TRIAGE_MODEL } from '../../src/lib/workersAiIssueTriage';

const issue = {
	number: 42, title: 'Add configurable greeting text',
	body: 'Allow each group to configure a greeting string, with a documented default and unit tests.',
	labels: [{ name: 'enhancement' }], assignees: [], locked: false, comments: 0,
	state: 'open', created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-20T00:00:00Z',
};

function makeDb() {
	const calls: Array<{ sql: string; values: unknown[] }> = [];
	return { calls, prepare(sql: string) { return {
		run: async () => ({ success: true }),
		bind(...values: unknown[]) { calls.push({ sql, values }); return { run: async () => ({ success: true }), all: async () => ({ results: [] }) }; },
	}; } } as any;
}

describe('Workers AI Issue triage', () => {
	it('records through AI Gateway and labels only a high-confidence low-risk Issue', async () => {
		const run = vi.fn().mockResolvedValue({ response: JSON.stringify({ approve: true, confidence: 0.94, risk: 'low', reason: 'Clear and testable low-risk feature.' }) });
		const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/issues?')) return new Response(JSON.stringify([issue]), { status: 200 });
			if (url.endsWith('/issues/42')) return new Response(JSON.stringify(issue), { status: 200 });
			if (url.endsWith('/issues/42/labels')) return new Response('[]', { status: 200 });
			throw new Error(`Unexpected request ${url}`);
		});
		const db = makeDb();
		const result = await runWorkersAiIssueTriage({
			DB: db, AI: { run }, AI_GATEWAY_ID: 'default', GITHUB_REPOSITORY: 'owner/repo', GITHUB_TOKEN: 'github-write-token',
			GITHUB_AUTONOMY_LABEL: 'bot:ready', GITHUB_AI_TRIAGE_ENABLED: 'true', GITHUB_AI_TRIAGE_MIN_CONFIDENCE: '0.85',
		} as any, {}, { fetchFn: fetchFn as typeof fetch });

		expect(result).toMatchObject({ status: 'approved', provider: 'workers-ai', model: WORKERS_AI_TRIAGE_MODEL, confidence: 0.94, paidBalanceVerified: false });
		expect(run).toHaveBeenCalledWith(WORKERS_AI_TRIAGE_MODEL, expect.objectContaining({ max_tokens: 320 }), expect.objectContaining({ gateway: expect.objectContaining({ id: 'default', skipCache: true }) }));
		const labelCall = fetchFn.mock.calls.find(([url]) => String(url).endsWith('/issues/42/labels'));
		expect(JSON.parse(String(labelCall?.[1]?.body))).toEqual({ labels: ['bot:ready'] });
		expect(db.calls.some((call) => call.sql.includes('INSERT INTO ai_issue_triage_runs') && call.values.includes('approved'))).toBe(true);
	});

	it('prefers a donated Ollama Cloud large model and does not spend Workers AI quota', async () => {
		const calls: Array<{ sql: string; values: unknown[] }> = [];
		const db = {
			calls,
			prepare(sql: string) {
				const all = async () => ({
					results: sql.includes("d.provider = 'ollama-cloud'")
						? [{
							id: 'ollama-donation',
							gateway_alias: 'ollama-alias',
							available_models_json: JSON.stringify(['gpt-oss:20b', 'gpt-oss:120b']),
						}]
						: [],
				});
				return {
					all,
					run: async () => ({ success: true }),
					bind(...values: unknown[]) {
						calls.push({ sql, values });
						return { all, run: async () => ({ success: true }) };
					},
				};
			},
		} as any;
		const run = vi.fn();
		const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/issues?')) return new Response(JSON.stringify([issue]), { status: 200 });
			if (url.endsWith('/v1/chat/completions')) {
				return new Response(JSON.stringify({
					choices: [{
						message: { content: JSON.stringify({ approve: true, confidence: 0.96, risk: 'low', reason: 'Safe.' }) },
					}],
				}), { status: 200 });
			}
			if (url.endsWith('/issues/42')) return new Response(JSON.stringify(issue), { status: 200 });
			if (url.endsWith('/issues/42/labels')) return new Response('[]', { status: 200 });
			throw new Error(`Unexpected request ${url}`);
		});
		const result = await runWorkersAiIssueTriage({
			DB: db,
			AI: {
				run,
				gateway: vi.fn().mockReturnValue({ getUrl: vi.fn().mockResolvedValue('https://gateway.example/custom-ollama-cloud') }),
			},
			AI_GATEWAY_TOKEN: 'gateway-run-token',
			GITHUB_REPOSITORY: 'owner/repo',
			GITHUB_TOKEN: 'github-write-token',
			GITHUB_AI_TRIAGE_ENABLED: 'true',
		} as any, {}, { fetchFn: fetchFn as typeof fetch });

		expect(result).toMatchObject({
			status: 'approved',
			provider: 'ollama-cloud',
			model: 'gpt-oss:120b',
			credentialSource: 'donated-gateway',
			donationId: 'ollama-donation',
		});
		expect(run).not.toHaveBeenCalled();
	});
});
