# Wish 自动化实现计划记录

English source: [../../../superpowers/plans/2026-06-09-wish-automation.md](../../../superpowers/plans/2026-06-09-wish-automation.md)

## 状态

已实现。本文作为历史实现记录保留。

## 交付文件

- `src/lib/wishCore.ts`
- `src/lib/wishApi.ts`
- `src/commands/wish.ts`
- `scripts/wish-digest.sh`
- `scripts/wish-execute.sh`
- `scripts/wish-local.sh`
- `scripts/wish-net.sh`
- `docs/wish-automation.md`
- `test/lib/wishCore.spec.ts`
- `test/lib/wishApi.spec.ts`
- `test/commands/wish.spec.ts`
- `test/scripts/wish-digest-format.sh`
- `test/scripts/wish-execute-cleanup.sh`

## 交付行为

- 用户用 `/wish <text>` 提交有意义的 wish。
- 本地脚本汇总 pending wishes。
- 管理员回复批准编号项。
- 本地 executor claim approved tasks。
- 任务状态通过 Worker API 回报。

## 验证

聚焦测试：

```bash
npx vitest run test/lib/wishCore.spec.ts test/lib/wishApi.spec.ts test/commands/wish.spec.ts
test/scripts/wish-digest-format.sh
test/scripts/wish-execute-cleanup.sh
```

规范文档：[../../../zh-CN/wish-automation.md](../../../zh-CN/wish-automation.md)。
