import { describe, expect, it, vi } from 'vitest';
import { isMeaningfulFeatureRequest, submitFeatureRequestAsIssue } from '../../src/lib/githubIssueIntake';

function makeDb(options: { duplicate?: boolean; recent?: string } = {}) {
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
						first: async () => {
							if (sql.includes('body_fingerprint') && options.duplicate) {
								return { issue_number: 8, issue_url: 'https://github.com/owner/repo/issues/8', issue_title: 'existing' };
							}
							if (sql.includes('source_chat_id') && options.recent) return { created_at: options.recent };
							return null;
						},
					};
				},
			};
		},
	} as any;
}

const env = {
	DB: makeDb(),
	GITHUB_REPOSITORY: 'owner/repo',
	GITHUB_ISSUE_TOKEN: 'issue-write-token',
	GITHUB_ISSUE_INTAKE_ENABLED: 'true',
};

describe('GitHub issue intake', () => {
	it('rejects vague requests before calling GitHub', () => {
		expect(isMeaningfulFeatureRequest('测试')).toBe(false);
		expect(isMeaningfulFeatureRequest('增加可配置的签到奖励')).toBe(true);
	});

	it('creates a privacy-preserving public issue and stores the private mapping in D1', async () => {
		const db = makeDb();
		const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			number: 42,
			html_url: 'https://github.com/owner/repo/issues/42',
			title: '[Telegram 需求] 增加每日签到奖励',
		}), { status: 201 }));
		const result = await submitFeatureRequestAsIssue({ ...env, DB: db }, {
			body: '增加每日签到奖励 @maintainer',
			chatId: -100123,
			userId: 456,
		}, { fetchFn });

		expect(result).toMatchObject({ status: 'created', number: 42 });
		const request = fetchFn.mock.calls[0][1];
		expect(request.headers.Authorization).toBe('Bearer issue-write-token');
		const payload = JSON.parse(request.body);
		expect(payload.body).toContain('@\u200bmaintainer');
		expect(payload.body).not.toContain('-100123');
		expect(payload.body).not.toContain('456');
		expect(payload.body).toContain('bot:ready');
		expect(db.calls.some((call: any) => call.sql.includes('INSERT INTO github_issue_submissions'))).toBe(true);
	});

	it('returns an existing issue for a recent duplicate without another write', async () => {
		const fetchFn = vi.fn();
		const result = await submitFeatureRequestAsIssue({ ...env, DB: makeDb({ duplicate: true }) }, {
			body: '增加每日签到奖励', chatId: 1, userId: 2,
		}, { fetchFn });

		expect(result).toMatchObject({ status: 'duplicate', number: 8 });
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('is fail-closed until the write path is explicitly enabled', async () => {
		const result = await submitFeatureRequestAsIssue({ ...env, GITHUB_ISSUE_INTAKE_ENABLED: 'false' }, {
			body: '增加每日签到奖励', chatId: 1, userId: 2,
		});
		expect(result).toMatchObject({ status: 'skipped' });
	});

	it('reuses the existing Worker GitHub token without creating a duplicate secret', async () => {
		const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			number: 43,
			html_url: 'https://github.com/owner/repo/issues/43',
			title: '[Telegram 需求] 增加群组签到开关',
		}), { status: 201 }));
		await submitFeatureRequestAsIssue({
			...env,
			DB: makeDb(),
			GITHUB_ISSUE_TOKEN: undefined,
			GITHUB_TOKEN: 'existing-worker-token',
		}, { body: '增加一个群组签到开关', chatId: 1, userId: 2 }, { fetchFn });

		expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe('Bearer existing-worker-token');
	});
});
