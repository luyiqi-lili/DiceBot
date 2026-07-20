import type { Env } from '../index';

type IssueIntakeEnv = Pick<
	Env,
	'DB' | 'GITHUB_REPOSITORY' | 'GITHUB_ISSUE_TOKEN' | 'GITHUB_ISSUE_INTAKE_ENABLED' | 'GITHUB_ISSUE_COOLDOWN_SECONDS'
>;

export type IssueSubmissionResult =
	| { status: 'created'; number: number; title: string; url: string }
	| { status: 'duplicate'; number: number; title: string; url: string }
	| { status: 'skipped' | 'error'; reason: string; retryAfterSeconds?: number };

const MEANINGLESS_REQUESTS = new Set(['test', 'testing', '测试', '随便', '无', '没有', '不知道', 'none', 'n/a', 'aaa']);

function repositoryIsValid(repository: string): boolean {
	return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository);
}

export function isMeaningfulFeatureRequest(input: string): boolean {
	const text = String(input ?? '').trim();
	if (text.length < 8 || text.length > 2000) return false;
	const compact = text.replace(/\s+/g, '').toLowerCase();
	if (MEANINGLESS_REQUESTS.has(compact)) return false;
	if (/^[\p{P}\p{S}\d_]+$/u.test(compact)) return false;
	if (/^(.)\1{5,}$/u.test(compact)) return false;
	return true;
}

