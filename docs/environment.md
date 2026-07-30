# Environment And Deployment

Chinese translation: [zh-CN/environment.md](zh-CN/environment.md)

## Package Scripts

`package.json` defines:

| Script | Command |
|--------|---------|
| `npm run dev` | `wrangler dev` |
| `npm run start` | `wrangler dev` |
| `npm run deploy` | `wrangler deploy` |
| `npm test` | `vitest` with the Cloudflare Workers pool |
| `npm run test:unit` | Local Node Vitest suite via `vitest.node.config.mts` |
| `npm run test:e2e` | `vitest --config vitest.e2e.config.mts` |
| `npm run test:e2e:local` | Local-Wrangler Telegram webhook smoke test with `RUN_E2E_LOCAL_WRANGLER=1` |
| `npm run cf-typegen` | `wrangler types --env-file /dev/null` |

## Worker Environments

`wrangler.jsonc` defines two environments.

| Env | Worker name | Bot username | D1 | Cron |
|-----|-------------|--------------|----|------|
| `dev` | `telegram-bot-dev` | `lili_DevDiceBot` | `DB` -> `dicebot-dev-db` | none active |
| `prod` | `telegram-bot` | `lili_DiceBot` | `DB` -> `dicebot-db` | `59 * * * *` |

The `Env` TypeScript type lives in `src/index.ts`.

## KV Bindings

Both dev and prod define these KV bindings:

- `TGBOTCOUNT`
- `NEWS_STORE`
- `AFFECTION_KV`
- `BOOK_STORE`
- `TOPIC_KV`
- `FISHING_RECORD_KV`
- `FISH_KV`
- `COIN_KV`
- `ITEM_STORE`

Current active usage:

- `NEWS_STORE`: `/news`
- `TOPIC_KV`: forum topic title cache
- `BOOK_STORE`: `/book`
- `FISHING_RECORD_KV`: fishing records and pond summaries
- `FISH_KV`: fish catalog
- `TGBOTCOUNT`: usage count legacy/supporting storage
- `AFFECTION_KV`: affection fallback/migration
- `COIN_KV`: legacy coin support
- `ITEM_STORE`: legacy item support only

## Durable Objects

Bindings:

- `COIN_DO` -> `CoinDO`
- `LOTTERY_DO` -> `LotteryDO`

Migrations are defined separately for dev and prod.

## Secrets And Vars

Plain vars in `wrangler.jsonc`:

- `BOT_USERNAME`
- `GITHUB_REPOSITORY`: `luyiqi-lili/DiceBot` in production.
- `GITHUB_PR_SCAN_LIMIT`: PR file-list reads per scan, default 20 and capped at 50.
- `GITHUB_AUTONOMY_LABEL`: issues eligible for autonomous consideration, default `bot:ready`.
- `GITHUB_ISSUE_SCAN_LIMIT`: ready-issue reads per scan, default 100 and capped at 500.
- `GITHUB_ISSUE_INTAKE_ENABLED`: fail-closed public issue write switch; production is explicitly set to `true`.
- `GITHUB_ISSUE_COOLDOWN_SECONDS`: per Telegram user/chat issue submission cooldown.
- `GITHUB_AI_TRIAGE_ENABLED`: fail-closed large-model Issue-triage switch; production is explicitly `true`.
- `GITHUB_AI_TRIAGE_SCAN_LIMIT`: maximum unready Issues inspected per hourly run; production is 50.
- `GITHUB_AI_TRIAGE_MIN_CONFIDENCE`: minimum low-risk model confidence required before adding `bot:ready`; production is 0.85.
- `AI_GATEWAY_ID`: AI Gateway name; production and dev use `default`.
- `TON_DONATION_ADDRESS`: optional public mainnet TON wallet address shown by `/donate ton`; it is not a secret. Production currently omits it, so TON donation is disabled safely.

Secrets expected by code or scripts:

