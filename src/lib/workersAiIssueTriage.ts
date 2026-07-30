import type { Env } from '../index';
import { assessIssueForAutonomy } from './githubIssueMonitor';
import { ensureGatewayCredentialColumns } from './apiKeyDonations';
import { gatewayInferenceHeaders } from './cloudflareAiGateway';
import {
	OLLAMA_CLOUD_GATEWAY_SLUG,
	chooseOllamaReviewModel,
	ollamaChatText,
} from './ollamaCloud';

export const WORKERS_AI_TRIAGE_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

type TriageEnv = Pick<
	Env,
	| 'AI'
	| 'AI_GATEWAY_ID'
	| 'AI_GATEWAY_TOKEN'
	| 'DB'
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

export type WorkersAiIssueTriageResult = {
	status: 'approved' | 'rejected' | 'skipped' | 'error';
	issueNumber?: number;
	provider?: 'ollama-cloud' | 'workers-ai';
	model?: string;
	credentialSource?: 'donated-gateway' | 'workers-ai';
	donationId?: string;
	/** Retained in D1/API response for backward compatibility; Workers AI has no paid-balance gate. */
	paidBalanceVerified?: false;
	confidence?: number;
	reason: string;
};

type ModelDecision = { approve: boolean; confidence: number; risk: 'low' | 'medium' | 'high'; reason: string };

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

async function ensureTable(db: D1Database): Promise<void> {
	await db.prepare(`
		CREATE TABLE IF NOT EXISTS ai_issue_triage_runs (
			id TEXT PRIMARY KEY, repository TEXT NOT NULL,
			status TEXT NOT NULL CHECK (status IN ('approved', 'rejected', 'skipped', 'error')),
			issue_number INTEGER, issue_updated_at TEXT, provider TEXT, model TEXT,
			credential_source TEXT, donation_id TEXT, paid_balance_verified INTEGER NOT NULL DEFAULT 0,
			confidence REAL, decision_reason TEXT NOT NULL, error_summary TEXT,
			checked_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`).run();
	await db.prepare(`CREATE INDEX IF NOT EXISTS idx_ai_issue_triage_runs_repository ON ai_issue_triage_runs (repository, checked_at)`).run();
}

async function recordRun(db: D1Database, repository: string, result: WorkersAiIssueTriageResult, input: { issueUpdatedAt?: string; errorSummary?: string } = {}): Promise<void> {
	await db.prepare(`
		INSERT INTO ai_issue_triage_runs
		(id, repository, status, issue_number, issue_updated_at, provider, model, credential_source,
		 donation_id, paid_balance_verified, confidence, decision_reason, error_summary, checked_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, datetime('now'))
	`).bind(
		crypto.randomUUID(), repository, result.status, result.issueNumber ?? null, input.issueUpdatedAt ?? null,
		result.provider ?? null, result.model ?? null, result.credentialSource ?? null,
		result.donationId ?? null,
		result.confidence ?? null, result.reason.slice(0, 500), input.errorSummary?.slice(0, 500) ?? null,
	).run();
}

async function fetchUnreadyIssues(fetchFn: typeof fetch, repository: string, readyLabel: string, headers: Record<string, string>, limit: number): Promise<GitHubIssue[]> {
	const query = new URLSearchParams({ state: 'open', sort: 'updated', direction: 'desc', per_page: String(limit) });
	const response = await fetchFn(`https://api.github.com/repos/${repository}/issues?${query}`, { headers });
	if (!response.ok) throw new Error(`github_issue_list_http_${response.status}`);
	const payload = await response.json();
	if (!Array.isArray(payload)) throw new Error('github_issue_list_invalid_response');
	return (payload as GitHubIssue[]).filter((issue) => !issue.pull_request
		&& !(issue.labels ?? []).map(labelName).some((label) => label.toLowerCase() === readyLabel.toLowerCase()));
}

async function reviewedVersions(db: D1Database, repository: string): Promise<Map<number, string>> {
	const result = await db.prepare(`
		SELECT issue_number, issue_updated_at FROM ai_issue_triage_runs
		WHERE repository = ? AND status IN ('approved', 'rejected')
		AND issue_number IS NOT NULL AND issue_updated_at IS NOT NULL ORDER BY checked_at DESC
	`).bind(repository).all<{ issue_number: number; issue_updated_at: string }>();
	const versions = new Map<number, string>();
	for (const row of result.results ?? []) if (!versions.has(row.issue_number)) versions.set(row.issue_number, row.issue_updated_at);
	return versions;
}

