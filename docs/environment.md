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

Secrets expected by code or scripts:

- `TOKEN`: Telegram bot token.
- `DEEPSEEK_API_KEY` or `DEEPSEEK_API_KEYS`: AI provider credentials.
- `DEEPSEEK_BASE_URL`: optional override, default is in `src/lib/deepseekClient.ts`.
- `EXTERNAL_API_KEY`: optional API key for `/api/*`.
- `DONATION_INTAKE_KEY`: dedicated bearer token for `/api/donations/api-keys`; it grants no access to other admin APIs.
- `DONATION_ENCRYPTION_KEY`: base64 representation of a random 32-byte AES master key.
- `GITHUB_TOKEN`: optional read-only token; public repositories can be scanned anonymously at a lower rate limit.

Regular `/api/*` routes reject access when `EXTERNAL_API_KEY` is absent. Donation intake is unavailable when its secrets or D1 are absent. Apply `schema/d1.sql`, then configure donation secrets with `wrangler secret put --env prod`; never commit them to `wrangler.jsonc`.

Current secret placement (names only, never values):

- Cloudflare Worker: `TOKEN`, `EXTERNAL_API_KEY`, `DONATION_INTAKE_KEY`, `DONATION_ENCRYPTION_KEY`, and existing model-provider keys.
- GitHub Actions: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `BOT_TOKEN`, `TOKEN`, and `DEV_BOT_TOKEN`.
- Local `.env`: development/operations credentials; local `BOT_TOKEN` maps to Worker `TOKEN`.
- The high-privilege personal `GH_TOKEN` remains local and is not copied to Cloudflare or GitHub Actions.

External clients depend on `EXTERNAL_API_KEY`; never rotate it without a coordinated migration window.

## Local Wish Automation Env

`scripts/wish-local.sh setup` writes `.wish-local.env`, which is ignored by git. It can contain:

- `WORKER_BASE_URL`
- `EXTERNAL_API_KEY`
- `BOT_TOKEN`
- `CHAT_ID`
- `TOPIC_ID`
- `WISH_VERIFY_CMD`

## Deployment Notification

`scripts/notify-deploy.sh` sends a Telegram deploy notification. It currently contains literal notification bot configuration and should be converted to environment variables/secrets before broader use.

## Webhook Setup

Use Telegram `setWebhook` with the dev or prod Worker URL and the corresponding bot token. Keep tokens out of committed files.
