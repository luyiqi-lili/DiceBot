import { describe, expect, it, vi } from 'vitest';
import { assessPullRequestRisk, scanOpenPullRequests } from '../../src/lib/githubPrMonitor';

function makeDb() {
	const calls: Array<{ sql: string; values: unknown[] }> = [];
	return {
		calls,
		prepare(sql: string) {
			return {
				bind(...values: unknown[]) {
					calls.push({ sql, values });
					return { run: async () => ({ success: true }) };
				},
			};
		},
		batch: async (statements: any[]) => Promise.all(statements.map((statement) => statement.run())),
	} as any;
}

describe('GitHub PR monitor', () => {
	it('skips safely without repository or D1 configuration', async () => {
		expect(await scanOpenPullRequests({} as any)).toMatchObject({ status: 'skipped' });
		expect(await scanOpenPullRequests({ GITHUB_REPOSITORY: 'owner/repo' } as any)).toMatchObject({ status: 'skipped' });
	});

	it('stores open PR snapshots and closes missing PRs after a successful scan', async () => {
		const db = makeDb();
		const fetchFn = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify([{
				number: 12,
				title: 'Update worker deployment',
				user: { login: 'alice' },
				head: { sha: 'abc123' },
				draft: false,
				updated_at: '2026-07-20T01:00:00Z',
				changed_files: 2,
				additions: 25,
				deletions: 4,
			}]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
			.mockResolvedValueOnce(new Response(JSON.stringify([
				{ filename: 'wrangler.jsonc', additions: 25, deletions: 4 },
				{ filename: 'src/index.ts', additions: 5, deletions: 1 },
			]), { status: 200, headers: { 'Content-Type': 'application/json' } }));

		const result = await scanOpenPullRequests({ DB: db, GITHUB_REPOSITORY: 'owner/repo', GITHUB_TOKEN: 'secret' } as any, { fetchFn });

		expect(result).toMatchObject({ status: 'ok', openPullRequests: 1 });
		expect(fetchFn).toHaveBeenCalledWith(
			'https://api.github.com/repos/owner/repo/pulls?state=open&per_page=100',
			expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer secret' }) }),
		);
		expect(db.calls.some((call: any) => call.sql.includes('INSERT INTO pull_request_snapshots'))).toBe(true);
		expect(db.calls.some((call: any) => call.sql.includes("SET state = 'closed'"))).toBe(true);
	});

	it('flags sensitive paths, large changes, and drafts deterministically', () => {
		expect(assessPullRequestRisk({
			draft: true,
			changedFiles: 30,
			additions: 1000,
			deletions: 50,
			paths: ['.github/workflows/deploy.yml', 'schema/d1.sql'],
		})).toEqual({ level: 'high', signals: ['draft', 'large-change', 'sensitive-path'] });
	});

	it('keeps every listed PR open when the detail scan limit is lower than the open PR count', async () => {
		const db = makeDb();
		const pulls = Array.from({ length: 3 }, (_, index) => ({
			number: index + 1,
			title: `PR ${index + 1}`,
			user: { login: 'alice' },
			head: { sha: `sha-${index + 1}` },
			draft: false,
			updated_at: '2026-07-20T01:00:00Z',
		}));
		const fetchFn = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify(pulls), { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

		const result = await scanOpenPullRequests({
			DB: db,
			GITHUB_REPOSITORY: 'owner/repo',
			GITHUB_PR_SCAN_LIMIT: '1',
		} as any, { fetchFn });

		expect(result).toMatchObject({ status: 'ok', openPullRequests: 3 });
		const snapshots = db.calls.filter((call: any) => call.sql.includes('INSERT INTO pull_request_snapshots'));
		expect(snapshots).toHaveLength(3);
		expect(snapshots[1].values).toContain('["details-not-scanned"]');
		expect(snapshots[1].values).toContain('high');
	});

	it('paginates the complete open PR list before reconciling closed state', async () => {
		const db = makeDb();
		const firstPage = Array.from({ length: 100 }, (_, index) => ({
			number: index + 1,
			title: `PR ${index + 1}`,
			user: { login: 'alice' },
			head: { sha: `sha-${index + 1}` },
			draft: false,
			updated_at: '2026-07-20T01:00:00Z',
		}));
		const lastPull = { ...firstPage[0], number: 101, title: 'PR 101', head: { sha: 'sha-101' } };
		const fetchFn = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify(firstPage), { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify([lastPull]), { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

		const result = await scanOpenPullRequests({
			DB: db,
			GITHUB_REPOSITORY: 'owner/repo',
			GITHUB_PR_SCAN_LIMIT: '1',
		} as any, { fetchFn });

		expect(result).toMatchObject({ status: 'ok', openPullRequests: 101 });
		expect(fetchFn).toHaveBeenNthCalledWith(2,
			'https://api.github.com/repos/owner/repo/pulls?state=open&per_page=100&page=2',
			expect.anything(),
		);
		expect(db.calls.filter((call: any) => call.sql.includes('INSERT INTO pull_request_snapshots'))).toHaveLength(101);
	});

	it('marks incomplete file data as high risk instead of low risk', async () => {
		const db = makeDb();
		const fetchFn = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify([{
				number: 7,
				title: 'Unknown files',
				user: { login: 'alice' },
				head: { sha: 'sha-7' },
				draft: false,
				updated_at: '2026-07-20T01:00:00Z',
			}]), { status: 200 }))
			.mockResolvedValueOnce(new Response('rate limited', { status: 429 }));

		await scanOpenPullRequests({ DB: db, GITHUB_REPOSITORY: 'owner/repo' } as any, { fetchFn });
		const snapshot = db.calls.find((call: any) => call.sql.includes('INSERT INTO pull_request_snapshots'))!;

		expect(snapshot.values).toContain('high');
		expect(snapshot.values).toContain('["github-api-partial"]');
	});
});
