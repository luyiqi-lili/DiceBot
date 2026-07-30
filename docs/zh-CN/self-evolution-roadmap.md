# 自进化系统分阶段路线图

English source: [../self-evolution-roadmap.md](../self-evolution-roadmap.md)

本项目按权限边界分阶段开放自治能力。当前已实现阶段 1 与阶段 2 的可审计基础，并开放 Stars 收款与可追踪的 TON 转账意向；自动修改源码、合并、对外付款或套餐变更仍未启用。

## 已实现：阶段 1 可审计底座

- 生产 Cron 每小时只读扫描开放 PR，保存提交 SHA、文件统计和静态风险信号。
- `POST /api/donations/api-keys` 使用独立 intake bearer token 接收密钥，以 SHA-256 指纹去重，并立即托管到 Cloudflare AI Gateway Secrets Store；D1 只保存 alias、Secret ID 与非敏感元数据，HTTP API 永不返回密钥。
- Telegram 私聊支持 <code>/donatetoken 平台 授权范围 Token</code>（兼容 <code>/donate_token</code>）。含参数消息必须先删除成功才会调用同一受保护 intake；删除失败、非私聊、配置缺失或超过每用户每天 5 个的限制时均拒绝保存。Telegram 用户 ID 只用于生成不可逆 HMAC 标签，不以明文写入捐赠表。
- 缺少 D1、GitHub 或加密配置时安全跳过，不影响 Telegram 基础功能。

## 已实现：阶段 2A 需求 Issue 与候选选择

### Telegram 需求入口

开启 `GITHUB_ISSUE_INTAKE_ENABLED=true` 后，用户可发送：

```text
/wish 增加一个可按群组关闭的每日签到功能
```

`/issue` 是同义命令。机器人优先使用专用 `GITHUB_ISSUE_TOKEN` 创建公开 GitHub Issue；未配置时复用现有 `GITHUB_TOKEN`。公开正文只包含需求内容，不包含 Telegram chat/user id；私有映射保存在 D1，用于每用户冷却和 30 天重复检查。

写入口必须由 `GITHUB_ISSUE_INTAKE_ENABLED=true` 显式开启。用户创建的 Issue 不会直接获得自治标签，只有维护者或 Ollama Cloud/Workers AI 免费额度大模型门禁批准后才添加 `bot:ready`。

### PR 优先、Issue 回退

每小时审视顺序：

1. 扫描全部开放 PR，并读取配置数量内的文件列表。
2. 非草稿且文件详情完整、静态风险为低的 PR 视为“合适的社区 PR”。
3. 扫描带 `bot:ready` 的开放 Issue。
4. 有开放 PR 明确 `fixes/closes/resolves` 某 Issue 时，该 Issue 不会被选中。
5. 涉及鉴权、Token、支付、资金、权限、工作流、部署、schema、迁移、加密或安全的 Issue 自动排除。
6. 只有 PR 扫描成功且没有合适社区 PR 时，才按优先级、类型、描述完整度、年龄和讨论量选出一个候选。

结果写入 `github_issue_snapshots` 与 `evolution_selection_runs`。受 `EXTERNAL_API_KEY` 保护的 `GET /api/evolution/candidate` 可让隔离的外部执行器读取当前候选；Worker 本身不会 checkout、改代码、创建分支或合并。

## 已实现：阶段 2B Token 平台与免费模型目录

捐赠请求必须明确平台，别名会归一化，例如 `gemini`、`google`、`google-ai-studio` 均保存为 `google-gemini`，`ollama` 保存为 `ollama-cloud`。支持的平台目录还包括 `openai`、`anthropic`、`deepseek` 与 `openrouter`；已实现 Google Gemini 与 Ollama Cloud 模型列表验证，以及 DeepSeek 官方余额验证。Ollama 首次捐赠会在账户级 AI Gateway 中按需创建指向 `https://ollama.com` 的 Custom Provider。

请求示例：

```json
{
  "provider": "ollama",
  "apiKey": "donated-secret",
  "donorLabel": "community-member",
  "usagePolicy": "shared_inference"
}
```

`usagePolicy` 有两种：

- `validation_only`：默认值；接收时仍执行平台支持的只读验证，但不进入推理路由。
- `shared_inference`：捐赠者明确允许验证、健康检查和后续共享推理路由。

`DONATION_ADMIN_KEY` 保护以下管理接口；生产当前未配置该 secret，因此这些管理接口关闭：

- `GET /api/donations/api-keys`：只返回平台、指纹、状态、授权用途和模型目录等非敏感字段。
- `POST /api/donations/api-keys/:id/validate`：经 AI Gateway alias 调用只读模型列表；Ollama 使用 `/api/tags`，Gemini 使用 `models.list`。
- `POST /api/donations/api-keys/:id/status`：设置 `pending`、`disabled` 或 `revoked`；撤销会先删除 Secrets Store 中的密钥，删除失败则不改变 D1 状态。

每小时最多轮询一个 `shared_inference` 凭据。Gemini 验证调用官方 `models.list`，Ollama Cloud 验证调用 `/api/tags`；成功后只记录可见模型名称。健康检查不会发送用户需求内容。

捐赠者本人仍可在私聊使用 `/revoketoken`。撤销会先删除 Secrets Store 密钥，再把 D1 元数据标为 revoked；删除失败时默认拒绝修改。新托管的 DeepSeek alias 因无法读回密钥，只记录项目支持的高级模型目录；只有旧 D1 加密 DeepSeek 记录可调用直连余额接口。

