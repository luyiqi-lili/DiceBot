import type { Env } from '../index';
import { decryptDonationCredentialForRuntime, ensureCredentialProfileTable } from './apiKeyDonations';
import {
	DEEPSEEK_PREMIUM_APPROVAL_MODEL,
	checkDeepSeekPaidBalance,
	decideIssueWithPremiumDeepSeek,
} from './deepseekPremium';
import { assessIssueForAutonomy } from './githubIssueMonitor';

type AiIssueTriageEnv = Pick<
	Env,
	| 'DB'
	| 'DONATION_ENCRYPTION_KEY'
	| 'DEEPSEEK_API_KEY'
	| 'GITHUB_REPOSITORY'
	| 'GITHUB_TOKEN'
	| 'GITHUB_ISSUE_TOKEN'
	| 'GITHUB_AUTONOMY_LABEL'
	| 'GITHUB_AI_TRIAGE_ENABLED'
	| 'GITHUB_AI_TRIAGE_SCAN_LIMIT'
	| 'GITHUB_AI_TRIAGE_MIN_CONFIDENCE'
>;

type GitHubIssue = {
	number: number;
	title: string;
	body?: string | null;
	html_url: string;
	labels?: Array<string | { name?: string }>;
	assignee?: { login?: string } | null;
	assignees?: Array<{ login?: string }>;
	locked?: boolean;
	comments?: number;
	state?: string;
	created_at: string;
	updated_at: string;
	pull_request?: unknown;
};

type StoredCredential = {
	id: string;
	provider: string;
	encrypted_key: string;
	encryption_iv: string;
	status: 'active';
};

type RuntimeCredential = {
	source: 'worker-secret' | 'donated';
	donationId: string | null;
	apiKey: string;
};

export type AiIssueTriageResult = {
	status: 'approved' | 'rejected' | 'skipped' | 'error';
	issueNumber?: number;
	model?: string;
	credentialSource?: RuntimeCredential['source'];
	paidBalanceVerified?: boolean;
	confidence?: number;
	reason: string;
};

function repositoryIsValid(repository: string): boolean {
	return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository);
}

function labelName(label: string | { name?: string }): string {
	return typeof label === 'string' ? label : label.name ?? '';
}

function scanLimit(raw: string | undefined): number {
	const parsed = Number.parseInt(raw ?? '', 10);
	return Number.isFinite(parsed) ? Math.min(100, Math.max(1, parsed)) : 50;
}

function minimumConfidence(raw: string | undefined): number {
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? Math.min(0.99, Math.max(0.5, parsed)) : 0.85;
}

export async function ensureAiIssueTriageTable(db: D1Database): Promise<void> {
	await db.prepare(`
		CREATE TABLE IF NOT EXISTS ai_issue_triage_runs (
			id TEXT PRIMARY KEY,
			repository TEXT NOT NULL,
			status TEXT NOT NULL CHECK (status IN ('approved', 'rejected', 'skipped', 'error')),
			issue_number INTEGER,
			issue_updated_at TEXT,
			provider TEXT,
			model TEXT,
			credential_source TEXT,
			donation_id TEXT,
			paid_balance_verified INTEGER NOT NULL DEFAULT 0,
			confidence REAL,
			decision_reason TEXT NOT NULL,
			error_summary TEXT,
			checked_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`).run();
	await db.prepare(`
		CREATE INDEX IF NOT EXISTS idx_ai_issue_triage_runs_repository
		ON ai_issue_triage_runs (repository, checked_at)
	`).run();
}

async function recordTriageRun(
	db: D1Database,
	repository: string,
	result: AiIssueTriageResult,
	input: {
		issueUpdatedAt?: string;
		donationId?: string | null;
		errorSummary?: string | null;
	},
): Promise<void> {
	await db.prepare(`
		INSERT INTO ai_issue_triage_runs
		(id, repository, status, issue_number, issue_updated_at, provider, model, credential_source,
		 donation_id, paid_balance_verified, confidence, decision_reason, error_summary, checked_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
	`).bind(
		crypto.randomUUID(),
		repository,
		result.status,
		result.issueNumber ?? null,
		input.issueUpdatedAt ?? null,
		result.model ? 'deepseek' : null,
		result.model ?? null,
		result.credentialSource ?? null,
		input.donationId ?? null,
		result.paidBalanceVerified ? 1 : 0,
		result.confidence ?? null,
		result.reason.slice(0, 500),
		input.errorSummary?.slice(0, 500) ?? null,
	).run();
}

