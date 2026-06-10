# DND 系统

English source: [../dnd-design.md](../dnd-design.md)

DND 子系统是基于 D1 的轻量 Telegram 群跑团系统，覆盖角色创建、技能、休息、GM 配置、物品、武器攻击、魔法施放和升级选择。

## 运行入口

- `/dnd` -> `src/commands/dndHelp.ts`
- `/new` -> `src/commands/dndNew.ts`
- `/char` -> `src/commands/dndChar.ts`
- `/skill` -> `src/commands/dndSkill.ts`
- `/skills` -> `src/commands/dndSkills.ts`
- `/rest` -> `src/commands/dndRest.ts`
- `/gm` -> `src/commands/dndGm.ts`
- `/attack`, `/atk` -> `src/commands/dndAttack.ts`
- `/cast` -> `src/commands/dndCast.ts`
- `/lvup`, `/level` -> `src/commands/dndUpgrade.ts`
- `/item` -> `src/commands/item.ts`

回调包括 `dnd_reroll`、`dnd_confirm`、`item_action`、`lu`。

非命令消息以 `*` 开头时，会分发到武器攻击、魔法施放或技能检定。

## 存储

DND 需要 `env.DB`。dev 当前未在 `wrangler.jsonc` 中绑定 D1，因此相关 handler 会返回 D1 未配置提示。

核心表族：

```sql
dnd_races(chat_id, race_name, attr_bonuses, description)
dnd_classes(chat_id, class_name, primary_attr, hit_die, description)
dnd_skills(chat_id, skill_name, linked_attr, class_name, race_bonus, damage, mana_cost, spell_level, description)
dnd_characters(chat_id, user_id, char_name, race, class, level, xp, hp_max, hp_current, mana_max, mana_current, mana_date, attributes, proficiencies, rest_short_used, rest_long_used, rest_date)
dnd_gm(chat_id, user_id, set_by)
dnd_dc(chat_id, dc_value, description, set_by)
dnd_item_templates(chat_id, name, item_type, slot, attr_bonus, damage, uses, description)
dnd_inventory(chat_id, user_id, template_id, quantity, equipped)
```

## 角色创建

`/new <race> <class> <name>`：

1. 从 D1 校验种族和职业。
2. 使用 4d6 取最高 3 个骰子生成属性。
3. 应用种族加值。
4. 根据职业生命骰和 CON 调整值计算 HP。
5. 发送预览和重骰/确认按钮。
6. 确认后保存同一群内每个用户一个角色。

`/char` 显示角色属性、HP、XP、等级、熟练项和装备加成。

## 技能

`/skill <name>`：

- 从 D1 加载角色和技能。
- 熟练用 d20，非熟练用 d10。
- 叠加属性调整值、种族加值和物品加成。
- 回复其他角色时执行 PVP 对抗。
- 配置可用时调用 DeepSeek 生成叙事。

`/skills` 列出可用技能和当前角色调整值。

`*<skill>` 在未解析为武器或魔法时执行技能检定。

## 休息

`/rest short` 和 `/rest long` 根据 `src/commands/dndRest.ts` 的逻辑恢复 HP、法力和休息计数。计数按日期重置。

## GM 命令

| 命令 | 用途 |
|------|------|
| `/gm init` | 初始化默认 DND 数据 |
| `/gm 种族` | 列出种族 |
| `/gm 种族加值 <race> <+N属性> <desc>` | 配置种族加值 |
| `/gm 职业 <class> <primary_attr> [hit_die] <desc>` | 配置职业 |
| `/gm 技能 <skill> <race_bonus> <class> <attr> <desc>` | 配置技能 |
| `/gm dc <value> <desc>` | 配置场景 DC |
| `/gm addxp <amount>` | 回复发放 XP |
| `/gm setgm` | 回复任命 GM，仅超管 |
| `/gm item create/list/delete/give` | 管理物品模板和发放 |

## 物品

物品见 [item-system.md](item-system.md)。DND 使用物品加成影响 `/char`、`/skill`、`/attack`、`/cast` 和 `/lvup` 武器熟练选择。

## 武器攻击

`/attack [weapon]`、`/atk [weapon]` 和 `*攻击` 使用 `weapon` 部位的已装备武器：

- 熟练由角色 `proficiencies` 决定。
- 熟练攻击掷 d20，非熟练掷 d10。
- 伤害使用物品模板 `damage`，例如 `d8力量`。
- 回复其他角色时应用 AC 和 HP 更新。

已知代码问题：`src/commands/dndAttack.ts` 当前有 `targetChar`/`tgtChar` 类型检查错误；修复前不能宣称类型检查干净。

## 魔法施放

`/cast <spell>` 和 `*<spell>` 使用有 `damage` 或 `mana_cost` 的 D1 技能：

- 按 `mana_date` 每日重置法力。
- 法力不足时拒绝。
- 效果前扣除法力。
- `damage` 中包含 `heal` 表示治疗。
- 无 `damage` 时回退普通技能检定。

## 升级

`/level` 显示等级、XP、下一级阈值和熟练项。

`/lvup` 在 XP 足够时显示回调菜单：

- 属性 +1，上限 18。
- 学习职业技能。
- 学习背包中 weapon 物品的武器熟练。

下一级 XP 为 `当前等级 * 100`。

## 测试

相关测试：

- `test/lib/dndCore.spec.ts`
- `test/commands/dndHelp.spec.ts`
- 路由/入口测试覆盖部分 DND 分发。

攻击、施法、GM 和升级仍需要更完整的聚焦测试。
