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
| `DB` | D1 | DND, items, affection, wishes, backup, rules, PR snapshots, non-secret API-key donation metadata, routing cursors, Stars/TON donation ledger |

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
- AI credentials and routing: `api_key_donations` stores irreversible fingerprints, cost class, AI Gateway aliases/Secret/Store IDs, and lifecycle metadata; new key values exist only in Cloudflare AI Gateway Secrets Store. `api_credential_profiles` stores canonical provider, consent policy, health, and cached non-secret model ids. `ai_gateway_rotation_state` is created idempotently by the routing modules and advances a separate round-robin cursor for each pool.
- Self-evolution: PR/Issue snapshots, private Telegram-to-Issue intake mappings, selection runs, and model-gate audits use `pull_request_snapshots`, `pr_monitor_runs`, `github_issue_submissions`, `github_issue_snapshots`, `evolution_selection_runs`, and `ai_issue_triage_runs`.
- Financial donations: `financial_donations` records Stars invoice intents, successful Telegram charge identifiers, and TON transfer intents with unique memos. It never stores a wallet private key.

No HTTP API may return legacy `api_key_donations.encrypted_key`, and new donations leave the legacy ciphertext/IV columns empty. Routing may only consider `active` credentials whose profile is `shared_inference + healthy`; `validation_only` is the intake default. Donor revocation deletes the Gateway secret first, then clears any legacy ciphertext and marks both donation/profile metadata revoked.

`ai_issue_triage_runs` stores only the provider/model, credential source, paid-balance boolean, confidence, decision reason, and Issue version. It never stores the API key or exact provider balance.

`schema/d1.sql` is the bootstrap snapshot for a new database. It is not an ordered migration history: owner modules still use idempotent `CREATE TABLE`, `ALTER TABLE`, and compatibility checks at runtime, and `ai_gateway_rotation_state` is currently one such runtime-created table.

## Legacy Notes

- `ITEM_STORE` was used by old `/item create/list/use/send #N`; current `/item` is D1-backed.
- `COIN_KV` is not the primary coin ledger.
- `AFFECTION_KV` remains useful for fallback migration and ranking merge.

## Operational Notes

- Treat Durable Object APIs as internal service boundaries.
- Dev and prod use separate D1 databases; do not accidentally add `--remote` during local verification.
- When adding a table, document its owner module and create focused tests around the query contract.
