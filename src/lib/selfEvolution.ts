import type { Env } from '../index';
import { refreshOneSharedCredential } from './apiKeyDonations';
import { ensureIssueMonitorTables, scanAutonomyIssues } from './githubIssueMonitor';
import { scanOpenPullRequests } from './githubPrMonitor';

export async function runSelfEvolutionReview(env: Env) {
	const pullRequests = await scanOpenPullRequests(env);
	const [issues, credentialHealth] = await Promise.all([
		scanAutonomyIssues(env, {
			prScanStatus: pullRequests.status,
			suitableCommunityPullRequests: pullRequests.suitableCommunityPullRequests,
			linkedIssueNumbers: pullRequests.linkedIssueNumbers,
		}),
		refreshOneSharedCredential(env).catch((error) => ({
			status: 'error' as const,
			reason: error instanceof Error ? error.message.slice(0, 200) : 'Credential health check failed',
		})),
	]);
	return { pullRequests, issues, credentialHealth };
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
	await ensureIssueMonitorTables(env.DB);
	const latest = await env.DB.prepare(`
		SELECT id, status, pr_scan_status, suitable_pr_count, ready_issue_count, eligible_issue_count,
			selected_issue_number, selection_reason, error_summary, checked_at
		FROM evolution_selection_runs
		WHERE repository = ? ORDER BY checked_at DESC LIMIT 1
	`).bind(env.GITHUB_REPOSITORY).first<Record<string, unknown>>();
	if (!latest) return json({ run: null, candidate: null });
	let candidate: Record<string, unknown> | null = null;
	if (typeof latest.selected_issue_number === 'number') {
		candidate = await env.DB.prepare(`
			SELECT issue_number, title, body, url, author, labels_json, candidate_score,
				risk_level, eligibility_reasons_json, github_updated_at, checked_at
			FROM github_issue_snapshots WHERE repository = ? AND issue_number = ? LIMIT 1
		`).bind(env.GITHUB_REPOSITORY, latest.selected_issue_number).first<Record<string, unknown>>();
	}
	return json({ run: latest, candidate });
}
