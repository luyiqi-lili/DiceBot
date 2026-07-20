import type { Env } from '../index';

type PrMonitorEnv = Pick<Env, 'DB' | 'GITHUB_REPOSITORY' | 'GITHUB_TOKEN' | 'GITHUB_PR_SCAN_LIMIT'>;

type GitHubPull = {
	number: number;
	title: string;
	user?: { login?: string };
	head: { sha: string };
	draft?: boolean;
	updated_at: string;
};

type GitHubFile = { filename: string; additions?: number; deletions?: number };

export type PullRequestRiskInput = {
	draft: boolean;
	changedFiles: number;
	additions: number;
	deletions: number;
	paths: string[];
};

const SENSITIVE_PATHS = [
	/^\.github\/workflows\//,
	/^schema\//,
	/^migrations?\//,
	/^wrangler(?:\.|$)/,
	/^src\/index\.ts$/,
	/^package(?:-lock)?\.json$/,
];

export function assessPullRequestRisk(input: PullRequestRiskInput): { level: 'low' | 'medium' | 'high'; signals: string[] } {
	const signals: string[] = [];
	if (input.draft) signals.push('draft');
	if (input.changedFiles >= 25 || input.additions + input.deletions >= 800) signals.push('large-change');
	if (input.paths.some((path) => SENSITIVE_PATHS.some((pattern) => pattern.test(path)))) signals.push('sensitive-path');
	const level = signals.includes('sensitive-path') || signals.includes('large-change') ? 'high' : signals.length ? 'medium' : 'low';
	return { level, signals };
}

function repositoryIsValid(repository: string): boolean {
	return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository);
}

function scanLimit(value?: string): number {
	const parsed = Number.parseInt(value ?? '', 10);
	return Number.isFinite(parsed) ? Math.min(50, Math.max(1, parsed)) : 20;
}

async function fetchAllPages<T>(
	fetchFn: typeof fetch,
	baseUrl: string,
	headers: Record<string, string>,
	maxPages: number,
): Promise<T[]> {
	const results: T[] = [];
	for (let page = 1; page <= maxPages; page += 1) {
		const separator = baseUrl.includes('?') ? '&' : '?';
		const url = page === 1 ? baseUrl : `${baseUrl}${separator}page=${page}`;
		const response = await fetchFn(url, { headers });
		if (!response.ok) throw new Error(`GitHub API returned HTTP ${response.status}`);
		const items = (await response.json()) as T[];
		results.push(...items);
		if (items.length < 100) return results;
	}
	throw new Error(`GitHub pagination exceeded ${maxPages} pages`);
}

export async function scanOpenPullRequests(
	env: PrMonitorEnv,
	options: { fetchFn?: typeof fetch } = {},
): Promise<{ status: 'ok' | 'skipped' | 'error'; openPullRequests?: number; reason?: string }> {
	if (!env.DB) return { status: 'skipped', reason: 'D1 is not configured' };
	if (!env.GITHUB_REPOSITORY || !repositoryIsValid(env.GITHUB_REPOSITORY)) {
		return { status: 'skipped', reason: 'GITHUB_REPOSITORY is not configured' };
	}

	const fetchFn = options.fetchFn ?? fetch;
	const repository = env.GITHUB_REPOSITORY;
	const runId = crypto.randomUUID();
	const headers: Record<string, string> = {
		Accept: 'application/vnd.github+json',
		'User-Agent': 'dicebot-pr-monitor',
		'X-GitHub-Api-Version': '2022-11-28',
	};
	if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;

	try {
		const pulls = await fetchAllPages<GitHubPull>(
			fetchFn,
			`https://api.github.com/repos/${repository}/pulls?state=open&per_page=100`,
			headers,
			20,
		);
		const detailLimit = scanLimit(env.GITHUB_PR_SCAN_LIMIT);

		for (const [index, pull] of pulls.entries()) {
			let files: GitHubFile[] = [];
			let incompleteSignal: 'details-not-scanned' | 'github-api-partial' | null = null;
			if (index < detailLimit) {
				try {
					files = await fetchAllPages<GitHubFile>(
						fetchFn,
						`https://api.github.com/repos/${repository}/pulls/${pull.number}/files?per_page=100`,
						headers,
						30,
					);
				} catch {
					incompleteSignal = 'github-api-partial';
				}
			} else {
				incompleteSignal = 'details-not-scanned';
			}

			const additions = files.reduce((sum, file) => sum + (file.additions ?? 0), 0);
			const deletions = files.reduce((sum, file) => sum + (file.deletions ?? 0), 0);
			const risk = assessPullRequestRisk({
				draft: Boolean(pull.draft),
				changedFiles: files.length,
				additions,
				deletions,
				paths: files.map((file) => file.filename),
			});
			if (incompleteSignal) {
				risk.signals.push(incompleteSignal);
				risk.level = 'high';
			}

			await env.DB.prepare(
				`INSERT INTO pull_request_snapshots
				(repository, pr_number, title, author, head_sha, state, is_draft, changed_files, additions, deletions,
				 risk_level, risk_signals_json, github_updated_at, last_seen_run_id, checked_at)
				VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
				ON CONFLICT(repository, pr_number) DO UPDATE SET
				 title = excluded.title, author = excluded.author, head_sha = excluded.head_sha, state = 'open',
				 is_draft = excluded.is_draft, changed_files = excluded.changed_files, additions = excluded.additions,
				 deletions = excluded.deletions, risk_level = excluded.risk_level,
				 risk_signals_json = excluded.risk_signals_json, github_updated_at = excluded.github_updated_at,
				 last_seen_run_id = excluded.last_seen_run_id, checked_at = excluded.checked_at`,
			).bind(
				repository, pull.number, pull.title.slice(0, 500), pull.user?.login ?? '', pull.head.sha,
				pull.draft ? 1 : 0, files.length, additions, deletions, risk.level, JSON.stringify(risk.signals),
				pull.updated_at, runId,
			).run();
		}

		await env.DB.prepare(
			"UPDATE pull_request_snapshots SET state = 'closed', checked_at = datetime('now') WHERE repository = ? AND state = 'open' AND last_seen_run_id != ?",
		).bind(repository, runId).run();
		await env.DB.prepare(
			"INSERT INTO pr_monitor_runs (id, repository, status, open_pr_count, checked_at) VALUES (?, ?, 'ok', ?, datetime('now'))",
		).bind(runId, repository, pulls.length).run();

		console.log('[pr-monitor] scan complete', { repository, openPullRequests: pulls.length, detailScanned: Math.min(pulls.length, detailLimit) });
		return { status: 'ok', openPullRequests: pulls.length };
	} catch (error) {
		const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown GitHub scan error';
		try {
			await env.DB.prepare(
				"INSERT INTO pr_monitor_runs (id, repository, status, error_summary, checked_at) VALUES (?, ?, 'error', ?, datetime('now'))",
			).bind(runId, repository, message).run();
		} catch (storageError) {
			console.error('[pr-monitor] failed to store error result', {
				repository,
				error: storageError instanceof Error ? storageError.message.slice(0, 300) : 'Unknown D1 error',
			});
		}
		console.error('[pr-monitor] scan failed', { repository, error: message });
		return { status: 'error', reason: message };
	}
}
