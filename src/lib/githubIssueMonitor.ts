import type { Env } from '../index';

type IssueMonitorEnv = Pick<
	Env,
	'DB' | 'GITHUB_REPOSITORY' | 'GITHUB_TOKEN' | 'GITHUB_AUTONOMY_LABEL' | 'GITHUB_ISSUE_SCAN_LIMIT'
>;

type GitHubIssue = {
	number: number;
	title: string;
	body?: string | null;
	html_url: string;
	user?: { login?: string };
	labels?: Array<string | { name?: string }>;
	assignee?: { login?: string } | null;
	assignees?: Array<{ login?: string }>;
	locked?: boolean;
	comments?: number;
	created_at: string;
	updated_at: string;
	pull_request?: unknown;
};

export type IssueCandidate = { number: number; title: string; url: string; score: number };

export type IssueMonitorResult = {
	status: 'ok' | 'skipped' | 'error';
	openReadyIssues?: number;
	eligibleIssues?: number;
	selectedIssue?: IssueCandidate | null;
	reason?: string;
};

const PROTECTED_TOPIC = /\b(?:auth(?:entication|orization)?|billing|payment|wallet|secret|token|credential|permission|workflow|deploy(?:ment)?|schema|migration|encryption|security)\b|鉴权|支付|资金|钱包|密钥|令牌|凭据|权限|工作流|部署|数据库迁移|加密|安全/iu;

function repositoryIsValid(repository: string): boolean {
	return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository);
}

function labelName(label: string | { name?: string }): string {
	return typeof label === 'string' ? label : label.name ?? '';
}

function scanLimit(raw: string | undefined): number {
	const parsed = Number.parseInt(raw ?? '', 10);
	return Number.isFinite(parsed) ? Math.min(500, Math.max(1, parsed)) : 100;
}

export function assessIssueForAutonomy(
	issue: Pick<GitHubIssue, 'title' | 'body' | 'labels' | 'assignee' | 'assignees' | 'locked' | 'comments' | 'created_at'>,
	linkedIssueNumbers: ReadonlySet<number>,
	issueNumber: number,
): { eligible: boolean; score: number; reasons: string[]; riskLevel: 'low' | 'high' } {
	const reasons: string[] = [];
	const body = String(issue.body ?? '').trim();
	const labels = (issue.labels ?? []).map(labelName).map((value) => value.toLowerCase());
	if (linkedIssueNumbers.has(issueNumber)) reasons.push('open-pr-linked');
	if (issue.locked) reasons.push('locked');
	if (issue.assignee || (issue.assignees?.length ?? 0) > 0) reasons.push('assigned');
	if (body.length < 20) reasons.push('insufficient-detail');
	if (PROTECTED_TOPIC.test(`${issue.title}\n${body}`)) reasons.push('protected-topic');
	if (labels.some((label) => ['bot:blocked', 'security', 'dependencies'].includes(label))) reasons.push('blocked-label');

	let score = 100;
	if (labels.includes('priority:high')) score += 30;
	if (labels.includes('bug')) score += 15;
	if (labels.includes('good first issue')) score += 5;
	score += Math.min(20, Math.floor(body.length / 250));
	score -= Math.min(20, Number(issue.comments ?? 0) * 2);
	const createdAt = new Date(issue.created_at).getTime();
	const ageDays = Number.isFinite(createdAt) ? Math.max(0, Math.floor((Date.now() - createdAt) / 86_400_000)) : 0;
	score += Math.min(15, ageDays);
	return {
		eligible: reasons.length === 0,
		score,
		reasons,
		riskLevel: reasons.includes('protected-topic') || reasons.includes('blocked-label') ? 'high' : 'low',
	};
}