async function fetchUnreadyIssues(
	fetchFn: typeof fetch,
	repository: string,
	readyLabel: string,
	headers: Record<string, string>,
	limit: number,
): Promise<GitHubIssue[]> {
	const query = new URLSearchParams({
		state: 'open',
		sort: 'updated',
		direction: 'desc',
		per_page: String(limit),
	});
	const response = await fetchFn(`https://api.github.com/repos/${repository}/issues?${query}`, { headers });
	if (!response.ok) throw new Error(`github_issue_list_http_${response.status}`);
	const payload = await response.json();
	if (!Array.isArray(payload)) throw new Error('github_issue_list_invalid_response');
	const normalizedReadyLabel = readyLabel.toLowerCase();
	return (payload as GitHubIssue[]).filter((issue) => {
		if (issue.pull_request) return false;
		return !(issue.labels ?? []).map(labelName).some((label) => label.toLowerCase() === normalizedReadyLabel);
	});
}

async function reviewedIssueVersions(db: D1Database, repository: string): Promise<Map<number, string>> {
	const result = await db.prepare(`
		SELECT issue_number, issue_updated_at
		FROM ai_issue_triage_runs
		WHERE repository = ? AND status IN ('approved', 'rejected')
			AND issue_number IS NOT NULL AND issue_updated_at IS NOT NULL
		ORDER BY checked_at DESC
	`).bind(repository).all<{ issue_number: number; issue_updated_at: string }>();
	const versions = new Map<number, string>();
	for (const row of result.results ?? []) {
		if (!versions.has(row.issue_number)) versions.set(row.issue_number, row.issue_updated_at);
	}
	return versions;
}

async function runtimeCredentials(env: AiIssueTriageEnv): Promise<RuntimeCredential[]> {
	const credentials: RuntimeCredential[] = [];
	const workerKey = env.DEEPSEEK_API_KEY?.trim();
	if (workerKey) credentials.push({ source: 'worker-secret', donationId: null, apiKey: workerKey });
	if (!env.DB || !env.DONATION_ENCRYPTION_KEY || credentials.length >= 3) return credentials;

	try {
		await ensureCredentialProfileTable(env.DB);
		const result = await env.DB.prepare(`
			SELECT d.id, d.provider, d.encrypted_key, d.encryption_iv, d.status
			FROM api_key_donations d
			JOIN api_credential_profiles p ON p.donation_id = d.id
			WHERE d.provider = 'deepseek' AND d.status = 'active'
				AND p.usage_policy = 'shared_inference' AND p.health_status = 'healthy'
			ORDER BY p.last_checked_at DESC, d.created_at ASC
			LIMIT 3
		`).all<StoredCredential>();
		for (const record of result.results ?? []) {
			if (credentials.length >= 3) break;
			try {
				credentials.push({
					source: 'donated',
					donationId: record.id,
					apiKey: await decryptDonationCredentialForRuntime(env, record),
				});
			} catch {
				console.error('[ai-issue-triage] donated credential decrypt failed', { donationId: record.id });
			}
		}
	} catch (error) {
		console.error('[ai-issue-triage] donated credential lookup failed', {
			reason: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
		});
	}
	return credentials;
}

async function addReadyLabel(
	fetchFn: typeof fetch,
	repository: string,
	issueNumber: number,
	label: string,
	token: string,
): Promise<void> {
	const response = await fetchFn(`https://api.github.com/repos/${repository}/issues/${issueNumber}/labels`, {
		method: 'POST',
		signal: AbortSignal.timeout(10_000),
		headers: {
			Accept: 'application/vnd.github+json',
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			'User-Agent': 'dicebot-ai-issue-triage',
			'X-GitHub-Api-Version': '2022-11-28',
		},
		body: JSON.stringify({ labels: [label] }),
	});
	if (!response.ok) throw new Error(`github_label_http_${response.status}`);
}

