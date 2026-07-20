import { describe, expect, it, vi } from 'vitest';
import { runAiIssueTriage } from '../../src/lib/aiIssueTriage';

function makeDb() {
	const calls: Array<{ sql: string; values: unknown[] }> = [];
	return {
		calls,
		prepare(sql: string) {
			return {
				run: async () => ({ success: true }),
				bind(...values: unknown[]) {
					calls.push({ sql, values });
					return {
						run: async () => ({ success: true }),
						all: async () => ({ results: [] }),
					};
				},
			};
		},
	} as any;
}

const issue = {
	number: 42,
	title: 'Add configurable greeting text',
	body: 'Allow each group to configure a greeting string, with a documented default and unit tests.',
	html_url: 'https://github.com/owner/repo/issues/42',
	labels: [{ name: 'enhancement' }],
	assignees: [],
	locked: false,
	comments: 0,
	state: 'open',
	created_at: '2026-07-01T00:00:00Z',
	updated_at: '2026-07-20T00:00:00Z',
};

const baseEnv = {
	DB: makeDb(),
	GITHUB_REPOSITORY: 'owner/repo',
	GITHUB_TOKEN: 'github-write-token',
	GITHUB_AUTONOMY_LABEL: 'bot:ready',
	GITHUB_AI_TRIAGE_ENABLED: 'true',
	GITHUB_AI_TRIAGE_MIN_CONFIDENCE: '0.85',
	DEEPSEEK_API_KEY: 'paid-deepseek-key',
} as any;

function paidBalance() {
	return new Response(JSON.stringify({
		is_available: true,
		balance_infos: [{ currency: 'USD', total_balance: '5', granted_balance: '0', topped_up_balance: '5' }],
	}), { status: 200 });
}

describe('AI issue triage', () => {
	it('adds bot:ready only after paid balance and a high-confidence premium decision', async () => {
		const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.includes('/issues?')) return new Response(JSON.stringify([issue]), { status: 200 });
			if (url.endsWith('/user/balance')) return paidBalance();
			if (url.endsWith('/chat/completions')) {
				return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
					approve: true, confidence: 0.94, risk: 'low', reason: 'Clear and testable low-risk feature.',
				}) } }] }), { status: 200 });
			}
			if (url.endsWith('/issues/42')) return new Response(JSON.stringify(issue), { status: 200 });
			if (url.endsWith('/issues/42/labels')) return new Response('[]', { status: 200 });
			throw new Error(`Unexpected request ${url} ${init?.method ?? 'GET'}`);
		});
		const db = makeDb();
		const result = await runAiIssueTriage({ ...baseEnv, DB: db }, {}, { fetchFn: fetchFn as typeof fetch });

		expect(result).toMatchObject({
			status: 'approved',
			issueNumber: 42,
			model: 'deepseek-v4-pro',
			credentialSource: 'worker-secret',
			paidBalanceVerified: true,
			confidence: 0.94,
		});
		const labelCall = fetchFn.mock.calls.find(([url]) => String(url).endsWith('/issues/42/labels'));
		expect(labelCall?.[1]?.method).toBe('POST');
		expect(JSON.parse(String(labelCall?.[1]?.body))).toEqual({ labels: ['bot:ready'] });
		expect((labelCall?.[1]?.headers as Record<string, string>).Authorization).toBe('Bearer github-write-token');
		expect(db.calls.some((call) => call.sql.includes('INSERT INTO ai_issue_triage_runs') && call.values.includes('approved'))).toBe(true);
	});

	it('does not approve when the credential only has free or granted credits', async () => {
		const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/issues?')) return new Response(JSON.stringify([issue]), { status: 200 });
			if (url.endsWith('/user/balance')) {
				return new Response(JSON.stringify({
					is_available: true,
					balance_infos: [{ currency: 'USD', total_balance: '5', granted_balance: '5', topped_up_balance: '0' }],
				}), { status: 200 });
			}
			throw new Error(`Free-only credential must not call inference or GitHub labels: ${url}`);
		});
		const result = await runAiIssueTriage({ ...baseEnv, DB: makeDb() }, {}, { fetchFn: fetchFn as typeof fetch });

		expect(result).toMatchObject({
			status: 'skipped',
			issueNumber: 42,
			paidBalanceVerified: false,
			reason: 'free-or-granted-balance-only',
		});
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	it('keeps free-only provider pools out of the approval path', async () => {
		const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify([issue]), { status: 200 }));
		const result = await runAiIssueTriage({
			...baseEnv,
			DB: makeDb(),
			DEEPSEEK_API_KEY: undefined,
			GOOGLE_API_KEY: 'free-gemini-key',
		}, {}, { fetchFn });

		expect(result).toMatchObject({ status: 'skipped', reason: 'no-premium-credential' });
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it('requires both low risk and the configured confidence threshold', async () => {
		const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/issues?')) return new Response(JSON.stringify([issue]), { status: 200 });
			if (url.endsWith('/user/balance')) return paidBalance();
			if (url.endsWith('/chat/completions')) {
				return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
					approve: true, confidence: 0.7, risk: 'low', reason: 'Not confident enough.',
				}) } }] }), { status: 200 });
			}
			throw new Error(`Rejected decision must not add a label: ${url}`);
		});
		const result = await runAiIssueTriage({ ...baseEnv, DB: makeDb() }, {}, { fetchFn: fetchFn as typeof fetch });

		expect(result).toMatchObject({ status: 'rejected', confidence: 0.7, paidBalanceVerified: true });
		expect(fetchFn).toHaveBeenCalledTimes(3);
	});

	it('abandons approval when the Issue changes after the model reviewed it', async () => {
		const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/issues?')) return new Response(JSON.stringify([issue]), { status: 200 });
			if (url.endsWith('/user/balance')) return paidBalance();
			if (url.endsWith('/chat/completions')) {
				return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
					approve: true, confidence: 0.97, risk: 'low', reason: 'Clear change.',
				}) } }] }), { status: 200 });
			}
			if (url.endsWith('/issues/42')) {
				return new Response(JSON.stringify({ ...issue, updated_at: '2026-07-20T00:01:00Z' }), { status: 200 });
			}
			throw new Error(`Changed Issue must not receive a label: ${url}`);
		});
		const result = await runAiIssueTriage({ ...baseEnv, DB: makeDb() }, {}, { fetchFn: fetchFn as typeof fetch });

		expect(result).toMatchObject({
			status: 'rejected',
			issueNumber: 42,
			paidBalanceVerified: true,
			reason: 'issue-changed-before-label',
		});
		expect(fetchFn).toHaveBeenCalledTimes(4);
	});

	it('blocks protected topics before spending any LLM balance', async () => {
		const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
			...issue,
			title: 'Rotate deployment token',
		}]), { status: 200 }));
		const result = await runAiIssueTriage({ ...baseEnv, DB: makeDb() }, {}, { fetchFn });

		expect(result).toMatchObject({ status: 'skipped', reason: 'no-eligible-unreviewed-issue' });
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});
});
