import { describe, expect, it, vi } from 'vitest';
import { assessIssueForAutonomy, scanAutonomyIssues } from '../../src/lib/githubIssueMonitor';

function makeDb() {
	const calls: Array<{ sql: string; values: unknown[] }> = [];
	return {
		calls,
		prepare(sql: string) {
			return {
				run: async () => ({ success: true }),
				bind(...values: unknown[]) {
					calls.push({ sql, values });
					return { run: async () => ({ success: true }) };
				},
			};
		},
	} as any;
}

const readyIssue = {
	number: 17,
	title: 'Add configurable daily check-in',
	body: 'Add a per-group switch and a documented default behavior.',
	html_url: 'https://github.com/owner/repo/issues/17',
	user: { login: 'alice' },
	labels: [{ name: 'bot:ready' }, { name: 'enhancement' }],
	assignees: [],
	locked: false,
	comments: 0,
	created_at: '2026-07-01T00:00:00Z',
	updated_at: '2026-07-20T00:00:00Z',
};

describe('GitHub issue autonomy monitor', () => {
	it('blocks protected and already-owned work', () => {
		const protectedResult = assessIssueForAutonomy({
			...readyIssue,
			title: 'Rotate deployment token',
		}, new Set(), 17);
		const linkedResult = assessIssueForAutonomy(readyIssue, new Set([17]), 17);

		expect(protectedResult).toMatchObject({ eligible: false, riskLevel: 'high' });
		expect(protectedResult.reasons).toContain('protected-topic');
		expect(linkedResult.reasons).toContain('open-pr-linked');
	});

	it('selects the highest-scoring ready issue only when no suitable community PR exists', async () => {
		const db = makeDb();
		const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify([readyIssue]), { status: 200 }));
		const result = await scanAutonomyIssues({ DB: db, GITHUB_REPOSITORY: 'owner/repo' } as any, {
			prScanStatus: 'ok', suitableCommunityPullRequests: 0, linkedIssueNumbers: [],
		}, { fetchFn });

		expect(result).toMatchObject({ status: 'ok', openReadyIssues: 1, eligibleIssues: 1, selectedIssue: { number: 17 } });
		expect(fetchFn.mock.calls[0][0]).toContain('labels=bot%3Aready');
		const selection = db.calls.find((call: any) => call.sql.includes('INSERT INTO evolution_selection_runs'));
		expect(selection?.values).toContain('highest-scoring-ready-issue');
	});

	it('gives a suitable community PR priority over autonomous issue work', async () => {
		const db = makeDb();
		const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify([readyIssue]), { status: 200 }));
		const result = await scanAutonomyIssues({ DB: db, GITHUB_REPOSITORY: 'owner/repo' } as any, {
			prScanStatus: 'ok', suitableCommunityPullRequests: 1,
		}, { fetchFn });

		expect(result.selectedIssue).toBeNull();
		const selection = db.calls.find((call: any) => call.sql.includes('INSERT INTO evolution_selection_runs'));
		expect(selection?.values).toContain('suitable-community-pr-available');
	});
});
