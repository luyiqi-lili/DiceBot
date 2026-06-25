# Command Reference

Chinese translation: [zh-CN/commands.md](zh-CN/commands.md)

This reference follows `src/index.ts` runtime dispatch. Some metadata in `src/routes.ts` is incomplete, so use this document and `loadCommand()` as the source of truth.

## General Commands

| Command | Handler | Notes |
|---------|---------|-------|
| `/help` | `handleHelp` | Main help text |
| `/whoami` | `handleWhoami` | Shows Telegram user/chat details |
| `/echo` | `handleEcho` | Bot evaluates the user's text |
| `/em`, `/me`, `/emote` | `handleEmote` | Action text |
| `/like` | `handleLike` | Usage count backed by D1 |
| `/book` | `handleBook` | Bookmark storage in `BOOK_STORE` |
| `/news` | `handleNews` | Daily group news in `NEWS_STORE` |
| `/rule` | `handleRule` | Group rule storage in D1 |
| `/trans` | `handleTrans` | Translate replied text with DeepSeek |
| `/ask` | `handleAsk` | Comment on replied content with DeepSeek |
| `/act` | `handleAct` | Activity/session recording in D1 |
| `/top` | `handleTop` | Admin topic ranking by message count over the last 7 days |
| `/report` | `handleReport` | AI group report generation |
| `/fate` | `handleFate` | Tarot-style draw |

## Dice And Games

| Command | Handler | Notes |
|---------|---------|-------|
| `/roll`, `/r`, `/rd`, `/rh` | `handleRoll` | Dice rolling; `rh` sends hidden result |
| `/groll` | `handleGroll` | Group roll with callback join/end |
| `/21` | `handle21` | 21-point game |
| `/duel` | `handleDuel` | Reply to another user to start a duel |
| `/lottery` | `handleLottery` | Lottery state, purchase, draw, admin operations |

## Economy

| Command | Handler | Notes |
|---------|---------|-------|
| `/coin` | `handleCoin` | Balance |
| `/coin pray` | `handleCoin` | Daily prayer in allowed topics only |
| `/coin send <amount>` | `handleCoin` | Reply transfer with dynamic fee |
| `/coin check` | `handleCoin` | Admin treasury/balance check |
| `/coin take <amount>` | `handleCoin` | Admin treasury withdrawal |
| `/coin create <amount>` | `handleCoin` | Admin mint |
| `/coin remove <amount>` | `handleCoin` | Admin burn |
| `/congrats`, `/恭喜发财`, `/恭喜發財`, `/爸爸`, `/媽媽`, `/妈妈` | `handleCongrats` | Red-packet style command aliases |

## Fish

| Command | Handler | Notes |
|---------|---------|-------|
| `/f <bait>` | `handleFish` | Spend bait and create pull callback |
| `/f check` | `handleFish` | Daily fishing record |
| `/f add <name> <value>` | `handleFish` | Spend `FISH_ADD_COST` to add a fish to `FISH_KV` |
| `/f list [page]` | `handleFish` | Admin list, 20 per page |
| `/f remove <index>` | `handleFish` | Admin removal by list index |

Fish admin is currently user `8080375150`.

## Affection

| Command | Handler | Notes |
|---------|---------|-------|
| `/rose` | `handleRose` | Reply to view your affection toward the target |
| `/rose send` | `handleRose` | Reply to send a flower; first daily send is free |
| `/rose check` | `handleRose` | Show incoming affection ranking for replied user or self |

## Wish Automation

| Command | Handler | Notes |
|---------|---------|-------|
| `/wish <text>` | `handleWish` | Stores a meaningful wish in D1 |
| admin reply to digest with numbers | `handleWishApproval` | Non-command message path; admin id `8080375150` |

See [wish-automation.md](wish-automation.md).

## DND Commands

| Command | Handler | Notes |
|---------|---------|-------|
| `/dnd` | `handleDndHelp` | Lists races, classes, skills, and shortcuts |
| `/new <race> <class> <name>` | `handleDndNew` | Creates a character preview and confirmation callbacks |
| `/char` | `handleDndChar` | Character sheet with equipment bonuses |
| `/skill <name>` | `handleDndSkill` | Skill check; replies trigger PVP comparison |
| `/skills` | `handleDndSkills` | Skill list and current modifiers |
| `/rest short`, `/rest long` | `handleDndRest` | HP and mana/rest recovery |
| `/gm ...` | `handleDndGm` | GM management for races, classes, skills, DC, XP, items |
| `/item` | `handleItem` | Button backpack |
| `/item send <name> [qty]` | `handleItem` | Reply gift of unequipped items |
| `/attack [weapon]`, `/atk [weapon]` | `handleDndAttack` | Equipped weapon attack |
| `/cast <spell>` | `handleDndCast` | Spell damage/healing/skill fallback |
| `/lvup` | `handleDndLvUp` | Upgrade menu |
| `/level` | `handleDndLevel` | Level and XP summary |

GM subcommands include:

- `/gm init`
- `/gm 种族`
- `/gm 种族加值 <race> <+N属性> <desc>`
- `/gm 职业 <class> <primary_attr> [hit_die] <desc>`
- `/gm 技能 <skill> <race_bonus> <class> <attr> <desc>`
- `/gm dc <value> <desc>`
- `/gm addxp <amount>` as a reply
- `/gm setgm` as a reply, super-admin only
- `/gm item create/list/delete/give`

See [dnd-design.md](dnd-design.md) and [item-system.md](item-system.md).

## Callback Types

| Type | Handler | Purpose |
|------|---------|---------|
| `congrats` | `handleCongratsCallback` | Red packet claim |
| `21` | `handle21Callback` | 21-point actions |
| `duel` | `handleDuelCallback` | Duel accept/resolve |
| `fish` | `handleFishCallback` | Pull fishing rod |
| `groll` | `handleGrollCallback` | Join/end group roll |
| `lottery` | `handleLotteryCallback` | Lottery UI |
| `dnd_reroll` | `handleDndRerollCallback` | Reroll character preview |
| `dnd_confirm` | `handleDndConfirmCallback` | Confirm character creation |
| `item_action` | `handleItemCallback` | Equip, unequip, use item |
| `lu` | `handleLvUpCallback` | Level-up menu actions |
| `delete_message` | inline in `src/index.ts` | Delete the bot message |

## Non-Command Star Shortcut

Messages beginning with `*` are handled outside command parsing:

- `*攻击` or `*<equipped weapon name>` attacks with the equipped weapon.
- `*<spell name>` casts when the D1 skill has `damage` or `mana_cost`.
- `*<skill name>` falls back to DND skill check.

Messages beginning with `**` are ignored by this shortcut so normal bold Markdown-like text is not treated as a skill.
