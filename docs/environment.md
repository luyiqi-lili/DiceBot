# Environment And Deployment

Chinese translation: [zh-CN/environment.md](zh-CN/environment.md)

## Package Scripts

`package.json` defines:

| Script | Command |
|--------|---------|
| `npm run dev` | `wrangler dev` |
| `npm run start` | `wrangler dev` |
| `npm run deploy` | `wrangler deploy` |
| `npm test` | `vitest` |
| `npm run test:e2e` | `vitest --config vitest.e2e.config.mts` |
| `npm run cf-typegen` | `wrangler types` |

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
- `GITHUB_ISSUE_INTAKE_ENABLED`: fail-closed public issue write switch; committed default is `false`.
- `GITHUB_ISSUE_COOLDOWN_SECONDS`: per Telegram user/chat issue submission cooldown.

Secrets expected by code or scripts:

- `TOKEN`: Telegram bot token.
- `EXTERNAL_API_KEY`: optional API key for `/api/*`.
- `DONATION_INTAKE_KEY`: dedicated bearer token for `/api/donations/api-keys`; it grants no access to other admin APIs.
- `DONATION_ADMIN_KEY`: separate bearer token for credential metadata, validation, disable, and revoke.
- `DONATION_ENCRYPTION_KEY`: base64 representation of a random 32-byte AES master key.
- `GITHUB_TOKEN`: optional read-only token; public repositories can be scanned anonymously at a lower rate limit.
- `GITHUB_ISSUE_TOKEN`: repository-scoped Issues write token used only by `/wish` and `/issue`.

Regular `/api/*` routes reject access when `EXTERNAL_API_KEY` is absent. Donation intake is unavailable when its secrets or D1 are absent. Apply `schema/d1.sql`, then configure donation secrets with `wrangler secret put --env prod`; never commit them to `wrangler.jsonc`.

Current secret placement (names only, never values):

- Cloudflare Worker: `TOKEN`, `EXTERNAL_API_KEY`, `DONATION_INTAKE_KEY`, `DONATION_ADMIN_KEY`, `DONATION_ENCRYPTION_KEY`, `GITHUB_TOKEN`, and `GITHUB_ISSUE_TOKEN`. Local `.env` `GH_TOKEN` maps to runtime `GITHUB_TOKEN`; do not reuse it as the issue-write token unless its scope was intentionally designed for both.
- GitHub Actions: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `BOT_TOKEN`, `TOKEN`, and `DEV_BOT_TOKEN`.
- Local `.env`: development/operations credentials; local `BOT_TOKEN` maps to Worker `TOKEN`.
- Cross-platform rule: keep the GitHub token in Cloudflare for Worker-to-GitHub calls, and keep the Cloudflare account/token in GitHub Actions for CI deployment. Never reverse these destinations or commit either token. Prefer a repository-scoped read-only GitHub token for the Worker.

External clients depend on `EXTERNAL_API_KEY`; never rotate it without a coordinated migration window.

Apply `schema/d1.sql` and configure both dedicated write/admin tokens before changing `GITHUB_ISSUE_INTAKE_ENABLED` to `true`. The committed configuration deliberately keeps this write path disabled.

## Deployment Notification

`scripts/notify-deploy.sh` sends a Telegram deploy notification. It currently contains literal notification bot configuration and should be converted to environment variables/secrets before broader use.

## Webhook Setup

Use Telegram `setWebhook` with the dev or prod Worker URL and the corresponding bot token. Keep tokens out of committed files.
