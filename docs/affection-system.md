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
| `COIN_DO` | paid extra flower cost |

`src/lib/affectionDB.ts` owns the D1/KV fallback logic.

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

## Tests

Relevant test:

- `test/commands/rose.spec.ts`
