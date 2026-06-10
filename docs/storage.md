# Storage

Chinese translation: [zh-CN/storage.md](zh-CN/storage.md)

This project uses Cloudflare KV, Durable Objects, and D1.

## Binding Overview

Bindings are declared in `src/index.ts` and configured in `wrangler.jsonc`.

| Binding | Kind | Main users |
|---------|------|------------|
| `NEWS_STORE` | KV | `/news` |
| `TOPIC_KV` | KV | topic edit tracking |
| `BOOK_STORE` | KV | `/book` |
| `FISHING_RECORD_KV` | KV | fishing records, pond summaries |
| `FISH_KV` | KV | fish catalog |
| `TGBOTCOUNT` | KV | usage count legacy/support |
| `AFFECTION_KV` | KV | affection migration fallback |
| `ITEM_STORE` | KV | legacy item store |
| `COIN_KV` | KV | legacy coin support |
| `COIN_DO` | Durable Object | coin balances, treasury, raw coin keys |
| `LOTTERY_DO` | Durable Object | lottery pool and tickets |
| `DB` | D1 | DND, item, affection, wish, backup, rules, reports |

## KV

KV is used for lower-risk or legacy data where eventual consistency is acceptable:

- news by date
- bookmarks
- fish records and catalog
- topic title cache
- affection fallback migration

## Durable Objects

Durable Objects provide serialized state mutation:

- `src/durableObjects/coin_do.ts`: balance and treasury operations.
- `src/durableObjects/lottery_do.ts`: ticket/pool state.

`src/lib/coinService.ts` wraps the CoinDO HTTP interface with semantic helpers:

- `getBalance`
- `transfer`
- `addToTreasury`
- `takeFromTreasury`
- `getTreasury`
- `sumAllUserBalances`

## D1

Production has a D1 binding named `DB`. Dev currently does not bind D1 in `wrangler.jsonc`, so D1-dependent handlers must degrade cleanly.

Major D1 table families:

- DND: `dnd_races`, `dnd_classes`, `dnd_skills`, `dnd_characters`, `dnd_gm`, `dnd_dc`.
- Items: `dnd_item_templates`, `dnd_inventory`.
- Affection: `affections`, `rose_sends`.
- Wish automation: `wishes`, `wish_summaries`, `wish_tasks`.
- Usage and backup: usage count, user activity, message history, and activity/report tables as used by `src/lib/backup.ts`, `src/commands/act.ts`, and `src/commands/report.ts`.
- Rules: group rule tables used by `src/commands/rule.ts`.

The repository does not currently keep a single canonical schema migration file for all D1 tables. Schema knowledge is spread across docs and SQL in command/lib modules.

## Legacy Notes

- `ITEM_STORE` was used by old `/item create/list/use/send #N`; current `/item` is D1-backed.
- `COIN_KV` is not the primary coin ledger.
- `AFFECTION_KV` remains useful for fallback migration and ranking merge.

## Operational Notes

- Treat Durable Object APIs as internal service boundaries.
- Treat D1 absence as expected in dev unless config is changed.
- When adding a table, document its owner module and create focused tests around the query contract.
