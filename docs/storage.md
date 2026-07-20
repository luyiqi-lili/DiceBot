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
| `DB` | D1 | DND, items, affection, wishes, backup, rules, PR snapshots, encrypted API-key donations |

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

Both prod and dev bind D1 as `DB`, targeting `dicebot-db` and `dicebot-dev-db` respectively. Code must still degrade cleanly in tests or temporary environments where the binding is absent.

Major D1 table families:

- DND: `dnd_races`, `dnd_classes`, `dnd_skills`, `dnd_characters`, `dnd_gm`, `dnd_dc`.
- Items: `dnd_item_templates`, `dnd_inventory`.
- Affection: `affections`, `rose_sends`.
- Usage and backup: usage count, user activity, message history, and activity/report tables as used by `src/lib/backup.ts`, `src/commands/act.ts`, and `src/commands/report.ts`.
- Rules: group rule tables used by `src/commands/rule.ts`.
- Self-evolution: `api_key_donations` stores AES-GCM ciphertext and irreversible fingerprints; `api_credential_profiles` stores canonical provider, consent policy, health, and non-secret model ids. PR/Issue snapshots, private Telegram-to-Issue intake mappings, selection runs, and paid-premium label audits use `pull_request_snapshots`, `pr_monitor_runs`, `github_issue_submissions`, `github_issue_snapshots`, `evolution_selection_runs`, and `ai_issue_triage_runs`.

No HTTP API may return `api_key_donations.encrypted_key`. Routing may only consider `active` credentials whose profile is `shared_inference + healthy`; `validation_only` is the intake default.

`ai_issue_triage_runs` stores only the provider/model, credential source, paid-balance boolean, confidence, decision reason, and Issue version. It never stores the API key or exact provider balance.

The repository does not currently keep a single canonical schema migration file for all D1 tables. Schema knowledge is spread across docs and SQL in command/lib modules.

## Legacy Notes

- `ITEM_STORE` was used by old `/item create/list/use/send #N`; current `/item` is D1-backed.
- `COIN_KV` is not the primary coin ledger.
- `AFFECTION_KV` remains useful for fallback migration and ranking merge.

## Operational Notes

- Treat Durable Object APIs as internal service boundaries.
- Dev and prod use separate D1 databases; do not accidentally add `--remote` during local verification.
- When adding a table, document its owner module and create focused tests around the query contract.
