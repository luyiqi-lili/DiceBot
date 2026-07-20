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
- `GITHUB_AUTONOMY_LABEL`：可进入自治候选的 Issue 标签，默认 `bot:ready`。
- `GITHUB_ISSUE_SCAN_LIMIT`：单轮候选 Issue 上限，默认 100，最大 500。
- `GITHUB_ISSUE_INTAKE_ENABLED`：默认拒绝的公开 Issue 写开关；生产环境已显式设为 `true`。
- `GITHUB_ISSUE_COOLDOWN_SECONDS`：同一 Telegram 用户/群组的提交冷却时间。

代码或脚本期望的 secrets：

- `TOKEN`：Telegram bot token。
- `EXTERNAL_API_KEY`：`/api/*` 可选 API key。
- `DONATION_INTAKE_KEY`：仅用于 `/api/donations/api-keys` 的 bearer token，不授予其他管理 API 权限。
- `DONATION_ADMIN_KEY`：查看、验证、禁用和撤销捐赠凭据的独立 bearer token。
- `DONATION_ENCRYPTION_KEY`：32 字节随机 AES 主密钥的 base64 表示。
- `GITHUB_TOKEN`：用于鉴权扫描的 GitHub API token；开启 intake 且没有专用 token 时也用于创建 Issue，因此该回退方式要求仓库 Issues 写权限。
- `GITHUB_ISSUE_TOKEN`：可选、仅供 `/wish`、`/issue` 创建 Issue 的仓库级 Issues 写 token。未配置时，显式开启的入口复用 `GITHUB_TOKEN`，避免把同一高权限凭据复制成第二份 Worker secret。

普通 `/api/*` 在 `EXTERNAL_API_KEY` 缺失时拒绝访问。捐赠入口在 donation secret 或 D1 缺失时返回不可用。执行 `schema/d1.sql` 后，再通过 `wrangler secret put --env prod` 配置 donation secrets；不要把密钥写进 `wrangler.jsonc`。

当前 secret 放置（只记录名称，不记录值）：

- Cloudflare Worker：`TOKEN`、`EXTERNAL_API_KEY`、`DONATION_INTAKE_KEY`、`DONATION_ADMIN_KEY`、`DONATION_ENCRYPTION_KEY` 与 `GITHUB_TOKEN`。代码支持专用 `GITHUB_ISSUE_TOKEN`，但当前生产环境未配置。本地 `.env` 的 `GH_TOKEN` 写入 Cloudflare 时映射为 `GITHUB_TOKEN`。
- GitHub Actions：`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`、`BOT_TOKEN`、`TOKEN`、`DEV_BOT_TOKEN`。
- 本地 `.env`：保留开发/运维需要的凭据；`BOT_TOKEN` 映射到 Worker 的 `TOKEN`。
- 跨平台规则：GitHub token 放 Cloudflare，供 Worker 调用 GitHub；Cloudflare account/token 放 GitHub Actions，供 CI 发布。不要把两者目标放反，也不要提交到仓库；只授予已启用 Worker 功能所需的仓库权限。

`EXTERNAL_API_KEY` 有外部调用方依赖，不能未经迁移窗口直接轮换。

先执行 `schema/d1.sql` 并确认 `GITHUB_TOKEN` 具备 Issues 写权限，再开启 intake。有条件时仍应换成权限更窄的 `GITHUB_ISSUE_TOKEN`。

## 部署通知

`scripts/notify-deploy.sh` 会发送 Telegram 部署通知。当前脚本包含字面量通知配置，应迁移到环境变量或 secrets。

## Webhook 设置

使用 Telegram `setWebhook` 指向 dev 或 prod Worker URL，并使用对应 bot token。不要提交 token。