function parseDecision(response: unknown): ModelDecision | null {
	if (typeof response !== 'string') return null;
	const start = response.indexOf('{');
	const end = response.lastIndexOf('}');
	if (start < 0 || end <= start) return null;
	try {
		const parsed = JSON.parse(response.slice(start, end + 1)) as Partial<ModelDecision>;
		if (typeof parsed.approve !== 'boolean' || typeof parsed.confidence !== 'number'
			|| !Number.isFinite(parsed.confidence) || !['low', 'medium', 'high'].includes(String(parsed.risk))
			|| typeof parsed.reason !== 'string') return null;
		return { approve: parsed.approve, confidence: Math.min(1, Math.max(0, parsed.confidence)), risk: parsed.risk as ModelDecision['risk'], reason: parsed.reason.slice(0, 500) };
	} catch {
		return null;
	}
}

type OllamaCredential = {
	id: string;
	gateway_alias: string;
	available_models_json: string;
};

async function ollamaCredentials(db: D1Database): Promise<OllamaCredential[]> {
	try {
		await ensureGatewayCredentialColumns(db);
		const result = await db.prepare(`
			SELECT d.id, d.gateway_alias, p.available_models_json
			FROM api_key_donations d
			JOIN api_credential_profiles p ON p.donation_id = d.id
			WHERE d.provider = 'ollama-cloud' AND d.status = 'active'
				AND d.gateway_alias IS NOT NULL AND d.gateway_alias <> ''
				AND p.usage_policy = 'shared_inference' AND p.health_status = 'healthy'
			ORDER BY d.created_at ASC
		`).all<OllamaCredential>();
		const credentials = result.results ?? [];
		if (credentials.length < 2) return credentials;
		await db.prepare(`
			CREATE TABLE IF NOT EXISTS ai_gateway_rotation_state (
				pool TEXT PRIMARY KEY, cursor INTEGER NOT NULL DEFAULT 0,
				updated_at TEXT NOT NULL DEFAULT (datetime('now'))
			)
		`).run();
		await db.prepare(`INSERT OR IGNORE INTO ai_gateway_rotation_state (pool, cursor) VALUES ('issue-triage-ollama', 0)`).run();
		const row = await db.prepare(`
			UPDATE ai_gateway_rotation_state SET cursor = cursor + 1, updated_at = datetime('now')
			WHERE pool = 'issue-triage-ollama' RETURNING cursor
		`).first<{ cursor: number }>();
		const start = Math.max(0, Number(row?.cursor ?? 1) - 1) % credentials.length;
		return [...credentials.slice(start), ...credentials.slice(0, start)];
	} catch (error) {
		console.error('[workers-ai-issue-triage] Ollama credential lookup failed', {
			reason: error instanceof Error ? error.message.slice(0, 160) : 'unknown',
		});
		return [];
	}
}

async function decideWithOllama(
	env: TriageEnv,
	credential: OllamaCredential,
	prompt: string,
	fetchFn: typeof fetch,
): Promise<{ decision: ModelDecision; model: string } | null> {
	if (!env.AI || !env.AI_GATEWAY_TOKEN) return null;
	let models: string[] = [];
	try {
		const parsed = JSON.parse(credential.available_models_json);
		if (Array.isArray(parsed)) models = parsed.filter((model): model is string => typeof model === 'string');
	} catch {
		return null;
	}
	const model = chooseOllamaReviewModel(models);
	if (!model) return null;
	try {
		const base = await env.AI.gateway(env.AI_GATEWAY_ID?.trim() || 'default')
			.getUrl(OLLAMA_CLOUD_GATEWAY_SLUG as any);
		const response = await fetchFn(`${base.replace(/\/+$/, '')}/api/chat`, {
			method: 'POST',
			signal: AbortSignal.timeout(45_000),
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				...gatewayInferenceHeaders(env, credential.gateway_alias),
				'User-Agent': 'dicebot-gateway-ollama-issue-triage',
			},
			body: JSON.stringify({
				model,
				messages: [{ role: 'user', content: prompt }],
				stream: false,
				format: 'json',
				options: { num_predict: 320, temperature: 0 },
			}),
		});
		if (!response.ok) {
			console.warn('[workers-ai-issue-triage] Ollama alias failed', { status: response.status });
			return null;
		}
		const decision = parseDecision(ollamaChatText(await response.json()));
		return decision ? { decision, model } : null;
	} catch {
		return null;
	}
}

