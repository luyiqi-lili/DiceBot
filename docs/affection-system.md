# Affection System

Chinese translation: [zh-CN/affection-system.md](zh-CN/affection-system.md)

The affection system tracks directional affection between Telegram users.

## Runtime Entry Point

`/rose` is handled by `src/commands/rose.ts`.

## Storage

| Store | Role |
|-------|------|
| D1 `affections` | primary directional affection records |
| D1 `rose_sends` | daily free-send tracking |
| `AFFECTION_KV` | fallback/migration source |
| `AFFECTION_KV` reaction markers | one-time reaction counting keys |
| `COIN_DO` | paid extra flower cost |

`src/lib/affectionDB.ts` owns the D1/KV fallback logic.

## Passive Interactions

Non-command and command replies both count as passive interaction. When user A replies to user B's message, A's affection toward B increases by the length of A's reply text. If A's reply is a photo, image document, sticker, or pure emoji text, it increases affection by 5 instead. Self replies and bot targets are ignored.

Telegram reactions also count as passive interaction. Any reaction emoji counts, but each reacting user can increase affection only once per target message. If A reacts to B's message, cancels the reaction, and reacts to the same message again, the second reaction is ignored.

Reaction updates do not include the original message author, so `src/lib/affectionInteractions.ts` resolves B from D1 `message_history` by `chat_id + message_id`. If the message is not in history or D1 is unavailable, the reaction is skipped silently.

Telegram only sends `message_reaction` updates when the bot is an administrator and the webhook explicitly includes `"message_reaction"` in `allowed_updates`.

## Commands

| Command | Behavior |
|---------|----------|
| `/rose` as reply | Show your affection toward the replied user |
| `/rose send` as reply | Send a flower to the replied user |
| `/rose check` | Show incoming affection ranking for self or replied user |

## Sending Flowers

The first daily `/rose send` is free and adds 160 affection.

Additional sends on the same UTC date cost 30 coins through `COIN_DO` and also add 160 affection.

If coin deduction succeeds but D1 write fails, the user is warned that payment was taken but affection failed.

## Ranking

`/rose check` reads a ranking of users who have affection toward the target. The implementation merges D1 and KV fallback data where needed.

## Display

`scoreToEmoji()` in `src/commands/rose.ts` maps scores into repeated emoji tiers. The exact rendering is code-defined rather than a fixed table.

## Files

| File | Purpose |
|------|---------|
| `src/commands/rose.ts` | command behavior |
| `src/lib/affectionDB.ts` | D1/KV migration and query helpers |
| `src/lib/affectionInteractions.ts` | passive reply/reaction affection rules |

## Tests

Relevant test:

- `test/commands/rose.spec.ts`
- `test/lib/affectionInteractions.spec.ts`
- `test/index-affection-interactions.spec.ts`
