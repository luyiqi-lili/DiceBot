# 环境与部署

English source: [../environment.md](../environment.md)

## Package Scripts

| Script | Command |
|--------|---------|
| `npm run dev` | `wrangler dev` |
| `npm run start` | `wrangler dev` |
| `npm run deploy` | `wrangler deploy` |
| `npm test` | 使用 Cloudflare Workers pool 的 `vitest` |
| `npm run test:unit` | 通过 `vitest.node.config.mts` 运行本地 Node 单元测试 |
| `npm run test:e2e` | `vitest --config vitest.e2e.config.mts` |
| `npm run test:e2e:local` | 设置 `RUN_E2E_LOCAL_WRANGLER=1` 的本地 Wrangler Telegram webhook 冒烟测试 |
| `npm run cf-typegen` | `wrangler types --env-file /dev/null` |

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
- `GITHUB_AI_TRIAGE_ENABLED`：默认拒绝的大模型 Issue 审批开关；生产显式为 `true`。
- `GITHUB_AI_TRIAGE_SCAN_LIMIT`：每小时最多检查的未 ready Issue 数；生产为 50。
- `GITHUB_AI_TRIAGE_MIN_CONFIDENCE`：添加 `bot:ready` 所需的低风险模型最低置信度；生产为 0.85。
- `AI_GATEWAY_ID`：AI Gateway 名称；dev 与 prod 都使用 `default`。
- `TON_DONATION_ADDRESS`：`/donate ton` 展示的可选 TON 主网公开收款地址，不属于 secret。生产当前未设置，因此 TON 捐赠安全关闭。

代码或脚本期望的 secrets：

- `TOKEN`：Telegram bot token。
- `EXTERNAL_API_KEY`：普通 `/api/*` 的 bearer key；缺失时这些路由默认拒绝。
- `DONATION_INTAKE_KEY`：仅用于 `/api/donations/api-keys` 的 bearer token，不授予其他管理 API 权限。
- `DONATION_ADMIN_KEY`：查看、验证、禁用和撤销捐赠凭据的独立 bearer token。
- `DONATION_ENCRYPTION_KEY`：32 字节随机密钥的 base64 表示，仅用于捐赠者匿名标识和旧 D1 凭据迁移；新 Provider Key 不写入 D1。
- `AI_GATEWAY_TOKEN`：AI Gateway **Run** token，所有 AI 推理都经它进入 Gateway。
- `AI_GATEWAY_MANAGEMENT_TOKEN`：AI Gateway/Secrets Store 管理 token，用于添加或撤销捐赠的 Provider Keys。权限应尽量只覆盖 custom provider、Provider Key 与 Secrets Store 生命周期。
- `AI_GATEWAY_ACCOUNT_ID`：AI Gateway 与 Secrets Store 所在的 Cloudflare 账户。
- `GITHUB_TOKEN`：用于鉴权扫描的 GitHub API token；开启 intake 且没有专用 token 时也用于创建 Issue，因此该回退方式要求仓库 Issues 写权限。
- `GITHUB_ISSUE_TOKEN`：可选、仅供 `/wish`、`/issue` 创建 Issue 的仓库级 Issues 写 token。未配置时，显式开启的入口复用 `GITHUB_TOKEN`，避免把同一高权限凭据复制成第二份 Worker secret。

普通 `/api/*` 在 `EXTERNAL_API_KEY` 缺失时拒绝访问。捐赠入口在 donation secret、Gateway 管理凭据或 D1 缺失时返回不可用。执行 `schema/d1.sql` 后，再通过 `wrangler secret put --env prod` 配置 donation secrets；不要把密钥写进 `wrangler.jsonc`。

当前生产 secret 审计（2026-07-30 验证；只记录名称，不记录值）：

- 生产正在使用的 Worker secrets：`TOKEN`、`EXTERNAL_API_KEY`、`DONATION_INTAKE_KEY`、`DONATION_ENCRYPTION_KEY`、`AI_GATEWAY_TOKEN`、`AI_GATEWAY_MANAGEMENT_TOKEN`、`AI_GATEWAY_ACCOUNT_ID`、`GITHUB_TOKEN`。
- 生产仍存在但当前路由不读取的遗留/孤立 secrets：`GOOGLE_API_KEY`、`GOOGLE_API_KEYS`、`DEEPSEEK_API_KEY`、`SILICONFLOW_API_KEY`。翻译和 Issue 门禁使用 Gateway 捐赠 alias；`SILICONFLOW_API_KEY` 当前没有对应 `Env` 消费者。
- 代码支持但生产未配置的 secrets：`DONATION_ADMIN_KEY`、`GITHUB_ISSUE_TOKEN`、`GEMINI_API_KEY`。`GEMINI_API_KEY` 仅为兼容保留在 TypeScript `Env` 类型中，不参与当前路由。
- GitHub Actions：`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`、`BOT_TOKEN`、`TOKEN`、`DEV_BOT_TOKEN`。
- 本地 `.env`：保留开发/运维需要的凭据；`BOT_TOKEN` 映射到 Worker 的 `TOKEN`。
- 跨平台规则：GitHub token 放 Cloudflare，供 Worker 调用 GitHub；Cloudflare account/token 放 GitHub Actions，供 CI 发布。不要把两者目标放反，也不要提交到仓库；只授予已启用 Worker 功能所需的仓库权限。

`EXTERNAL_API_KEY` 有外部调用方依赖，不能未经迁移窗口直接轮换。

先执行 `schema/d1.sql` 并确认 `GITHUB_TOKEN` 具备 Issues 写权限，再开启 intake。有条件时仍应换成权限更窄的 `GITHUB_ISSUE_TOKEN`。未配置 `DONATION_ADMIN_KEY` 时，列表/验证/状态管理 API 会保持关闭；捐赠者通过 Telegram 撤销自己的密钥仍然可用。

AI 审批只有在开关、D1、GitHub Issues 写权限、AI Gateway 和高置信度低风险响应全部满足时才执行。调用优先使用捐赠的 Ollama Cloud 大模型，回退 Workers AI 70B；两者任一可用即可，并全部经 AI Gateway。它只会添加已有的 `bot:ready` 标签，不会改代码、创建 PR 或合并。

`/quota` 只在私聊中检查当前用户捐赠的凭据。AI Gateway 托管的 Gemini 与 Ollama Cloud 显示最近验证的健康状态和模型目录；供应商没有提供精确余额 API 时会明确说明。密钥不会从 Secrets Store 读回、回显或写入日志。

提供商注册、模型选择、轮询与费用分类见 [AI 路由与凭据捐赠](ai-routing.md)。

## 部署通知

`scripts/notify-deploy.sh` 会发送 Telegram 部署通知。生产工作流默认私聊管理员 `8080375150`，开发环境继续发送到开发群话题；可通过 `CHAT_ID` 和可选的 `TOPIC_ID` 覆盖目标。Bot token 必须来自 GitHub Secrets，不能写入仓库。

推送 `main` 会运行生产发布工作流。成功推送后不要再手动部署一次，除非明确进行发布故障恢复。

## Webhook 设置

使用 Telegram `setWebhook` 指向 dev 或 prod Worker URL，并使用对应 bot token。不要提交 token。
