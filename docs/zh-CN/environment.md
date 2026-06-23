# 环境与部署

English source: [../environment.md](../environment.md)

## Package Scripts

| Script | Command |
|--------|---------|
| `npm run dev` | `wrangler dev` |
| `npm run start` | `wrangler dev` |
| `npm run deploy` | `wrangler deploy` |
| `npm test` | `vitest` |
| `npm run test:e2e` | `vitest --config vitest.e2e.config.mts` |
| `npm run cf-typegen` | `wrangler types` |

## Worker 环境

| Env | Worker name | Bot username | D1 | Cron |
|-----|-------------|--------------|----|------|
| `dev` | `telegram-bot-dev` | `lili_DevDiceBot` | `DB` -> `dicebot-dev-db` | 无活跃 cron |
| `prod` | `telegram-bot` | `lili_DiceBot` | `DB` -> `dicebot-db` | `59 * * * *` |

`Env` TypeScript 类型定义在 `src/index.ts`。

## KV 绑定

dev 和 prod 都定义：

- `TGBOTCOUNT`
- `NEWS_STORE`
- `AFFECTION_KV`
- `BOOK_STORE`
- `TOPIC_KV`
- `FISHING_RECORD_KV`
- `FISH_KV`
- `COIN_KV`
- `ITEM_STORE`

当前用途见 [storage.md](storage.md)。

## Durable Objects

- `COIN_DO` -> `CoinDO`
- `LOTTERY_DO` -> `LotteryDO`

dev 和 prod 分别定义 Durable Object migrations。

## Secrets 与 Vars

`wrangler.jsonc` 中的明文 vars：

- `BOT_USERNAME`
- `DEEPSEEK_MODEL`

代码或脚本期望的 secrets：

- `TOKEN`：Telegram bot token。
- `DEEPSEEK_API_KEY` 或 `DEEPSEEK_API_KEYS`：AI provider 凭据。
- `DEEPSEEK_BASE_URL`：可选覆盖。
- `EXTERNAL_API_KEY`：`/api/*` 可选 API key。

安全注意：`/api/*` 只有在配置 `EXTERNAL_API_KEY` 时才会拒绝未授权请求。生产应配置该 secret 或关闭 API 路由。

## 本地 Wish 自动化环境

`scripts/wish-local.sh setup` 会写入 `.wish-local.env`，可包含：

- `WORKER_BASE_URL`
- `EXTERNAL_API_KEY`
- `BOT_TOKEN`
- `CHAT_ID`
- `TOPIC_ID`
- `WISH_VERIFY_CMD`

## 部署通知

`scripts/notify-deploy.sh` 会发送 Telegram 部署通知。当前脚本包含字面量通知配置，应迁移到环境变量或 secrets。

## Webhook 设置

使用 Telegram `setWebhook` 指向 dev 或 prod Worker URL，并使用对应 bot token。不要提交 token。
