# AI 路由与凭据捐赠

English source: [../ai-routing.md](../ai-routing.md)

本文是当前 AI 功能的事实来源。`src/lib/modelRouting.ts` 中的免费模型种子用于模型推荐 API，不等于 `/trans` 的实际运行路由。

## 当前功能

| 功能 | 路由顺序 | 用途 |
|------|----------|------|
| `/trans` | 捐赠 Gemini → 捐赠 Ollama Cloud 小模型 → Workers AI 3B | 翻译 |
| 每小时 GitHub Issue 门禁 | 捐赠 Ollama Cloud 大模型 → Workers AI 70B | 判断一个已通过静态规则的 Issue 能否获得 `bot:ready` |

所有推理都经过 Cloudflare AI Gateway，没有直连提供商的回退。`/ask`、`/report` 和内联 AI 聊天当前未启用。

## 模型

翻译当前请求：

- Gemini：`gemini-3.5-flash-lite`。
- Ollama Cloud：依次选择账号可见的 `gpt-oss:20b`、`nemotron-3-nano:4b`、`qwen3.5:9b`、`qwen3.5:4b`、`qwen3.5:2b`、`qwen3.5:0.8b`；都没有时，选择发现到的最大不超过 20B 模型。
- Workers AI：`@cf/meta/llama-3.2-3b-instruct`。

Issue 门禁当前请求：

- Ollama Cloud：依次选择账号可见的 `qwen3.5:397b`、`qwen3.5`、`gpt-oss:120b`、`nemotron-3-super:120b`、`mistral-large-3`、`deepseek-v4-flash`；都没有时，选择发现到的最大不小于 70B 模型。
- Workers AI：`@cf/meta/llama-3.3-70b-instruct-fp8-fast`。

Ollama 选择来自每把凭据最近一次成功的 OpenAI 兼容 `/v1/models` 验证。偏好列表中有某个模型，不代表每个捐赠账号都能访问它。

## 项目费用分级

这些类别是项目路由策略，不保证提供商未来价格：

| 类别 | 项目含义 | 当前示例 | 自动用途 |
|------|----------|----------|----------|
| 完全免费 | 小模型或免费层容量，用于低成本翻译 | Gemini 免费层、Ollama Cloud 小模型、Workers AI 3B | 翻译 |
| 免费但有限额 | 账号或月度额度有限，保留给较大推理 | Ollama Cloud 大模型、Workers AI 70B | Issue 门禁 |
| 收费 | 不假设存在免费额度 | DeepSeek、OpenAI、Anthropic、OpenRouter 捐赠 | 默认不自动调用 |

D1 凭据行把 Google 记为 `completely_free`，Ollama Cloud 记为 `free_limited`，其他提供商记为 `paid`。在功能层面，`/status` 把可用 Ollama 小模型池展示在“完全免费”，把大模型池展示在“免费但有限额”。

`FREE_MODEL_SEEDS` 中的 Gemini 2.5 模型用于 `/api/ai/route` 推荐；实际翻译另行固定为 `gemini-3.5-flash-lite`。

## 捐赠生命周期

1. 用户在私聊中发送 `/donatetoken <平台> <授权范围> <token>`。
2. 机器人必须先删除含密钥的 Telegram 原消息，之后才能查询或写入；删除失败会拒绝捐赠。
3. 密钥写入 Cloudflare AI Gateway Secrets Store，并关联到该次捐赠专属的 Provider Key alias。
4. D1 仅记录不可逆指纹、匿名 donor label、Gateway alias/Secret/Store id、平台、费用分类、授权、健康状态和缓存模型元数据。
5. 接收后立即执行该平台支持的只读验证。即使健康，`validation_only` 也不会进入共享推理；只有 `shared_inference + healthy + active` 才可路由。
6. 多把可用 alias 分别使用 D1 游标轮询 Gemini 翻译、Ollama 翻译和 Ollama Issue 门禁。
7. `/revoketoken ... confirm` 先删除 Gateway secret，再把 D1 元数据标为 revoked；删除失败时默认拒绝继续。

支持的捐赠名称是 `gemini`、`ollama`、`deepseek`、`openai`、`anthropic`、`openrouter`。Google 和 Ollama 通过 Gateway 列出模型验证。新托管的 DeepSeek alias 因无法读回密钥，只标记项目支持的高级模型目录；只有旧 D1 加密 DeepSeek 记录可调用直连余额接口。OpenAI、Anthropic、OpenRouter 尚未实现验证。

虽然新密钥不再加密写入 D1，`DONATION_ENCRYPTION_KEY` 仍然必需：它用于生成 HMAC 匿名 donor label，并支持受控迁移旧密文。

## Ollama Cloud 提供商

Ollama Cloud 注册为账户级 Cloudflare AI Gateway custom provider：

- Worker binding 使用的 Gateway slug：`custom-ollama-cloud`。
- 账户 custom-provider slug：`ollama-cloud`。
- Base URL：`https://ollama.com`。
- 模型发现：`GET /v1/models`。
- 推理：`POST /v1/chat/completions`。

提供商凭据保留在 AI Gateway。Worker 只发送 Provider Key alias，无法取回用户原始密钥值。

## 命令与 API

- `/status`：公开、只读的服务就绪情况与聚合池数量；不显示捐赠者、指纹、alias 或密钥值。
- `/quota`：仅私聊；只显示本人凭据的缓存健康/模型元数据和支持的余额结果。
- `/revoketoken`：仅私聊；只能列出和撤销本人的捐赠。
- `POST /api/donations/api-keys`：受保护的 intake。
- `GET /api/donations/api-keys`、`POST .../:id/validate`、`POST .../:id/status`：受保护的管理操作；没有 `DONATION_ADMIN_KEY` 时不可用。
- `POST .../:id/migrate`：单条旧凭据迁移，可用 admin、intake 或 Gateway management bearer。

## 生产配置

2026-07-30 的只读生产检查确认：

- `AI_GATEWAY_ID=default` 是 Worker 明文 var，Workers AI `AI` binding 已配置。
- Gateway Run、Gateway 管理、账户 id、捐赠 intake、捐赠者匿名化、Telegram、外部 API 和 GitHub secrets 已存在。
- 账户级 custom provider `ollama-cloud` 已启用并指向 `https://ollama.com`。
- `DONATION_ADMIN_KEY`、专用 `GITHUB_ISSUE_TOKEN`、`TON_DONATION_ADDRESS`、`GEMINI_API_KEY` 未配置。
- 遗留 `GOOGLE_API_KEY`、`GOOGLE_API_KEYS`、`DEEPSEEK_API_KEY`、`SILICONFLOW_API_KEY` secrets 仍存在，但当前 AI 路由不读取。

文档只记录 secret 名称。不得打印、记录、提交或从 Cloudflare 复制出密钥值。

## 失败处理

- Gateway Run 配置缺失时，两项 AI 功能都不可用，不会改成直连提供商。
- 一把捐赠 alias 失败时，会尝试同池下一把或下一个提供商。
- 收费提供商不会成为自动回退。
- 捐赠密钥调用关闭 Gateway 请求 payload 日志。
- 当前无法显示 Ollama 精确剩余额度，只能以健康状态和账号可见模型为信号。
