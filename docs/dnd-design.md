# DND System

Chinese translation: [zh-CN/dnd-design.md](zh-CN/dnd-design.md)

The DND subsystem is a lightweight Telegram group RPG system backed by D1. It covers character creation, skills, rests, GM configuration, items, weapon attacks, spell casting, and level-up choices.

## Runtime Entry Points

Commands are dispatched in `src/index.ts`:

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

Callbacks:

- `dnd_reroll`
- `dnd_confirm`
- `item_action`
- `lu`

Non-command messages beginning with `*` dispatch to weapon attack, spell cast, or skill check.

## Storage

Requires `env.DB`. Dev currently has no D1 binding in `wrangler.jsonc`, so handlers return D1-not-configured messages in that environment unless local config is changed.

Core D1 tables:

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

Table definitions are maintained in code and docs rather than in a single migration file.

## Character Creation

`/new <race> <class> <name>`:

1. Validates race and class against D1.
2. Rolls attributes using 4d6 keep-highest-3.
3. Applies race bonuses.
4. Calculates HP from class hit die and CON modifier.
5. Creates a preview with reroll/confirm callbacks.
6. On confirm, saves one character per `(chat_id, user_id)`.

`/char` shows character stats, HP, XP, level, proficiencies, and equipped item bonuses.

## Skills

`/skill <name>`:

- Loads character and skill from D1.
- Uses d20 if proficient, otherwise d10.
- Adds attribute modifier, race bonus, and item bonuses.
- If replying to another character, performs a PVP comparison.
- Calls DeepSeek for narrative text where configured.

`/skills` lists available skills and the current character's modifiers.

`*<skill>` performs a skill check when the name is not resolved as an equipped weapon or spell.

## Rest

`/rest short` and `/rest long` restore HP and mana according to the handler logic in `src/commands/dndRest.ts`. Rest counts are tracked per character and reset by date.

## GM Commands

`/gm` is the group control surface:

| Command | Purpose |
|---------|---------|
| `/gm init` | Seed default DND data |
| `/gm 种族` | List races |
| `/gm 种族加值 <race> <+N属性> <desc>` | Configure race bonuses |
| `/gm 职业 <class> <primary_attr> [hit_die] <desc>` | Configure class |
| `/gm 技能 <skill> <race_bonus> <class> <attr> <desc>` | Configure skill |
| `/gm dc <value> <desc>` | Configure scene DC |
| `/gm addxp <amount>` | Reply to grant XP |
| `/gm setgm` | Reply to appoint GM; super-admin only |
| `/gm item create/list/delete/give` | Manage item templates and grants |

Super-admin id is defined in DND core/admin data.

## Items

Items are documented in [item-system.md](item-system.md). DND consumes item bonuses for:

- `/char`
- `/skill`
- `/attack`
- `/cast`
- `/lvup` weapon proficiency choices

## Weapon Attacks

`/attack [weapon]`, `/atk [weapon]`, and `*攻击` use the equipped weapon in `weapon` slot:

- proficiency is based on character `proficiencies`
- proficient attacks roll d20
- non-proficient attacks roll d10
- damage uses the item template `damage`, such as `d8力量`
- replying to another character applies AC and HP updates

Known code issue: `src/commands/dndAttack.ts` currently has a type/check failure around `targetChar` vs `tgtChar`. Do not claim type-check health until this is fixed.

## Spell Casting

`/cast <spell>` and `*<spell>` use D1 skills with `damage` or `mana_cost`.

Behavior:

- daily mana reset by `mana_date`
- rejects insufficient mana
- deducts mana before effect
- damage can target replied characters
- `heal` in the damage string marks healing behavior
- if the skill has no damage, casting falls back to normal skill check

## Level Up

`/level` shows level, XP, next threshold, and proficiencies.

`/lvup` shows a callback menu when XP is sufficient:

- attribute +1, capped at 18
- learn class skill
- learn weapon proficiency for weapon-slot items in inventory

Next-level XP is `current level * 100`.

## Tests

Current test coverage includes DND core and some DND command surfaces:

- `test/lib/dndCore.spec.ts`
- `test/commands/dndHelp.spec.ts`
- route/index tests that touch DND dispatch

Attack, cast, GM, and level-up behavior need broader focused tests before large refactors.