async function revalidateIssueBeforeLabel(
	fetchFn: typeof fetch,
	repository: string,
	issue: GitHubIssue,
	readyLabel: string,
	headers: Record<string, string>,
	linkedIssueNumbers: ReadonlySet<number>,
): Promise<{ reason: string | null; issueUpdatedAt: string }> {
	const response = await fetchFn(`https://api.github.com/repos/${repository}/issues/${issue.number}`, {
		method: 'GET',
		signal: AbortSignal.timeout(10_000),
		headers,
	});
	if (!response.ok) throw new Error(`github_issue_recheck_http_${response.status}`);
	const latest = await response.json() as GitHubIssue;
	const latestUpdatedAt = typeof latest.updated_at === 'string' ? latest.updated_at : issue.updated_at;
	if (latest.pull_request || latest.state !== 'open') return { reason: 'issue-no-longer-open', issueUpdatedAt: latestUpdatedAt };
	if (latest.updated_at !== issue.updated_at) return { reason: 'issue-changed-before-label', issueUpdatedAt: latestUpdatedAt };
	if ((latest.labels ?? []).map(labelName).some((label) => label.toLowerCase() === readyLabel.toLowerCase())) {
		return { reason: 'issue-already-ready', issueUpdatedAt: latestUpdatedAt };
	}
	const assessment = assessIssueForAutonomy(latest, linkedIssueNumbers, latest.number);
	return {
		reason: assessment.eligible ? null : 'issue-no-longer-eligible',
		issueUpdatedAt: latestUpdatedAt,
	};
}