- `TOKEN`: Telegram bot token.
- `EXTERNAL_API_KEY`: bearer key for regular `/api/*`; those routes fail closed when it is missing.
- `DONATION_INTAKE_KEY`: dedicated bearer token for `/api/donations/api-keys`; it grants no access to other admin APIs.
- `DONATION_ADMIN_KEY`: separate bearer token for credential metadata, validation, disable, and revoke.
- `DONATION_ENCRYPTION_KEY`: base64 representation of a random 32-byte key used for pseudonymous donor IDs and legacy D1 credential migration. New provider keys are never stored in D1.
- `AI_GATEWAY_TOKEN`: an AI Gateway **Run** token used for all inference.
- `AI_GATEWAY_MANAGEMENT_TOKEN`: an AI Gateway/Secrets Store management token used to add or revoke donated Provider Keys. Prefer the minimum account permissions that still cover custom providers, Provider Keys, and Secrets Store lifecycle.
- `AI_GATEWAY_ACCOUNT_ID`: the Cloudflare account containing the Gateway and Secrets Store.
- `GITHUB_TOKEN`: GitHub API token used for authenticated scans and, when intake is enabled without a dedicated token, Issue creation. It must have repository Issues write permission for that fallback.
- `GITHUB_ISSUE_TOKEN`: optional repository-scoped Issues write token used only by `/wish` and `/issue`. If absent, an explicitly enabled intake reuses `GITHUB_TOKEN` instead of copying the same credential into another Worker secret.

Regular `/api/*` routes reject access when `EXTERNAL_API_KEY` is absent. Donation intake is unavailable when its secrets, Gateway management credentials, or D1 are absent. Apply `schema/d1.sql`, then configure donation secrets with `wrangler secret put --env prod`; never commit them to `wrangler.jsonc`.

Current production secret audit (names only, verified 2026-07-30; never values):

- Active Cloudflare Worker secrets: `TOKEN`, `EXTERNAL_API_KEY`, `DONATION_INTAKE_KEY`, `DONATION_ENCRYPTION_KEY`, `AI_GATEWAY_TOKEN`, `AI_GATEWAY_MANAGEMENT_TOKEN`, `AI_GATEWAY_ACCOUNT_ID`, and `GITHUB_TOKEN`.
- Present legacy/orphan secrets: `GOOGLE_API_KEY`, `GOOGLE_API_KEYS`, `DEEPSEEK_API_KEY`, and `SILICONFLOW_API_KEY`. The active translation and Issue-gate paths do not read these values; donated provider keys are managed as Gateway aliases instead. `SILICONFLOW_API_KEY` has no current `Env` consumer.
- Supported secrets not configured in production: `DONATION_ADMIN_KEY`, `GITHUB_ISSUE_TOKEN`, and `GEMINI_API_KEY`. `GEMINI_API_KEY` remains in the TypeScript `Env` shape for compatibility but is not part of active routing.
- GitHub Actions: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `BOT_TOKEN`, `TOKEN`, and `DEV_BOT_TOKEN`.
- Local `.env`: development/operations credentials; local `BOT_TOKEN` maps to Worker `TOKEN`.
- Cross-platform rule: keep the GitHub token in Cloudflare for Worker-to-GitHub calls, and keep the Cloudflare account/token in GitHub Actions for CI deployment. Never reverse these destinations or commit either token. Grant only the repository permissions required by enabled Worker features.

External clients depend on `EXTERNAL_API_KEY`; never rotate it without a coordinated migration window.

Apply `schema/d1.sql` and ensure `GITHUB_TOKEN` has Issues write permission before enabling intake. A narrower `GITHUB_ISSUE_TOKEN` remains preferred when one is available. With no `DONATION_ADMIN_KEY`, list/validate/status admin APIs are intentionally unavailable; donor-owned Telegram revocation remains available.

AI triage fails closed unless its switch, D1, GitHub Issues write permission, AI Gateway, and a valid high-confidence low-risk response are all present. It prefers a donated Ollama Cloud large model and falls back to the Workers AI 70B binding; either route is enough, and both go through AI Gateway. It only adds the existing `bot:ready` label; it never edits code, creates a PR, or merges.

`/quota` only runs in a private chat and only inspects credentials donated by that Telegram user. Gateway-managed Gemini and Ollama Cloud credentials report their latest validated health and model catalog. When a provider exposes no precise remaining-quota API, the response says so explicitly. Keys are never read back from Secrets Store, echoed, or logged.

See [AI routing and donated credentials](ai-routing.md) for provider registration, model selection, rotation, and cost classes.

## Deployment Notification

`scripts/notify-deploy.sh` sends Telegram deploy notifications. Production defaults to a private message to administrator `8080375150`, while development keeps its group topic target. `CHAT_ID` and optional `TOPIC_ID` can override the destination; the bot token must remain in GitHub Secrets.

Pushing `main` runs the production publish workflow. Do not follow a successful `main` push with a second manual deploy unless explicitly recovering from a release failure.

## Webhook Setup

Use Telegram `setWebhook` with the dev or prod Worker URL and the corresponding bot token. Keep tokens out of committed files.