async function addReadyLabel(fetchFn: typeof fetch, repository: string, issueNumber: number, label: string, token: string): Promise<void> {
	const response = await fetchFn(`https://api.github.com/repos/${repository}/issues/${issueNumber}/labels`, {
		method: 'POST', signal: AbortSignal.timeout(10_000),
		headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'dicebot-ai-issue-triage', 'X-GitHub-Api-Version': '2022-11-28' },
		body: JSON.stringify({ labels: [label] }),
	});
	if (!response.ok) throw new Error(`github_label_http_${response.status}`);
}

async function revalidateIssue(fetchFn: typeof fetch, repository: string, issue: GitHubIssue, readyLabel: string, headers: Record<string, string>, linked: ReadonlySet<number>): Promise<{ reason: string | null; updatedAt: string }> {
	const response = await fetchFn(`https://api.github.com/repos/${repository}/issues/${issue.number}`, { headers, signal: AbortSignal.timeout(10_000) });
	if (!response.ok) throw new Error(`github_issue_recheck_http_${response.status}`);
	const latest = await response.json() as GitHubIssue;
	const updatedAt = typeof latest.updated_at === 'string' ? latest.updated_at : issue.updated_at;
	if (latest.pull_request || latest.state !== 'open') return { reason: 'issue-no-longer-open', updatedAt };
	if (latest.updated_at !== issue.updated_at) return { reason: 'issue-changed-before-label', updatedAt };
	if ((latest.labels ?? []).map(labelName).some((label) => label.toLowerCase() === readyLabel.toLowerCase())) return { reason: 'issue-already-ready', updatedAt };
	return { reason: assessIssueForAutonomy(latest, linked, latest.number).eligible ? null : 'issue-no-longer-eligible', updatedAt };
}

function promptFor(issue: GitHubIssue): string {
	return [
		'You are a conservative GitHub Issue triage gate. Return exactly one JSON object and no markdown.',
		'Only approve a small, testable, low-risk feature. Reject credentials, money, auth, permissions, workflow, deployment, schema, migration, encryption, security, broad refactor, or underspecified work.',
		'JSON schema: {"approve":boolean,"confidence":number,"risk":"low"|"medium"|"high","reason":string}.',
		`Issue #${issue.number}: ${issue.title.slice(0, 500)}`,
		`Body: ${String(issue.body ?? '').slice(0, 6_000)}`,
		`Labels: ${(issue.labels ?? []).map(labelName).join(', ').slice(0, 500)}`,
	].join('\n');
}

