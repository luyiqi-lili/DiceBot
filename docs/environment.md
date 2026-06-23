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
- `DEEPSEEK_MODEL`

Secrets expected by code or scripts:

- `TOKEN`: Telegram bot token.
- `DEEPSEEK_API_KEY` or `DEEPSEEK_API_KEYS`: AI provider credentials.
- `DEEPSEEK_BASE_URL`: optional override, default is in `src/lib/deepseekClient.ts`.
- `EXTERNAL_API_KEY`: optional API key for `/api/*`.

Security note: `/api/*` rejects unauthorized requests only when `EXTERNAL_API_KEY` is configured. Configure it in production or close the API routes.

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
