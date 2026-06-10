# 物品系统

English source: [../item-system.md](../item-system.md)

当前物品系统使用 D1，并集成到 DND。旧版 KV 物品系统仅作为遗留说明。

## 运行入口

- `/item` -> `src/commands/item.ts`
- `/item send <name> [quantity]` -> `src/commands/item.ts`
- `/gm item create/list/delete/give` -> `src/commands/dndGm.ts`
- `item_action` callback -> `handleItemCallback`

## 存储

```sql
dnd_item_templates(id, chat_id, name, item_type, slot, attr_bonus, damage, uses, description)
dnd_inventory(id, chat_id, user_id, template_id, quantity, equipped)
```

`src/lib/itemCore.ts` 负责 CRUD 和领域行为。

## 模板字段

| 字段 | 含义 |
|------|------|
| `item_type` | `装备` 或 `消耗品` |
| `slot` | `head`、`body`、`hands`、`feet`、`weapon`、`offhand`、`accessory` |
| `attr_bonus` | JSON，例如 `{"力量":2}` |
| `damage` | 骰子字符串，例如 `d8力量` |
| `uses` | 消耗品使用次数；`0` 表示无限 |
| `description` | 展示文本 |

## 玩家流程

`/item` 显示按钮背包：

- 已装备物品和卸下按钮。
- 消耗品和使用按钮。
- 未装备装备和装备按钮。
- 删除消息按钮。

`/item send <name> [quantity]` 必须回复目标用户，只能赠送未装备的同名物品。

## 回调行为

| Action | 行为 |
|--------|------|
| `eq` | 装备物品；同部位旧装备自动卸下 |
| `un` | 卸下物品 |
| `use` | 使用消耗品；有限物品扣数量或归零删除 |

回调后会刷新背包消息。

## GM 流程

```text
/gm item create 铁头盔 装备 head +1体质 坚固
/gm item create 长剑 装备 weapon +2力量 d8力量 锋利的长剑
/gm item create 治疗药水 消耗品 3 恢复体力
/gm item give 长剑 1
```

`give` 必须回复目标用户。

## DND 集成

物品加成影响 `/char`、`/skill`、`/attack`、`/cast` 和 `/lvup` 武器熟练选择。武器攻击要求 weapon 部位装备有 `damage` 的物品。

## 旧 KV 系统

旧行为使用 `ITEM_STORE` 和 `/item create/list/use/send #N`。当前 `/item` 不再读取 `ITEM_STORE`，测试应 mock D1。

## 测试

`test/commands/item.spec.ts` 覆盖缺 D1、空背包、装备/消耗品渲染和 `/item send` D1 更新。