export async function runWorkersAiIssueTriage(env: TriageEnv, input: { linkedIssueNumbers?: readonly number[] } = {}, options: { fetchFn?: typeof fetch } = {}): Promise<WorkersAiIssueTriageResult> {
	if (String(env.GITHUB_AI_TRIAGE_ENABLED).toLowerCase() !== 'true') return { status: 'skipped', reason: 'ai-triage-disabled' };
	if (!env.DB) return { status: 'skipped', reason: 'd1-not-configured' };
	if (!env.AI) return { status: 'skipped', reason: 'workers-ai-binding-not-configured' };
	if (!env.GITHUB_REPOSITORY || !repositoryIsValid(env.GITHUB_REPOSITORY)) return { status: 'skipped', reason: 'github-repository-not-configured' };
	const token = env.GITHUB_ISSUE_TOKEN || env.GITHUB_TOKEN;
	if (!token) return { status: 'skipped', reason: 'github-write-token-not-configured' };
	const repository = env.GITHUB_REPOSITORY;
	const readyLabel = env.GITHUB_AUTONOMY_LABEL?.trim() || 'bot:ready';
	const fetchFn = options.fetchFn ?? fetch;
	await ensureTable(env.DB);
	try {
		const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'User-Agent': 'dicebot-ai-issue-triage', 'X-GitHub-Api-Version': '2022-11-28' };
		const [issues, reviewed] = await Promise.all([fetchUnreadyIssues(fetchFn, repository, readyLabel, headers, scanLimit(env.GITHUB_AI_TRIAGE_SCAN_LIMIT)), reviewedVersions(env.DB, repository)]);
		const linked = new Set(input.linkedIssueNumbers ?? []);
		const selected = issues.flatMap((issue) => {
			if (reviewed.get(issue.number) === issue.updated_at) return [];
			const assessment = assessIssueForAutonomy(issue, linked, issue.number);
			return assessment.eligible ? [{ issue, score: assessment.score }] : [];
		}).sort((a, b) => b.score - a.score || a.issue.number - b.issue.number)[0]?.issue;
		if (!selected) {
			const result = { status: 'skipped' as const, reason: 'no-eligible-unreviewed-issue' };
			await recordRun(env.DB, repository, result);
			return result;
		}
		const prompt = promptFor(selected);
		let decision: ModelDecision | null = null;
		let provider: WorkersAiIssueTriageResult['provider'] = 'workers-ai';
		let model = WORKERS_AI_TRIAGE_MODEL;
		let credentialSource: WorkersAiIssueTriageResult['credentialSource'] = 'workers-ai';
		let donationId: string | undefined;
		for (const credential of await ollamaCredentials(env.DB)) {
			const result = await decideWithOllama(env, credential, prompt, fetchFn);
			if (!result) continue;
			decision = result.decision;
			provider = 'ollama-cloud';
			model = result.model;
			credentialSource = 'donated-gateway';
			donationId = credential.id;
			break;
		}
		if (!decision) {
			const output = await env.AI.run(WORKERS_AI_TRIAGE_MODEL, { prompt, max_tokens: 320, temperature: 0 }, {
				gateway: {
					id: env.AI_GATEWAY_ID?.trim() || 'default',
					skipCache: true,
					collectLog: true,
					metadata: { feature: 'issue-triage', issue: String(selected.number), costClass: 'free_limited', modelSize: 'large' },
				},
			});
			decision = parseDecision((output as { response?: unknown }).response);
			provider = 'workers-ai';
			model = WORKERS_AI_TRIAGE_MODEL;
			credentialSource = 'workers-ai';
		}
		if (!decision) {
			const result: WorkersAiIssueTriageResult = {
				status: 'error',
				issueNumber: selected.number,
				provider,
				model,
				credentialSource,
				donationId,
				reason: 'free-limited-model-invalid-response',
			};
			await recordRun(env.DB, repository, result, { issueUpdatedAt: selected.updated_at, errorSummary: result.reason });
			return result;
		}
		const approved = decision.approve && decision.risk === 'low' && decision.confidence >= minimumConfidence(env.GITHUB_AI_TRIAGE_MIN_CONFIDENCE);
		const result: WorkersAiIssueTriageResult = {
			status: approved ? 'approved' : 'rejected',
			issueNumber: selected.number,
			provider,
			model,
			credentialSource,
			donationId,
			paidBalanceVerified: false,
			confidence: decision.confidence,
			reason: decision.reason,
		};
		if (approved) {
			const guard = await revalidateIssue(fetchFn, repository, selected, readyLabel, headers, linked);
			if (guard.reason) {
				const guarded = { ...result, status: guard.reason === 'issue-already-ready' ? 'skipped' as const : 'rejected' as const, reason: guard.reason };
				await recordRun(env.DB, repository, guarded, { issueUpdatedAt: guard.updatedAt });
				return guarded;
			}
			await addReadyLabel(fetchFn, repository, selected.number, readyLabel, token);
		}
		await recordRun(env.DB, repository, result, { issueUpdatedAt: selected.updated_at });
		return result;
	} catch (error) {
		const reason = error instanceof Error ? error.message.slice(0, 500) : 'workers_ai_issue_triage_failed';
		const result: WorkersAiIssueTriageResult = { status: 'error', provider: 'workers-ai', model: WORKERS_AI_TRIAGE_MODEL, credentialSource: 'workers-ai', reason };
		try { await recordRun(env.DB, repository, result, { errorSummary: reason }); } catch { /* preserve the original failure */ }
		console.error('[workers-ai-issue-triage] run failed', { repository, reason });
		return result;
	}
}