function issueTitleFromRequest(body: string): string {
	const firstLine = body.split(/\r?\n/, 1)[0]
		.replace(/[\u0000-\u001f\u007f]/g, ' ')
		.replace(/^#+\s*/, '')
		.replace(/@/g, '@\u200b')
		.replace(/\s+/g, ' ')
		.trim();
	const title = firstLine.length > 90 ? `${firstLine.slice(0, 87).trimEnd()}...` : firstLine;
	return `[Telegram 需求] ${title}`;
}

function quoteUntrustedMarkdown(body: string): string {
	return body
		.replace(/@/g, '@\u200b')
		.split(/\r?\n/)
		.map((line) => `> ${line}`)
		.join('\n');
}

async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function cooldownSeconds(raw: string | undefined): number {
	const parsed = Number.parseInt(raw ?? '', 10);
	return Number.isFinite(parsed) ? Math.min(86_400, Math.max(60, parsed)) : 3600;
}

export async function ensureIssueSubmissionTable(db: D1Database): Promise<void> {
	await db.prepare(`
		CREATE TABLE IF NOT EXISTS github_issue_submissions (
			id TEXT PRIMARY KEY,
			repository TEXT NOT NULL,
			issue_number INTEGER NOT NULL,
			issue_url TEXT NOT NULL,
			issue_title TEXT NOT NULL,
			source_chat_id TEXT NOT NULL,
			source_user_id TEXT NOT NULL,
			body_fingerprint TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			UNIQUE(repository, issue_number)
		)
	`).run();
	await db.prepare(`
		CREATE INDEX IF NOT EXISTS idx_github_issue_submissions_rate_limit
		ON github_issue_submissions (repository, source_chat_id, source_user_id, created_at)
	`).run();
	await db.prepare(`
		CREATE INDEX IF NOT EXISTS idx_github_issue_submissions_fingerprint
		ON github_issue_submissions (repository, body_fingerprint, created_at)
	`).run();
}

export async function submitFeatureRequestAsIssue(
	env: IssueIntakeEnv,
	input: { body: string; chatId: string | number; userId: string | number },
	options: { fetchFn?: typeof fetch; now?: Date } = {},
): Promise<IssueSubmissionResult> {
	if (String(env.GITHUB_ISSUE_INTAKE_ENABLED).toLowerCase() !== 'true') {
		return { status: 'skipped', reason: 'GitHub issue intake is disabled' };
	}
	if (!env.DB) return { status: 'skipped', reason: 'D1 is not configured' };
	if (!env.GITHUB_REPOSITORY || !repositoryIsValid(env.GITHUB_REPOSITORY)) {
		return { status: 'skipped', reason: 'GitHub repository is not configured' };
	}
	if (!env.GITHUB_ISSUE_TOKEN) return { status: 'skipped', reason: 'GitHub issue token is not configured' };
	const body = input.body.trim();
	if (!isMeaningfulFeatureRequest(body)) return { status: 'error', reason: 'Request is too short, too long, or not meaningful' };

	await ensureIssueSubmissionTable(env.DB);
	const repository = env.GITHUB_REPOSITORY;
	const fingerprint = await sha256Hex(body.toLowerCase());
	const duplicate = await env.DB.prepare(`
		SELECT issue_number, issue_url, issue_title
		FROM github_issue_submissions
		WHERE repository = ? AND body_fingerprint = ? AND created_at >= datetime('now', '-30 days')
		ORDER BY created_at DESC LIMIT 1
	`).bind(repository, fingerprint).first<{ issue_number: number; issue_url: string; issue_title: string }>();
	if (duplicate) {
		return { status: 'duplicate', number: duplicate.issue_number, title: duplicate.issue_title, url: duplicate.issue_url };
	}

	const cooldown = cooldownSeconds(env.GITHUB_ISSUE_COOLDOWN_SECONDS);
	const recent = await env.DB.prepare(`
		SELECT created_at FROM github_issue_submissions
		WHERE repository = ? AND source_chat_id = ? AND source_user_id = ?
		ORDER BY created_at DESC LIMIT 1
	`).bind(repository, String(input.chatId), String(input.userId)).first<{ created_at: string }>();
	if (recent?.created_at) {
		const elapsed = Math.floor(((options.now ?? new Date()).getTime() - new Date(`${recent.created_at.replace(' ', 'T')}Z`).getTime()) / 1000);
		if (Number.isFinite(elapsed) && elapsed < cooldown) {
			return { status: 'error', reason: 'Issue submission cooldown is active', retryAfterSeconds: cooldown - Math.max(0, elapsed) };
		}
	}

	const title = issueTitleFromRequest(body);
	const issueBody = [
		'## 用户需求',
		'',
		quoteUntrustedMarkdown(body),
		'',
		'## 来源与处理边界',
		'',
		'- 由 DiceBot 的 Telegram `/wish` 命令提交。',
		'- Telegram 用户身份未公开写入此 Issue。',
		'- 此 Issue 不会自动进入开发队列；维护者确认后需添加 `bot:ready` 标签。',
	].join('\n');
	let response: Response;
	try {
		response = await (options.fetchFn ?? fetch)(`https://api.github.com/repos/${repository}/issues`, {
			method: 'POST',
			signal: AbortSignal.timeout(10_000),
			headers: {
				Accept: 'application/vnd.github+json',
				Authorization: `Bearer ${env.GITHUB_ISSUE_TOKEN}`,
				'Content-Type': 'application/json',
				'User-Agent': 'dicebot-issue-intake',
				'X-GitHub-Api-Version': '2022-11-28',
			},
			body: JSON.stringify({ title, body: issueBody }),
		});
	} catch {
		console.error('[github-issue-intake] create failed', { repository, status: 'network_error' });
		return { status: 'error', reason: 'GitHub API request failed' };
	}
	if (!response.ok) {
		console.error('[github-issue-intake] create failed', { repository, status: response.status });
		return { status: 'error', reason: `GitHub API returned HTTP ${response.status}` };
	}
	const created = await response.json() as { number?: unknown; html_url?: unknown; title?: unknown };
	if (!Number.isInteger(created.number) || typeof created.html_url !== 'string') {
		return { status: 'error', reason: 'GitHub API returned an invalid issue response' };
	}
	const issueNumber = Number(created.number);
	const issueUrl = created.html_url;
	const returnedTitle = typeof created.title === 'string' ? created.title : title;
	await env.DB.prepare(`
		INSERT INTO github_issue_submissions
		(id, repository, issue_number, issue_url, issue_title, source_chat_id, source_user_id, body_fingerprint, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
	`).bind(
		crypto.randomUUID(), repository, issueNumber, issueUrl, returnedTitle,
		String(input.chatId), String(input.userId), fingerprint,
	).run();
	console.log('[github-issue-intake] issue created', { repository, issueNumber });
	return { status: 'created', number: issueNumber, title: returnedTitle, url: issueUrl };
}
