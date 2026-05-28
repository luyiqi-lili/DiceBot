# 物品系统（旧版 → 新版迁移）

## 旧版（已废弃）

- **存储**：`ITEM_STORE` KV，key = `item:user:<uid>`
- **命令**：`/item create`（回复消息创建）、`/item list`、`/item use #N`、`/item send #N`
- 物品实为消息引用的 JSON 包装（remark + content + link + timestamp）

## 新版（当前）

> 已集成到 DND 系统，参见 [DND 设计文档](./dnd-design.md) 第七章。

- **存储**：D1（`dnd_item_templates` + `dnd_inventory`）
- **物品类型**：装备（可装备到部位）+ 消耗品（有使用次数）
- **命令**：`/item`（按钮背包）、`/item send 名称`（赠送）
- **GM 命令**：`/gm item create/list/delete/give`
- **装备部位**：head/body/hands/feet/weapon/offhand/accessory
- 已装备属性加成实时叠加到角色卡和技能检定中

### 按钮交互

`/item` 显示按钮式背包：
- 已装备物品 → [卸下]
- 未装备装备 → [装备]
- 消耗品 → [使用]

回调类型：`item_action`（`eq`/`un`/`use`）

## 文件

| 文件 | 用途 |
|------|------|
| `src/commands/item.ts` | 物品命令处理器（已重写为新版） |
| `src/lib/itemCore.ts` | 物品模板/背包 CRUD + 装备加成计算 |