export async function ensureIssueMonitorTables(db: D1Database): Promise<void> {
	await db.prepare(`
		CREATE TABLE IF NOT EXISTS github_issue_snapshots (
			repository TEXT NOT NULL,
			issue_number INTEGER NOT NULL,
			title TEXT NOT NULL,
			body TEXT NOT NULL DEFAULT '',
			url TEXT NOT NULL,
			author TEXT NOT NULL DEFAULT '',
			labels_json TEXT NOT NULL DEFAULT '[]',
			state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'not_ready')),
			eligible INTEGER NOT NULL DEFAULT 0,
			candidate_score INTEGER NOT NULL DEFAULT 0,
			risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'high')),
			eligibility_reasons_json TEXT NOT NULL DEFAULT '[]',
			github_created_at TEXT NOT NULL,
			github_updated_at TEXT NOT NULL,
			last_seen_run_id TEXT NOT NULL,
			checked_at TEXT NOT NULL DEFAULT (datetime('now')),
			PRIMARY KEY (repository, issue_number)
		)
	`).run();
	await db.prepare(`
		CREATE INDEX IF NOT EXISTS idx_github_issue_snapshots_candidates
		ON github_issue_snapshots (repository, state, eligible, candidate_score, checked_at)
	`).run();
	await db.prepare(`
		CREATE TABLE IF NOT EXISTS evolution_selection_runs (
			id TEXT PRIMARY KEY,
			repository TEXT NOT NULL,
			status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
			pr_scan_status TEXT NOT NULL,
			suitable_pr_count INTEGER,
			ready_issue_count INTEGER,
			eligible_issue_count INTEGER,
			selected_issue_number INTEGER,
			selection_reason TEXT,
			error_summary TEXT,
			checked_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`).run();
}

async function fetchReadyIssues(
	fetchFn: typeof fetch,
	repository: string,
	label: string,
	headers: Record<string, string>,
	limit: number,
): Promise<GitHubIssue[]> {
	const issues: GitHubIssue[] = [];
	for (let page = 1; issues.length < limit && page <= 10; page += 1) {
		const query = new URLSearchParams({
			state: 'open',
			labels: label,
			sort: 'updated',
			direction: 'desc',
			per_page: '100',
			page: String(page),
		});
		const response = await fetchFn(`https://api.github.com/repos/${repository}/issues?${query}`, { headers });
		if (!response.ok) throw new Error(`GitHub API returned HTTP ${response.status}`);
		const pageItems = await response.json() as GitHubIssue[];
		issues.push(...pageItems.filter((item) => !item.pull_request));
		if (pageItems.length < 100) break;
	}
	return issues.slice(0, limit);
}

