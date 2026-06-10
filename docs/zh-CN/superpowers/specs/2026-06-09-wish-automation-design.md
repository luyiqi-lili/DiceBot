# Wish 自动化实现记录

English source: [../../../superpowers/specs/2026-06-09-wish-automation-design.md](../../../superpowers/specs/2026-06-09-wish-automation-design.md)

## 原始意图

添加 `/wish` 工作流：用户提交想法，本地脚本汇总 pending wishes，管理员在 Telegram 批准条目，本地 executor 让 Codex CLI 实现批准任务。

## 当前实现

已实现组件：

- `src/commands/wish.ts`：`/wish` 提交和管理员回复批准。
- `src/lib/wishCore.ts`：wishes、summaries、tasks 的 D1 持久化。
- `src/lib/wishApi.ts`：Worker API 端点。
- `scripts/wish-digest.sh`：本地 digest 生成。
- `scripts/wish-execute.sh`：本地任务执行。
- `scripts/wish-local.sh`：setup 和 cron 管理。
- `scripts/wish-net.sh`：共享网络重试工具。

## 当前 API

- `GET /api/wish/pending?limit=50`
- `POST /api/wish/summaries`
- `POST /api/wish/approved/claim`
- `POST /api/wish/tasks/:id/status`

鉴权只有在配置 `EXTERNAL_API_KEY` 时有效。

## 当前安全模型

- 只有管理员 `8080375150` 可批准 digest 项。
- Codex CLI 在 Worker 外执行。
- executor 在 claim task 前拒绝脏工作区。
- 执行失败可清理生成变更并回报失败。

## 规范文档

维护中的手册见 [../../../zh-CN/wish-automation.md](../../../zh-CN/wish-automation.md)。
