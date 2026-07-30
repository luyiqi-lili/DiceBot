# Self-Evolution Roadmap

Chinese source: [zh-CN/self-evolution-roadmap.md](zh-CN/self-evolution-roadmap.md)

Autonomy is opened in explicit permission stages. Stages 1 and 2 are now implemented as an auditable foundation. Telegram Stars intake and tracked TON transfer intents are enabled; automatic source edits, merges, outgoing payments, and plan changes remain disabled.

## Implemented: Stage 1 Foundation

- The hourly Worker cron reads open pull requests and stores deterministic risk snapshots in D1.
- `POST /api/donations/api-keys` uses a dedicated bearer token, deduplicates by SHA-256 fingerprint, and stores new keys only in Cloudflare AI Gateway Secrets Store; D1 retains non-secret routing metadata.
- Optional subsystem failures safely skip without interrupting Telegram service.

## Implemented: Stage 2A Issues and Candidate Selection

When explicitly enabled, `/wish` and `/issue` create public GitHub issues using a dedicated issue-write token when configured, otherwise the existing Worker GitHub token. Telegram identities stay in private D1 rate-limit records and are not copied into the public issue. User submissions do not directly receive `bot:ready`; a maintainer or the conservative Ollama Cloud/Workers AI gate must approve them.

The hourly review gives suitable low-risk community PRs priority. Only when the PR scan succeeds and finds none does it rank `bot:ready` issues. Assigned, locked, PR-linked, underspecified, blocked, or protected topics (credentials, money, auth, permissions, workflows, deploys, schemas, migrations, encryption, and security) are excluded. `GET /api/evolution/candidate`, protected by `EXTERNAL_API_KEY`, exposes the selected read-only candidate to a future isolated executor.

## Implemented: Stage 2B Credential Platform and Free Models

Provider aliases are canonicalized, so Gemini/Google donations are stored as `google-gemini` and Ollama donations as `ollama-cloud`. Each donation declares `validation_only` (default) or explicit `shared_inference` consent. Only the latter can enter routing after validation. Ollama Cloud uses an account-level AI Gateway Custom Provider pointing at `https://ollama.com`; keys remain in Secrets Store and are selected by alias.

`DONATION_ADMIN_KEY` protects metadata listing, validation, disable, and revoke operations; production currently leaves those admin APIs disabled by not configuring it. Donor-owned `/revoketoken` remains available and deletes the Secrets Store key before marking metadata revoked. Gemini and Ollama validation call read-only model-list endpoints through Gateway and cache visible models. A managed DeepSeek alias records the supported premium-model catalog without reading the key back; only legacy encrypted DeepSeek records can call the direct balance endpoint. One shared credential can be health-checked per hourly run.

Gemini 2.5 Flash-Lite, Flash, and Pro are seeded from Google's official [model list](https://ai.google.dev/gemini-api/docs/models) and [pricing](https://ai.google.dev/gemini-api/docs/pricing), verified 2026-07-20. Free availability remains account, region, and rate-limit dependent. `/api/ai/models` lists seeds; `/api/ai/route` returns a recommendation and clearly distinguishes a validated credential from an unverified catalog seed. This catalog is separate from active translation, which requests `gemini-3.5-flash-lite`.

## Implemented: Stage 2C Free-Limited Large-Model Issue Approval

The hourly Cron statically filters unready Issues, excludes assigned, locked, PR-linked, underspecified, blocked, and protected work, and reviews at most one eligible Issue. The only automatic GitHub mutation is adding `bot:ready`.

The decision first round-robins donated Ollama Cloud aliases and selects a large model from each validated `/api/tags` catalog. It falls back to Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. Both paths use AI Gateway and must return `risk=low` with confidence at or above `GITHUB_AI_TRIAGE_MIN_CONFIDENCE` (production: `0.85`). Translation uses the completely-free small-model pool: donated Gemini first, then Ollama Cloud small models, then Workers AI `@cf/meta/llama-3.2-3b-instruct`.

Every outcome is recorded in `ai_issue_triage_runs` without storing a prompt or credential. An unchanged rejected Issue is not repeatedly reviewed; editing it makes it eligible for a later review. `GET /api/evolution/candidate` includes the latest non-secret triage audit.

`GET /api/evolution/github-auth`, protected by `EXTERNAL_API_KEY`, is a read-only diagnostic for the Worker-held `GITHUB_TOKEN`. It reads the configured repository metadata and reports only authentication plus read/push/admin capability; it never returns the token or calls a mutating GitHub endpoint.

## Not Yet Implemented

- Stage 3: isolated checkout, tests, AI review, and draft-PR creation.
- Stage 4: policy-gated merge with branch protection, kill switch, locking, backoff, and rollback.
- Stage 5: Stars receipts and TON transfer intents are recorded in an auditable ledger. Outgoing payments, crypto transfers, conversion, or Cloudflare plan mutation still require limits, multi-party approval, idempotency, and complete audit.

The bot never harvests or uses unknown shared keys found on the internet. See the Chinese source for the complete endpoint and configuration checklist.

The repository must create the label named by `GITHUB_AUTONOMY_LABEL` before enabling triage. The Worker may add that existing label to an approved Issue, but it does not create labels or change repository configuration.

See [AI routing and donated credentials](ai-routing.md) for the exact model preferences, cost classes, rotation behavior, and current production configuration.