当前免费候选种子为 `gemini-2.5-flash-lite`、`gemini-2.5-flash` 与 `gemini-2.5-pro`，核对日期为 2026-07-20，来源为 Google 官方[模型列表](https://ai.google.dev/gemini-api/docs/models)与[价格页](https://ai.google.dev/gemini-api/docs/pricing)。免费层受地区、账号和速率限制影响，种子不等于永久可用承诺。该目录与实际翻译路由分开；`/trans` 当前请求 `gemini-3.5-flash-lite`。

受 `EXTERNAL_API_KEY` 保护的接口：

- `GET /api/ai/models`：查看 provider 与免费模型种子。
- `GET /api/ai/route?complexity=standard&budget=depleted`：得到路由建议。只有 `active + shared_inference + healthy` 的凭据能把结果标记为已验证可用；否则只返回不可执行的目录建议。

## 已实现：阶段 2C 免费额度大模型自动批准

每小时 Cron 会先静态过滤尚未 ready 的 Issue，排除已指派、锁定、已有 PR 关联、描述不足、被阻止以及鉴权、资金、权限、部署、迁移、安全等受保护主题；每轮最多审核一个合格 Issue。唯一允许的 GitHub 自动写入是添加现有的 `bot:ready` 标签。

当前审核优先轮询捐赠的 Ollama Cloud alias，并从该账号实际可见模型中选择大模型；不可用时回退 Workers AI 的 `@cf/meta/llama-3.3-70b-instruct-fp8-fast`。两者都经 AI Gateway。必须返回 `risk=low`，且置信度达到 `GITHUB_AI_TRIAGE_MIN_CONFIDENCE`（生产为 `0.85`）。翻译继续优先 Gemini 免费层，再使用 Ollama Cloud 小模型与 Workers AI `@cf/meta/llama-3.2-3b-instruct`。

所有结果写入 `ai_issue_triage_runs`，不保存提示词或密钥；未修改的已拒绝 Issue 不会重复消耗模型，Issue 更新后可再次审核。`GET /api/evolution/candidate` 会返回最新非敏感审核记录。

`GET /api/evolution/github-auth` 受 `EXTERNAL_API_KEY` 保护，用于只读诊断 Worker 内的 `GITHUB_TOKEN`。它只读取配置仓库的元数据，并返回认证及读/推送/admin 权限状态；不会返回 token，也不会调用会修改 GitHub 状态的接口。

## 尚未实现的高风险阶段

### 阶段 3：隔离执行与 AI 审阅

- 在 GitHub Actions 或独立 runner checkout 候选 Issue，运行测试、类型检查和安全扫描。
- 只允许创建草稿 PR；模型不能修改凭据、门禁规则或发布权限。
- 把结构化评审保存到 D1；GitHub 评论需要单独写开关。

### 阶段 4：受控合并

- 自动合并仅考虑低风险白名单路径、完整测试与分支保护。
- 保留人工 kill switch、并发锁、失败退避和快速回滚。

### 阶段 5：资金闭环

- 已接入 Stars 成功支付流水，以及带唯一备注的 TON 转账意向；TON 链上自动确认尚未启用。
- 后续增加月度预算台账和支付建议。
- 自动支付 Cloudflare、链上转账或套餐升降级需要限额、多方审批、幂等和完整审计，不由当前 Worker 直接控制。
- 不自动搜集或使用网上来源不明的共享 API Key。

## 配置清单

当前 AI/捐赠路径使用的 Worker secrets：

- `DONATION_INTAKE_KEY`：捐赠接收专用 bearer token。
- `DONATION_ENCRYPTION_KEY`：捐赠者 HMAC 匿名标签和旧 D1 密文迁移使用的 32 字节 base64 主密钥。
- `AI_GATEWAY_TOKEN`：仅含 AI Gateway Run 权限的 token，供全部推理调用使用。
- `AI_GATEWAY_MANAGEMENT_TOKEN`、`AI_GATEWAY_ACCOUNT_ID`：创建/删除 Gateway Provider Key 和 Secrets Store 项目。
- `GITHUB_TOKEN`：Worker 鉴权扫描 PR/Issue，并在没有专用 Issue token 时执行写入；本地 `.env` 的 `GH_TOKEN` 同步到此名称。
- `DONATION_ADMIN_KEY`、`GITHUB_ISSUE_TOKEN`：代码支持但当前生产未配置的可选窄权限 secrets。

Worker 明文 vars：

- `AI_GATEWAY_ID`（dev/prod 都为 `default`）
- `GITHUB_REPOSITORY`
- `GITHUB_PR_SCAN_LIMIT`
- `GITHUB_AUTONOMY_LABEL`（默认 `bot:ready`）
- `GITHUB_ISSUE_SCAN_LIMIT`
- `GITHUB_ISSUE_INTAKE_ENABLED`（生产环境显式为 `true`）
- `GITHUB_ISSUE_COOLDOWN_SECONDS`（默认 3600）
- `GITHUB_AI_TRIAGE_ENABLED`（生产环境显式为 `true`）
- `GITHUB_AI_TRIAGE_SCAN_LIMIT`（生产为 50）
- `GITHUB_AI_TRIAGE_MIN_CONFIDENCE`（生产为 0.85）

上线前需先执行 `schema/d1.sql`，再配置 secrets，最后才把 Issue intake 开关改为 `true`。推送 `main` 会自动发布，发布后不要再次手动部署。

仓库端还必须预先创建与 `GITHUB_AUTONOMY_LABEL` 同名的标签；Worker 只会把这个现有标签添加到已批准 Issue，不会创建标签或改动 GitHub 仓库配置。

完整模型偏好、费用分类、轮询行为和当前生产配置见 [AI 路由与凭据捐赠](ai-routing.md)。
