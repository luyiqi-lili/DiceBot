# Fish KV 实现记录

English source: [../../../superpowers/specs/2026-06-09-fish-kv-design.md](../../../superpowers/specs/2026-06-09-fish-kv-design.md)

## 原始意图

将鱼种列表从静态 TypeScript 列表迁移到 Cloudflare KV，并允许用户从 Telegram 添加鱼种。

## 当前实现

该功能已在当前代码中实现：

- `FISH_KV` 存储 catalog。
- `src/lib/fishCatalog.ts` 负责加载、种子初始化、校验、添加和删除。
- `src/data/fish.ts` 仍作为种子和回退来源。
- `src/commands/fish.ts` 支持 `/fish add`、`/fish list`、`/fish remove`。
- `test/lib/fishCatalog.spec.ts` 和 `test/commands/fish.spec.ts` 覆盖活跃行为。

## 当前用户行为

- `/fish add <name> <value>` 校验并付费后添加鱼。
- value 必须在允许范围内。
- 重复或无效条目会被 catalog 逻辑拒绝。
- `/fish list [page]` 和 `/fish remove <index>` 是管理员操作。

## 规范文档

维护中的手册见 [../../../zh-CN/fish-system.md](../../../zh-CN/fish-system.md)。
