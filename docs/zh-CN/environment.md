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
- `GITHUB_REPOSITORY`：生产环境为 `luyiqi-lili/DiceBot`。
- `GITHUB_PR_SCAN_LIMIT`：单轮进一步读取文件列表的 PR 上限，默认 20，最大 50。

代码或脚本期望的 secrets：

- `TOKEN`：Telegram bot token。
- `DEEPSEEK_API_KEY` 或 `DEEPSEEK_API_KEYS`：AI provider 凭据。
- `DEEPSEEK_BASE_URL`：可选覆盖。
- `EXTERNAL_API_KEY`：`/api/*` 可选 API key。
- `DONATION_INTAKE_KEY`：仅用于 `/api/donations/api-keys` 的 bearer token，不授予其他管理 API 权限。
- `DONATION_ENCRYPTION_KEY`：32 字节随机 AES 主密钥的 base64 表示。
- `GITHUB_TOKEN`：可选的 GitHub 只读 token；公开仓库可匿名扫描，但限额更低。

普通 `/api/*` 在 `EXTERNAL_API_KEY` 缺失时拒绝访问。捐赠入口在 donation secret 或 D1 缺失时返回不可用。执行 `schema/d1.sql` 后，再通过 `wrangler secret put --env prod` 配置 donation secrets；不要把密钥写进 `wrangler.jsonc`。

当前 secret 放置（只记录名称，不记录值）：

- Cloudflare Worker：`TOKEN`、`EXTERNAL_API_KEY`、`DONATION_INTAKE_KEY`、`DONATION_ENCRYPTION_KEY` 和现有模型 provider keys。
- GitHub Actions：`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`、`BOT_TOKEN`、`TOKEN`、`DEV_BOT_TOKEN`。
- 本地 `.env`：保留开发/运维需要的凭据；`BOT_TOKEN` 映射到 Worker 的 `TOKEN`。
- 高权限个人 `GH_TOKEN` 只保留本地，不复制到 Cloudflare 或 GitHub Actions。

`EXTERNAL_API_KEY` 有外部调用方依赖，不能未经迁移窗口直接轮换。

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