export async function scanAutonomyIssues(
	env: IssueMonitorEnv,
	input: {
		prScanStatus: 'ok' | 'skipped' | 'error';
		suitableCommunityPullRequests?: number;
		linkedIssueNumbers?: readonly number[];
	},
	options: { fetchFn?: typeof fetch } = {},
): Promise<IssueMonitorResult> {
	if (!env.DB) return { status: 'skipped', reason: 'D1 is not configured' };
	if (!env.GITHUB_REPOSITORY || !repositoryIsValid(env.GITHUB_REPOSITORY)) {
		return { status: 'skipped', reason: 'GITHUB_REPOSITORY is not configured' };
	}
	const repository = env.GITHUB_REPOSITORY;
	const runId = crypto.randomUUID();
	const label = env.GITHUB_AUTONOMY_LABEL?.trim() || 'bot:ready';
	const headers: Record<string, string> = {
		Accept: 'application/vnd.github+json',
		'User-Agent': 'dicebot-issue-monitor',
		'X-GitHub-Api-Version': '2022-11-28',
	};
	if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;

	try {
		await ensureIssueMonitorTables(env.DB);
		const issues = await fetchReadyIssues(options.fetchFn ?? fetch, repository, label, headers, scanLimit(env.GITHUB_ISSUE_SCAN_LIMIT));
		const linked = new Set(input.linkedIssueNumbers ?? []);
		const candidates: IssueCandidate[] = [];
		for (const issue of issues) {
			const assessment = assessIssueForAutonomy(issue, linked, issue.number);
			if (assessment.eligible) candidates.push({ number: issue.number, title: issue.title, url: issue.html_url, score: assessment.score });
			await env.DB.prepare(`
				INSERT INTO github_issue_snapshots
				(repository, issue_number, title, body, url, author, labels_json, state, eligible, candidate_score,
				 risk_level, eligibility_reasons_json, github_created_at, github_updated_at, last_seen_run_id, checked_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, datetime('now'))
				ON CONFLICT(repository, issue_number) DO UPDATE SET
				 title = excluded.title, body = excluded.body, url = excluded.url, author = excluded.author,
				 labels_json = excluded.labels_json, state = 'open', eligible = excluded.eligible,
				 candidate_score = excluded.candidate_score, risk_level = excluded.risk_level,
				 eligibility_reasons_json = excluded.eligibility_reasons_json,
				 github_created_at = excluded.github_created_at, github_updated_at = excluded.github_updated_at,
				 last_seen_run_id = excluded.last_seen_run_id, checked_at = excluded.checked_at
			`).bind(
				repository, issue.number, issue.title.slice(0, 500), String(issue.body ?? '').slice(0, 20_000), issue.html_url,
				issue.user?.login ?? '', JSON.stringify((issue.labels ?? []).map(labelName)), assessment.eligible ? 1 : 0,
				assessment.score, assessment.riskLevel, JSON.stringify(assessment.reasons), issue.created_at, issue.updated_at, runId,
			).run();
		}
		await env.DB.prepare(`
			UPDATE github_issue_snapshots SET state = 'not_ready', eligible = 0, checked_at = datetime('now')
			WHERE repository = ? AND state = 'open' AND last_seen_run_id != ?
		`).bind(repository, runId).run();

		candidates.sort((left, right) => right.score - left.score || left.number - right.number);
		let selectedIssue: IssueCandidate | null = null;
		let selectionReason = 'no-eligible-issue';
		if (input.prScanStatus !== 'ok') selectionReason = 'pr-scan-unavailable';
		else if ((input.suitableCommunityPullRequests ?? 0) > 0) selectionReason = 'suitable-community-pr-available';
		else if (candidates.length > 0) {
			selectedIssue = candidates[0];
			selectionReason = 'highest-scoring-ready-issue';
		}
		await env.DB.prepare(`
			INSERT INTO evolution_selection_runs
			(id, repository, status, pr_scan_status, suitable_pr_count, ready_issue_count,
			 eligible_issue_count, selected_issue_number, selection_reason, checked_at)
			VALUES (?, ?, 'ok', ?, ?, ?, ?, ?, ?, datetime('now'))
		`).bind(
			runId, repository, input.prScanStatus, input.suitableCommunityPullRequests ?? null,
			issues.length, candidates.length, selectedIssue?.number ?? null, selectionReason,
		).run();
		console.log('[issue-monitor] scan complete', {
			repository,
			readyIssues: issues.length,
			eligibleIssues: candidates.length,
			selectedIssue: selectedIssue?.number ?? null,
			selectionReason,
		});
		return { status: 'ok', openReadyIssues: issues.length, eligibleIssues: candidates.length, selectedIssue };
	} catch (error) {
		const reason = error instanceof Error ? error.message.slice(0, 500) : 'Unknown GitHub issue scan error';
		try {
			await ensureIssueMonitorTables(env.DB);
			await env.DB.prepare(`
				INSERT INTO evolution_selection_runs
				(id, repository, status, pr_scan_status, suitable_pr_count, error_summary, checked_at)
				VALUES (?, ?, 'error', ?, ?, ?, datetime('now'))
			`).bind(runId, repository, input.prScanStatus, input.suitableCommunityPullRequests ?? null, reason).run();
		} catch {
			// The original error remains the useful one; do not leak DB details.
		}
		console.error('[issue-monitor] scan failed', { repository, reason });
		return { status: 'error', reason };
	}
}
