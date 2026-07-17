# Command Reference

Chinese translation: [zh-CN/commands.md](zh-CN/commands.md)

This reference follows `src/index.ts` runtime dispatch. Some metadata in `src/routes.ts` is incomplete, so use this document and `loadCommand()` as the source of truth.

> The bot no longer depends on any external AI API. Features that relied on the DeepSeek-compatible chat API have been removed (`/trans`, `/ask`, `/report`, inline `@bot` AI assist, `/wish`). `/echo` now returns a static dice-based verdict, and `/fate` only draws cards (no AI interpretation).

## General Commands

| Command | Handler | Notes |
|---------|---------|-------|
| `/help` | `handleHelp` | Main help text |
| `/whoami` | `handleWhoami` | Shows Telegram user/chat details |
| `/echo` | `handleEcho` | Rolls a die and gives the user's text a static attitude verdict |
| `/em`, `/me`, `/emote` | `handleEmote` | Action text |
| `/like` | `handleLike` | Usage count backed by D1 |
| `/book` | `handleBook` | Bookmark storage in `BOOK_STORE` |
| `/news` | `handleNews` | Daily group news in `NEWS_STORE` |
| `/rule` | `handleRule` | Group rule storage in D1 |
| `/check <question>` | `handleCheck` | Explains currently implemented bot rule logic (local canned answers) |
| `/act` | `handleAct` | Activity/session recording in D1 |
| `/top` | `handleTop` | Admin topic ranking by message count over the last 7 days |
| `/fate` | `handleFate` | Tarot-style 3-card draw |
| `/perm` | `handlePerm` | Group owner grants/revokes admin permissions per user (see below) |
| `/topic` | `handleTopic` | Group owner configures which topics the topic-gated features run in (see below) |

## Access Control And Permissions

The bot responds in **any group it is added to** — there is no chat allowlist. Stored data is isolated per Telegram `chat_id`.

Admin commands (`/coin check|take|create|remove`, `/coin list`, `/lottery` admin subcommands, `/top`) authorize a caller if **any** of the following holds:

1. The caller's Telegram user id is in a static allowlist (`src/data/admin.ts`).
2. The caller is the **group owner** (Telegram `creator`) — owners implicitly hold every admin permission.
3. The caller has been **dynamically granted** that permission in this group via `/perm` (stored in D1 table `permission_grants`, isolated per `chat_id`).

Authorization is centralized in `hasAdminPermission()` (`src/lib/permissions.ts`).

### `/perm` — dynamic per-user permissions (group owner only)

Reply to the target user's message, then run one of:

| Command | Effect |
|---------|--------|
| `/perm grant <key\|all>` | Grant a permission to the replied-to user |
| `/perm revoke <key\|all>` | Revoke a permission |
| `/perm list` | List the user's dynamically granted permissions |
| `/perm keys` | Show all available permission keys (open to everyone) |
| `/perm help` | Usage help (open to everyone) |

Instead of replying, a numeric user id may be appended (e.g. `/perm grant coin_take 12345`).

Permission keys: `coin_check`, `coin_take`, `coin_create`, `coin_remove`, `lottery`, `top`, plus `all`. `grant`/`revoke`/`list` require the caller to be the group owner and require the D1 `DB` binding.

### Topic-gated features and `/topic`

Some features only run inside specific forum topics: `/coin pray`, `/fate`, `/f` (fish). The allowed topics are resolved by `isFeatureAllowed()` (`src/lib/topicAccess.ts`) with this precedence:

1. If the group has an explicit config (via `/topic`, stored in D1 `topic_access`, isolated per `chat_id`) → use it.
2. Else if the group matches a hardcoded historical default → use that default (preserves prior behavior for the original groups).
3. Else (new/unconfigured group) → open in all topics.

`/topic` lets the **group owner** customize this. Mutations must be run **inside the target topic** (the command uses the current `message_thread_id`):

| Command | Effect |
|---------|--------|
| `/topic allow <feature>` | Allow the feature in the current topic (switches to per-topic mode) |
| `/topic disallow <feature>` | Remove the current topic from the allowed set |
| `/topic anywhere <feature>` | Allow the feature in every topic of the group |
| `/topic reset <feature>` | Clear the group's config, reverting to the default |
| `/topic list [feature]` | Show the effective config (open to everyone) |
| `/topic features` | List configurable feature names (open to everyone) |

Feature names: `pray`, `fate`, `fish`. `allow`/`disallow`/`anywhere`/`reset` require the group owner and the D1 `DB` binding.

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
