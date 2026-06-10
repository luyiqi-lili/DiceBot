# 项目文档重写执行计划

English source: [../../../superpowers/plans/2026-06-10-project-docs-rewrite.md](../../../superpowers/plans/2026-06-10-project-docs-rewrite.md)

## 目标

重写所有项目自有 Markdown 文档，使其反映当前 Telegram bot 实现。

## 架构

保留 `README.md` 作为短入口，将详细运行知识放入 `docs/` 下的聚焦手册。历史 Superpowers specs/plans 改写为带当前状态的实现记录。

## 完成任务

- [x] 收集当前实现事实。
- [x] 重写 README 和核心手册。
- [x] 重写子系统手册。
- [x] 重写历史和 assistant-facing 文档。
- [x] 验证文档重写。

## 验证状态

- stale 文案扫描无命中。
- `npm test -- --run` 全部通过。
- `npx tsc --noEmit` 和 `npm audit --audit-level=low` 仍报告项目既有问题。
