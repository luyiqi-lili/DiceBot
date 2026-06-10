# Item System

Chinese translation: [zh-CN/item-system.md](zh-CN/item-system.md)

The current item system is D1-backed and integrated with DND. The old KV item system is legacy only.

## Runtime Entry Points

- `/item` -> `src/commands/item.ts`
- `/item send <name> [quantity]` -> `src/commands/item.ts`
- `/gm item create/list/delete/give` -> `src/commands/dndGm.ts`
- `item_action` callback -> `handleItemCallback`

## Storage

D1 tables:

```sql
dnd_item_templates(
  id,
  chat_id,
  name,
  item_type,
  slot,
  attr_bonus,
  damage,
  uses,
  description
)

dnd_inventory(
  id,
  chat_id,
  user_id,
  template_id,
  quantity,
  equipped
)
```

`src/lib/itemCore.ts` owns CRUD and domain behavior.

## Template Fields

| Field | Meaning |
|-------|---------|
| `item_type` | `装备` or `消耗品` |
| `slot` | `head`, `body`, `hands`, `feet`, `weapon`, `offhand`, `accessory` |
| `attr_bonus` | JSON map such as `{"力量":2}` |
| `damage` | weapon/spell-style dice string such as `d8力量` |
| `uses` | consumable use count; `0` means infinite |
| `description` | display text |

## Player Flow

`/item` displays a button backpack:

- equipped items with unequip buttons
- consumables with use buttons
- unequipped equipment with equip buttons
- delete-message button

`/item send <name> [quantity]` must reply to a target user. Only unequipped matching items can be gifted.

## Callback Actions

Callback payload type is `item_action`.

| Action | Behavior |
|--------|----------|
| `eq` | Equip item; auto-unequips existing item in the same slot |
| `un` | Unequip item |
| `use` | Use consumable; finite items decrement quantity or delete at zero |

After a callback, the bot refreshes the backpack message.

## GM Flow

Examples:

```text
/gm item create 铁头盔 装备 head +1体质 坚固
/gm item create 长剑 装备 weapon +2力量 d8力量 锋利的长剑
/gm item create 治疗药水 消耗品 3 恢复体力
/gm item give 长剑 1
```

`give` must reply to the target user.

## DND Integration

Item bonuses feed:

- `/char`
- `/skill`
- `/attack`
- `/cast`
- `/lvup` weapon proficiency choices

Weapon attacks require an equipped item in `weapon` slot with `damage`.

## Legacy KV System

Legacy behavior used:

- `ITEM_STORE`
- `/item create`
- `/item list`
- `/item use #N`
- `/item send #N`

Current `/item` does not read `ITEM_STORE`. Tests should mock D1, not KV.

## Tests

`test/commands/item.spec.ts` covers:

- missing D1 warning
- empty D1 backpack
- equipped/unequipped/consumable rendering
- `/item send <name> <quantity>` D1 inventory updates