export async function runAiIssueTriage(
	env: AiIssueTriageEnv,
	input: { linkedIssueNumbers?: readonly number[] } = {},
	options: { fetchFn?: typeof fetch } = {},
): Promise<AiIssueTriageResult> {
	if (String(env.GITHUB_AI_TRIAGE_ENABLED).toLowerCase() !== 'true') {
		return { status: 'skipped', reason: 'ai-triage-disabled' };
	}
	if (!env.DB) return { status: 'skipped', reason: 'd1-not-configured' };
	if (!env.GITHUB_REPOSITORY || !repositoryIsValid(env.GITHUB_REPOSITORY)) {
		return { status: 'skipped', reason: 'github-repository-not-configured' };
	}
	const githubToken = env.GITHUB_ISSUE_TOKEN || env.GITHUB_TOKEN;
	if (!githubToken) return { status: 'skipped', reason: 'github-write-token-not-configured' };

	const repository = env.GITHUB_REPOSITORY;
	const readyLabel = env.GITHUB_AUTONOMY_LABEL?.trim() || 'bot:ready';
	const fetchFn = options.fetchFn ?? fetch;
	await ensureAiIssueTriageTable(env.DB);
	try {
		const githubHeaders: Record<string, string> = {
			Accept: 'application/vnd.github+json',
			Authorization: `Bearer ${githubToken}`,
			'User-Agent': 'dicebot-ai-issue-triage',
			'X-GitHub-Api-Version': '2022-11-28',
		};
		const [issues, reviewedVersions] = await Promise.all([
			fetchUnreadyIssues(fetchFn, repository, readyLabel, githubHeaders, scanLimit(env.GITHUB_AI_TRIAGE_SCAN_LIMIT)),
			reviewedIssueVersions(env.DB, repository),
		]);
		const linked = new Set(input.linkedIssueNumbers ?? []);
		const candidates = issues.flatMap((issue) => {
			if (reviewedVersions.get(issue.number) === issue.updated_at) return [];
			const assessment = assessIssueForAutonomy(issue, linked, issue.number);
			if (!assessment.eligible) return [];
			return [{ issue, score: assessment.score }];
		}).sort((left, right) => right.score - left.score || left.issue.number - right.issue.number);
		const selected = candidates[0]?.issue;
		if (!selected) {
			const result: AiIssueTriageResult = { status: 'skipped', reason: 'no-eligible-unreviewed-issue' };
			await recordTriageRun(env.DB, repository, result, {});
			return result;
		}

		const credentials = await runtimeCredentials(env);
		if (!credentials.length) {
			const result: AiIssueTriageResult = { status: 'skipped', issueNumber: selected.number, reason: 'no-premium-credential' };
			await recordTriageRun(env.DB, repository, result, { issueUpdatedAt: selected.updated_at });
			return result;
		}

		let lastBalanceReason = 'paid-premium-balance-unavailable';
		for (const credential of credentials) {
			const balance = await checkDeepSeekPaidBalance(credential.apiKey, { fetchFn });
			if (balance.status === 'error') {
				lastBalanceReason = balance.reason;
				continue;
			}
			if (!balance.paidBalanceAvailable) {
				lastBalanceReason = balance.apiAvailable ? 'free-or-granted-balance-only' : 'api-balance-unavailable';
				continue;
			}

			const labels = (selected.labels ?? []).map(labelName).filter(Boolean);
			const decision = await decideIssueWithPremiumDeepSeek(credential.apiKey, {
				number: selected.number,
				title: selected.title,
				body: String(selected.body ?? ''),
				labels,
			}, { fetchFn });
			if (decision.status === 'error') {
				const result: AiIssueTriageResult = {
					status: 'error',
					issueNumber: selected.number,
					model: DEEPSEEK_PREMIUM_APPROVAL_MODEL,
					credentialSource: credential.source,
					paidBalanceVerified: true,
					reason: decision.reason,
				};
				await recordTriageRun(env.DB, repository, result, {
					issueUpdatedAt: selected.updated_at,
					donationId: credential.donationId,
					errorSummary: decision.reason,
				});
				return result;
			}

			const threshold = minimumConfidence(env.GITHUB_AI_TRIAGE_MIN_CONFIDENCE);
			const approved = decision.approve && decision.risk === 'low' && decision.confidence >= threshold;
			const result: AiIssueTriageResult = {
				status: approved ? 'approved' : 'rejected',
				issueNumber: selected.number,
				model: DEEPSEEK_PREMIUM_APPROVAL_MODEL,
				credentialSource: credential.source,
				paidBalanceVerified: true,
				confidence: decision.confidence,
				reason: decision.reason,
			};
			if (approved) {
				const guard = await revalidateIssueBeforeLabel(fetchFn, repository, selected, readyLabel, githubHeaders, linked);
				if (guard.reason) {
					const guardedResult: AiIssueTriageResult = {
						...result,
						status: guard.reason === 'issue-already-ready' ? 'skipped' : 'rejected',
						reason: guard.reason,
					};
					await recordTriageRun(env.DB, repository, guardedResult, {
						issueUpdatedAt: guard.issueUpdatedAt,
						donationId: credential.donationId,
					});
					return guardedResult;
				}
				await addReadyLabel(fetchFn, repository, selected.number, readyLabel, githubToken);
			}
			await recordTriageRun(env.DB, repository, result, {
				issueUpdatedAt: selected.updated_at,
				donationId: credential.donationId,
			});
			console.log('[ai-issue-triage] review complete', {
				repository,
				issueNumber: selected.number,
				status: result.status,
				model: result.model,
				credentialSource: result.credentialSource,
				confidence: result.confidence,
			});
			return result;
		}

		const result: AiIssueTriageResult = {
			status: 'skipped',
			issueNumber: selected.number,
			paidBalanceVerified: false,
			reason: lastBalanceReason,
		};
		await recordTriageRun(env.DB, repository, result, { issueUpdatedAt: selected.updated_at });
		return result;
	} catch (error) {
		const reason = error instanceof Error ? error.message.slice(0, 500) : 'ai_issue_triage_failed';
		const result: AiIssueTriageResult = { status: 'error', reason };
		try {
			await recordTriageRun(env.DB, repository, result, { errorSummary: reason });
		} catch {
			// Preserve the original failure and never leak D1 details.
		}
		console.error('[ai-issue-triage] run failed', { repository, reason });
		return result;
	}
}
