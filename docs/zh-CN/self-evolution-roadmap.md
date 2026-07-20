# 自进化系统分阶段路线图

English source: [../self-evolution-roadmap.md](../self-evolution-roadmap.md)

本项目按权限边界分阶段开放自治能力。当前已实现阶段 1 与阶段 2 的可审计基础；自动修改源码、合并、支付或套餐变更仍未启用。

## 已实现：阶段 1 可审计底座

- 生产 Cron 每小时只读扫描开放 PR，保存提交 SHA、文件统计和静态风险信号。
- `POST /api/donations/api-keys` 使用独立 intake bearer token 接收密钥，以 AES-GCM 加密、SHA-256 指纹去重，HTTP API 永不返回密文或明文。
- 缺少 D1、GitHub 或加密配置时安全跳过，不影响 Telegram 基础功能。

## 已实现：阶段 2A 需求 Issue 与候选选择

### Telegram 需求入口

开启 `GITHUB_ISSUE_INTAKE_ENABLED=true` 后，用户可发送：

```text
/wish 增加一个可按群组关闭的每日签到功能
```

`/issue` 是同义命令。机器人优先使用专用 `GITHUB_ISSUE_TOKEN` 创建公开 GitHub Issue；未配置时复用现有 `GITHUB_TOKEN`。公开正文只包含需求内容，不包含 Telegram chat/user id；私有映射保存在 D1，用于每用户冷却和 30 天重复检查。

写入口必须由 `GITHUB_ISSUE_INTAKE_ENABLED=true` 显式开启。用户创建的 Issue 不会直接获得自治标签，只有维护者或付费高级模型门禁批准后才添加 `bot:ready`。

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

捐赠请求必须明确平台，别名会归一化，例如 `gemini`、`google`、`google-ai-studio` 均保存为 `google-gemini`。支持的平台目录还包括 `openai`、`anthropic`、`deepseek` 与 `openrouter`；已实现 Google Gemini 模型列表验证和 DeepSeek 官方余额验证。

请求示例：

```json
{
  "provider": "gemini",
  "apiKey": "donated-secret",
  "donorLabel": "community-member",
  "usagePolicy": "shared_inference"
}
```

`usagePolicy` 有两种：

- `validation_only`：默认值，只允许管理员显式验证，不进入推理路由。
- `shared_inference`：捐赠者明确允许验证、健康检查和后续共享推理路由。

`DONATION_ADMIN_KEY` 保护以下管理接口：

- `GET /api/donations/api-keys`：只返回平台、指纹、状态、授权用途和模型目录等非敏感字段。
- `POST /api/donations/api-keys/:id/validate`：解密仅存在于请求内存中；Gemini 调用只读模型列表，DeepSeek 调用官方余额接口且不返回精确余额。
- `POST /api/donations/api-keys/:id/status`：设置 `pending`、`disabled` 或 `revoked`；撤销会清空已保存密文。

每小时最多轮询一个 `shared_inference` 凭据。Gemini 验证调用官方 `models.list`，成功后记录该项目实际可见且支持 `generateContent` 的模型；DeepSeek 验证调用官方余额接口并记录模型目录及非敏感付费可用状态。健康检查不会发送用户需求内容。

当前免费候选种子为 `gemini-2.5-flash-lite`、`gemini-2.5-flash` 与 `gemini-2.5-pro`，核对日期为 2026-07-20，来源为 Google 官方[模型列表](https://ai.google.dev/gemini-api/docs/models)与[价格页](https://ai.google.dev/gemini-api/docs/pricing)。免费层受地区、账号和速率限制影响，种子不等于永久可用承诺。

受 `EXTERNAL_API_KEY` 保护的接口：

- `GET /api/ai/models`：查看 provider 与免费模型种子。
- `GET /api/ai/route?complexity=standard&budget=depleted`：得到路由建议。只有 `active + shared_inference + healthy` 的凭据能把结果标记为已验证可用；否则只返回不可执行的目录建议。

## 已实现：阶段 2C 付费高级模型自动批准

每小时 Cron 会先静态过滤尚未 ready 的 Issue，排除已指派、锁定、已有 PR 关联、描述不足、被阻止以及鉴权、资金、权限、部署、迁移、安全等受保护主题；每轮最多审核一个合格 Issue。唯一允许的 GitHub 自动写入是添加现有的 `bot:ready` 标签。

当前付费资格只采用 DeepSeek 官方[余额接口](https://api-docs.deepseek.com/api/get-user-balance)返回值：必须同时满足 `is_available=true` 和 `topped_up_balance > 0`。赠送余额与免费 API 不算付费余额，也不会触发批准。之后固定使用官方[模型与价格页](https://api-docs.deepseek.com/quick_start/pricing)列出的付费高级模型 `deepseek-v4-pro` 判断，必须返回 `risk=low`，且置信度达到 `GITHUB_AI_TRIAGE_MIN_CONFIDENCE`（生产为 `0.85`）。缺少凭据、余额未知、只有免费池、响应格式错误、模型失败或 GitHub 写入失败时全部默认拒绝。

Worker 优先尝试自身的 `DEEPSEEK_API_KEY`，再尝试状态为 `active + shared_inference + healthy` 的捐赠 DeepSeek 凭据。所有结果写入 `ai_issue_triage_runs`，不保存密钥或精确余额；未修改的已拒绝 Issue 不会重复消耗模型，Issue 更新后可再次审核。`GET /api/evolution/candidate` 会返回最新非敏感审核记录。

## 尚未实现的高风险阶段

### 阶段 3：隔离执行与 AI 审阅

- 在 GitHub Actions 或独立 runner checkout 候选 Issue，运行测试、类型检查和安全扫描。
- 只允许创建草稿 PR；模型不能修改凭据、门禁规则或发布权限。
- 把结构化评审保存到 D1；GitHub 评论需要单独写开关。

### 阶段 4：受控合并

- 自动合并仅考虑低风险白名单路径、完整测试与分支保护。
- 保留人工 kill switch、并发锁、失败退避和快速回滚。

### 阶段 5：资金闭环

- 先接入只读捐赠流水、月度预算台账和支付建议。
- 自动支付 Cloudflare、链上转账或套餐升降级需要限额、多方审批、幂等和完整审计，不由当前 Worker 直接控制。
- 不自动搜集或使用网上来源不明的共享 API Key。

## 配置清单

Worker secrets：

- `DONATION_INTAKE_KEY`：捐赠接收专用 bearer token。
- `DONATION_ADMIN_KEY`：捐赠验证、查看和撤销专用 bearer token。
- `DONATION_ENCRYPTION_KEY`：解码后 32 字节的 base64 AES 主密钥。
- `DEEPSEEK_API_KEY`：可选的 Worker 自有 DeepSeek token；只有官方确认存在充值余额时才能用于自动批准。
- `GITHUB_TOKEN`：Worker 鉴权扫描 PR/Issue，并在没有专用 Issue token 时执行写入；本地 `.env` 的 `GH_TOKEN` 同步到此名称。
- `GITHUB_ISSUE_TOKEN`：可选的专用 Issue 写 token；未配置时显式开启的入口复用现有 `GITHUB_TOKEN`，避免复制秘密。

Worker vars：

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
