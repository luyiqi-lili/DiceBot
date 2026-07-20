# 自进化系统分阶段路线图

本文把“自我进化机器人”拆成可独立验收、可随时停止的阶段。当前只实现阶段 1；后续阶段均为规划，不代表生产环境已经启用。

## 安全原则

- 自动化权限逐级开放：先只读，再建议，最后才考虑受策略约束的写操作。
- 生产定时任务不得自动评论、批准、合并 PR，也不得把捐赠密钥写入日志。
- API 密钥只以 AES-GCM 密文保存；指纹用于去重，任何 HTTP API 都不能读回明文。
- 捐赠密钥在验证前保持 `pending`，模型路由只能使用 `active` 记录。
- 缺少 D1、GitHub 配置或加密配置时相关子任务安全跳过，不影响 Telegram 基础服务。

## 阶段 1：可审计底座（本次）

### 每小时 PR 检查

Cloudflare Cron 每小时调用 GitHub REST API，读取配置仓库的开放 PR。每个 PR 的仓库、编号、标题、作者、最新提交 SHA、草稿状态、更新时间和静态风险标签写入 D1。

静态风险信号包括敏感路径（例如工作流、Worker 配置、D1 schema）、超大 PR 和草稿状态。此阶段不调用 AI、不发布 GitHub 评论、不批准或合并。

验收标准：

- 没有 `GITHUB_REPOSITORY` 或 D1 时返回 `skipped`，定时任务继续运行。
- GitHub 返回失败时记录失败结果，但不阻断同一轮其他任务。
- 分页枚举全部开放 PR；`GITHUB_PR_SCAN_LIMIT` 只限制文件详情读取，未读取或读取不完整的详情按高风险处理。
- 同一 PR 更新最新提交后覆盖快照，关闭的 PR 在下一次成功扫描中标记为 `closed`。
- 日志只包含仓库、数量和错误摘要，不包含 GitHub token。

### API Key 捐赠接收（运营者代录）

阶段 1 不是公开匿名捐赠页面。社区成员先通过现有可信渠道把密钥交给运营者，再由持有 `DONATION_INTAKE_KEY` 的运营者代录。共享 intake token 不公开给社区，避免匿名滥用和 D1 垃圾数据。Telegram 身份授权、一次性 token、限流、隐私告知和捐赠者自助撤销属于后续阶段。

`POST /api/donations/api-keys` 接收 JSON：

```json
{
  "provider": "openai",
  "apiKey": "donated-secret",
  "donorLabel": "community-member"
}
```

请求必须携带 `Authorization: Bearer <DONATION_INTAKE_KEY>`。共享 token 与现有 `EXTERNAL_API_KEY` 分离，避免捐赠入口获得其他管理 API 权限。

运营者可从本地 `.env` 加载 intake token，并把待捐赠密钥放在临时环境变量中提交；命令和日志都不应直接出现密钥值：

```bash
curl --fail-with-body https://telegram-bot.luyiqi-lili.workers.dev/api/donations/api-keys \
  -H "Authorization: Bearer ${DONATION_INTAKE_KEY}" \
  -H 'Content-Type: application/json' \
  --data "$(jq -n --arg provider openai --arg apiKey "${DONATED_API_KEY}" '{provider: $provider, apiKey: $apiKey}')"
```

成功响应返回 `pending`、记录 ID 和 16 位指纹。运营者把指纹交给捐赠者确认即可；阶段 1 不验证、不启用也不消费该密钥。

验收标准：

- 只接受 HTTPS（本地测试主机除外）、POST 和 JSON。
- provider 使用小写字母、数字、点、下划线或连字符，长度不超过 40；密钥长度为 8–4096。
- `DONATION_ENCRYPTION_KEY` 必须是解码后 32 字节的 base64 密钥。
- D1 仅保存 AES-GCM 密文、随机 IV 和 SHA-256 指纹；响应仅包含记录 ID、provider、指纹和状态。
- 相同 provider + key 重复提交返回 `duplicate`，不新增记录。

### 查看运行状态

阶段 1 暂无公开管理面板。运营者通过 D1 只查看非敏感字段：

```sql
SELECT repository, status, open_pr_count, error_summary, checked_at
FROM pr_monitor_runs ORDER BY checked_at DESC LIMIT 20;

SELECT provider, substr(key_fingerprint, 1, 16) AS fingerprint, status, created_at
FROM api_key_donations ORDER BY created_at DESC LIMIT 50;
```

不得查询或导出 `encrypted_key`、`encryption_iv`。捐赠者要求撤销时，阶段 1 由运营者按指纹把状态改为 `revoked` 并清除密文；自助撤销 API 留待后续实现。PR 运行记录建议保留 90 天，关闭 PR 快照建议保留 180 天，具体清理任务在后续阶段实现。

`DONATION_ENCRYPTION_KEY` 丢失后现有密文不可恢复；轮换必须先实现带版本号的密钥环和逐条重加密，不能直接覆盖生产主密钥。

## 阶段 2A：免费资源注册表（规划）

- 维护经过许可的 provider/model 注册表、免费额度与健康状态，不自动抓取或使用来源不明的共享密钥。
- 定期探测免费模型的可用性、速率限制和隐私条款，失效时自动摘除。
- 免费路由始终保留，确保外部资金为零时仍能提供基础服务。

## 阶段 2B：验证与模型路由（规划）

- 使用 provider adapter 对 `pending` 密钥执行最低成本的只读验证。
- 保存额度、限流、最后成功时间和失败退避状态；验证日志不得包含密钥。
- 路由器按任务等级、预算、健康度和隐私策略选择模型，始终保留免费模型回退。
- 增加捐赠者撤销流程和管理员禁用流程。

## 阶段 3：AI PR 审阅建议（规划）

- 获取 diff，在隔离环境运行测试和静态分析，生成结构化审阅报告。
- 默认只把报告存入 D1；启用 GitHub 评论需单独配置写权限和人工开关。
- 对依赖、工作流、schema、鉴权和资金相关变更提高风险阈值。

## 阶段 4：受控进化（规划）

- AI 只能在独立分支提议变更，必须通过测试、预算和风险门禁。
- 默认创建草稿 PR；自动合并只允许低风险白名单范围，并需要可立即关闭的 kill switch。
- 禁止 AI 修改自身的权限边界、加密主密钥、发布凭证或门禁策略。

## 阶段 5：资金闭环（规划）

- 先做只读余额与月度预算台账，再引入需人工批准的支付建议。
- 自动支付、套餐升级和链上操作属于高风险能力，必须采用限额、多方审批、幂等和审计日志；不由阶段 1 的 Worker 直接控制。
- Telegram Stars、GitHub Sponsors 和加密货币等渠道分别接入只读到账流水，统一进入预算台账后再讨论自动支出。

## 配置清单

阶段 1 使用以下 secrets/vars：

- `DONATION_INTAKE_KEY`：捐赠入口专用 bearer token。
- `DONATION_ENCRYPTION_KEY`：32 字节随机值的 base64 表示。
- `GITHUB_REPOSITORY`：`owner/repo`，例如 `owner/telegram-bot`。
- `GITHUB_TOKEN`：可选；公开仓库可匿名读取，配置后可提高 API 限额。

数据库上线前需执行 `schema/d1.sql` 中新增的表定义。推送 `main` 会自动发布；不要在推送后再次手动部署。
