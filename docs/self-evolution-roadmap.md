# Self-Evolution Roadmap

Chinese source: [zh-CN/self-evolution-roadmap.md](zh-CN/self-evolution-roadmap.md)

Autonomy is opened in explicit permission stages. Stages 1 and 2 are now implemented as an auditable foundation. Telegram Stars intake and tracked TON transfer intents are enabled; automatic source edits, merges, outgoing payments, and plan changes remain disabled.

## Implemented: Stage 1 Foundation

- The hourly Worker cron reads open pull requests and stores deterministic risk snapshots in D1.
- `POST /api/donations/api-keys` is operator mediated, uses a dedicated bearer token, encrypts with AES-GCM, and deduplicates by SHA-256 fingerprint.
- Optional subsystem failures safely skip without interrupting Telegram service.

## Implemented: Stage 2A Issues and Candidate Selection

When explicitly enabled, `/wish` and `/issue` create public GitHub issues using a dedicated issue-write token when configured, otherwise the existing Worker GitHub token. Telegram identities stay in private D1 rate-limit records and are not copied into the public issue. User submissions do not directly receive `bot:ready`; a maintainer or the conservative Workers AI gate must approve them.

The hourly review gives suitable low-risk community PRs priority. Only when the PR scan succeeds and finds none does it rank `bot:ready` issues. Assigned, locked, PR-linked, underspecified, blocked, or protected topics (credentials, money, auth, permissions, workflows, deploys, schemas, migrations, encryption, and security) are excluded. `GET /api/evolution/candidate`, protected by `EXTERNAL_API_KEY`, exposes the selected read-only candidate to a future isolated executor.

## Implemented: Stage 2B Credential Platform and Free Models

Provider aliases are canonicalized, so Gemini/Google donations are stored as `google-gemini`. Each donation declares `validation_only` (default) or explicit `shared_inference` consent. Only the latter can enter routing after validation.

`DONATION_ADMIN_KEY` protects metadata listing, validation, disable, and revoke operations. Revocation clears ciphertext. Gemini validation calls the official read-only models list and records visible `generateContent` models; DeepSeek validation calls the official balance endpoint and records only availability, not an exact balance. One shared credential can be health-checked per hourly run.

Gemini 2.5 Flash-Lite, Flash, and Pro are seeded from Google's official [model list](https://ai.google.dev/gemini-api/docs/models) and [pricing](https://ai.google.dev/gemini-api/docs/pricing), verified 2026-07-20. Free availability remains account, region, and rate-limit dependent. `/api/ai/models` lists seeds; `/api/ai/route` returns a recommendation and clearly distinguishes a validated credential from an unverified catalog seed.

## Implemented: Stage 2C Workers AI Issue Approval

The hourly Cron statically filters unready Issues, excludes assigned, locked, PR-linked, underspecified, blocked, and protected work, and reviews at most one eligible Issue. The only automatic GitHub mutation is adding `bot:ready`.

The decision uses Workers AI model `@cf/meta/llama-3.2-3b-instruct` and sends the run through AI Gateway. It must return `risk=low` with confidence at or above `GITHUB_AI_TRIAGE_MIN_CONFIDENCE` (production: `0.85`). Any missing binding, malformed response, model error, or GitHub error fails closed without a label. This consumes the Workers AI free allocation where available.

Every outcome is recorded in `ai_issue_triage_runs` without storing a prompt or credential. An unchanged rejected Issue is not repeatedly reviewed; editing it makes it eligible for a later review. `GET /api/evolution/candidate` includes the latest non-secret triage audit.

## Not Yet Implemented

- Stage 3: isolated checkout, tests, AI review, and draft-PR creation.
- Stage 4: policy-gated merge with branch protection, kill switch, locking, backoff, and rollback.
- Stage 5: Stars receipts and TON transfer intents are recorded in an auditable ledger. Outgoing payments, crypto transfers, conversion, or Cloudflare plan mutation still require limits, multi-party approval, idempotency, and complete audit.

The bot never harvests or uses unknown shared keys found on the internet. See the Chinese source for the complete endpoint and configuration checklist.

The repository must create the label named by `GITHUB_AUTONOMY_LABEL` before enabling triage. The Worker may add that existing label to an approved Issue, but it does not create labels or change repository configuration.
