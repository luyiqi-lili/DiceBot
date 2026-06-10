# Wish 自动化

English source: [../wish-automation.md](../wish-automation.md)

Wish 自动化允许群用户提交功能想法，管理员批准汇总候选项，然后本地脚本在 Cloudflare Workers 外执行批准任务。

## 运行边界

Worker 负责：

- 接收 `/wish <text>`。
- 将 wish 存入 D1。
- 管理员回复编号时批准 digest 项。
- 暴露 `/api/wish/*` 端点。

本地机器负责：

- 运行 `scripts/wish-digest.sh`。
- 运行 `scripts/wish-execute.sh`。
- 运行 Codex CLI。
- 验证、提交、推送并回报结果。

Codex 不在 Worker 内运行。

## Telegram 命令

`/wish <idea>`：

- 需要 D1。
- 拒绝模糊或空 wish。
- 存储 pending wish。
- 回复 wish id。

管理员批准：

- 管理员 id：`8080375150`。
- 管理员回复 digest 消息中的编号，例如 `1` 或 `1 3`。
- parser 接受可选前缀 `做`。
- 批准候选项会变为可执行任务。

## D1 数据

`src/lib/wishCore.ts` 管理：

- `wishes`
- `wish_summaries`
- `wish_tasks`

状态包括 `pending`、`summarized`、`approved`、`in_progress`、`done`、`failed`。

## API 端点

| Endpoint | Method | 行为 |
|----------|--------|------|
| `/api/wish/pending?limit=50` | GET | 列出 pending wishes |
| `/api/wish/summaries` | POST | 存储 digest summary 和 tasks |
| `/api/wish/approved/claim` | POST | claim 一个 approved task |
| `/api/wish/tasks/:id/status` | POST | 更新 task 状态 |

API 鉴权只有在 Worker 配置 `EXTERNAL_API_KEY` 时有效。

## 本地脚本

| Script | 用途 |
|--------|------|
| `scripts/wish-local.sh` | setup、安装/卸载 cron、status、手动 digest/execute |
| `scripts/wish-digest.sh` | 拉取 pending wishes，让 Codex 汇总，发送 Telegram digest，存储 summary |
| `scripts/wish-execute.sh` | claim 一个 approved task，运行 Codex，验证、提交、推送、回报 |
| `scripts/wish-net.sh` | 共享 curl 重试工具 |

## 本地环境

digest 需要：

- `WORKER_BASE_URL`
- `EXTERNAL_API_KEY`
- `BOT_TOKEN`
- `CHAT_ID`
- `TOPIC_ID`

executor 需要：

- `WORKER_BASE_URL`
- `EXTERNAL_API_KEY`

可选回报：

- `BOT_TOKEN`
- `CHAT_ID`
- `TOPIC_ID`

验证命令：`WISH_VERIFY_CMD`，默认是 wish 相关测试。

## Cron 示例

```cron
*/10 * * * * cd /home/linux/dicebot/telegram-bot && scripts/wish-digest.sh >> /tmp/wish-digest.log 2>&1
*/5 * * * * cd /home/linux/dicebot/telegram-bot && scripts/wish-execute.sh >> /tmp/wish-execute.log 2>&1
0 9 * * * cd /home/linux/dicebot/telegram-bot && scripts/wish-digest.sh >> /tmp/wish-digest.log 2>&1
```

## 安全行为

`scripts/wish-execute.sh`：

- 工作区脏时拒绝运行。
- 每次只 claim 一个任务。
- 失败后可清理生成变更。
- 验证失败会回报 task failed。
- 只有执行和验证成功后才 push。

## 测试

相关测试：`test/commands/wish.spec.ts`、`test/lib/wishCore.spec.ts`、`test/lib/wishApi.spec.ts`、`test/scripts/wish-digest-format.sh`、`test/scripts/wish-execute-cleanup.sh`。
