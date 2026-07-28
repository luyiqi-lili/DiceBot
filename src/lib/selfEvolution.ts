import type { Env } from '../index';
import { refreshOneSharedCredential } from './apiKeyDonations';
import { ensureAiIssueTriageTable } from './aiIssueTriage';
import { runWorkersAiIssueTriage } from './workersAiIssueTriage';
import { ensureIssueMonitorTables, scanAutonomyIssues } from './githubIssueMonitor';
import { scanOpenPullRequests } from './githubPrMonitor';

export async function runSelfEvolutionReview(env: Env) {
	const pullRequests = await scanOpenPullRequests(env);
	const credentialHealthPromise = refreshOneSharedCredential(env).catch((error) => ({
		status: 'error' as const,
		reason: error instanceof Error ? error.message.slice(0, 200) : 'Credential health check failed',
	}));
	const aiTriage = await runWorkersAiIssueTriage(env, {
		linkedIssueNumbers: pullRequests.linkedIssueNumbers,
	});
	const issues = await scanAutonomyIssues(env, {
		prScanStatus: pullRequests.status,
		suitableCommunityPullRequests: pullRequests.suitableCommunityPullRequests,
		linkedIssueNumbers: pullRequests.linkedIssueNumbers,
	});
	const credentialHealth = await credentialHealthPromise;
	return { pullRequests, aiTriage, issues, credentialHealth };
}

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
	});
}

export async function handleSelfEvolutionApi(request: Request, env: Pick<Env, 'DB' | 'GITHUB_REPOSITORY'>): Promise<Response> {
	if (request.method !== 'GET') return json({ error: 'Method Not Allowed' }, 405);
	if (!env.DB || !env.GITHUB_REPOSITORY) return json({ error: 'Self-evolution storage is not configured' }, 503);
	await Promise.all([ensureIssueMonitorTables(env.DB), ensureAiIssueTriageTable(env.DB)]);
	const latest = await env.DB.prepare(`
		SELECT id, status, pr_scan_status, suitable_pr_count, ready_issue_count, eligible_issue_count,
			selected_issue_number, selection_reason, error_summary, checked_at
		FROM evolution_selection_runs
		WHERE repository = ? ORDER BY checked_at DESC LIMIT 1
	`).bind(env.GITHUB_REPOSITORY).first<Record<string, unknown>>();
	const latestTriage = await env.DB.prepare(`
		SELECT status, issue_number, issue_updated_at, provider, model, credential_source,
			paid_balance_verified, confidence, decision_reason, error_summary, checked_at
		FROM ai_issue_triage_runs
		WHERE repository = ? ORDER BY checked_at DESC LIMIT 1
	`).bind(env.GITHUB_REPOSITORY).first<Record<string, unknown>>();
	if (!latest) return json({ run: null, candidate: null, aiTriage: latestTriage ?? null });
	let candidate: Record<string, unknown> | null = null;
	if (typeof latest.selected_issue_number === 'number') {
		candidate = await env.DB.prepare(`
			SELECT issue_number, title, body, url, author, labels_json, candidate_score,
				risk_level, eligibility_reasons_json, github_updated_at, checked_at
			FROM github_issue_snapshots WHERE repository = ? AND issue_number = ? LIMIT 1
		`).bind(env.GITHUB_REPOSITORY, latest.selected_issue_number).first<Record<string, unknown>>();
	}
	return json({ run: latest, candidate, aiTriage: latestTriage ?? null });
}

/**
 * Read-only production diagnostic for the Worker-held GitHub token. The route
 * is protected by the outer EXTERNAL_API_KEY check in index.ts and deliberately
 * never returns the token or invokes a mutating GitHub endpoint.
 */
export async function handleGithubTokenHealthApi(
	request: Request,
	env: Pick<Env, 'GITHUB_REPOSITORY' | 'GITHUB_TOKEN'>,
	options: { fetchFn?: typeof fetch } = {},
): Promise<Response> {
	if (request.method !== 'GET') return json({ error: 'Method Not Allowed' }, 405);
	if (!env.GITHUB_TOKEN) return json({ authenticated: false, error: 'GitHub token is not configured' }, 503);
	if (!env.GITHUB_REPOSITORY || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_REPOSITORY)) {
		return json({ authenticated: false, error: 'GitHub repository is not configured' }, 503);
	}
	try {
		const response = await (options.fetchFn ?? fetch)(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}`, {
			signal: AbortSignal.timeout(10_000),
			headers: {
				Accept: 'application/vnd.github+json',
				Authorization: `Bearer ${env.GITHUB_TOKEN}`,
				'User-Agent': 'dicebot-github-token-health',
				'X-GitHub-Api-Version': '2022-11-28',
			},
		});
		if (!response.ok) return json({ authenticated: false, repositoryAccessible: false, error: `github_http_${response.status}` }, 502);
		const payload = await response.json() as { permissions?: { pull?: unknown; push?: unknown; admin?: unknown } };
		const pull = payload.permissions?.pull === true;
		const push = payload.permissions?.push === true;
		const admin = payload.permissions?.admin === true;
		return json({
			authenticated: true,
			repository: env.GITHUB_REPOSITORY,
			repositoryAccessible: true,
			permissions: { pull, push, admin },
			canReadPullRequests: pull || push || admin,
			canMergePullRequests: push || admin,
			checkedAt: new Date().toISOString(),
		});
	} catch {
		return json({ authenticated: false, repositoryAccessible: false, error: 'github_request_failed' }, 502);
	}
}
