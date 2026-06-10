# Fish System

Chinese translation: [zh-CN/fish-system.md](zh-CN/fish-system.md)

The fish system includes a Telegram command flow and a separate web game flow.

## Storage

| Binding | Purpose |
|---------|---------|
| `FISH_KV` | fish catalog under `fish:list:v1` |
| `FISHING_RECORD_KV` | user fishing records and daily pond summaries |
| `COIN_DO` | bait payments and fish payouts |

`src/data/fish.ts` remains the seed/fallback list for catalog initialization.

## Commands

Handled by `src/commands/fish.ts`.

| Command | Behavior |
|---------|----------|
| `/fish <bait>` | Spend bait and create a pull callback |
| `/fish check` | Show today's fishing record |
| `/fish add <name> <value>` | Spend 10 coins to add a fish; value must be 1-13 |
| `/fish list [page]` | Admin list, 20 rows per page |
| `/fish remove <index>` | Admin remove by visible index |

Admin user set in code: `8080375150`.

## Fishing Callback

The `/fish <bait>` command sends a callback button. `handleFishCallback()`:

- allows only the initiating user to pull
- calculates score from elapsed seconds and strength
- rejects duplicate processing for the same message
- enforces daily attempt limit from `MAX_FISH_ATTEMPTS`
- records misses, escaped fish, and catches in `FISHING_RECORD_KV`
- pays caught value from treasury through `COIN_DO`
- tracks pond total bait, payout, hooked count, and attempt count

## Guarantee

After enough zero-value results, a once-per-day guarantee can select a high-value fish when score is in the catch window.

## Fish Catalog

`src/lib/fishCatalog.ts` owns:

- reading catalog from KV
- seeding from `src/data/fish.ts`
- validating user-added fish names and values
- appending fish
- removing fish
- mapping value to hook rate

## Web Game

The web game lives under `src/web/fish/` and is documented in [web-games.md](web-games.md). It has routes for page, data, cast, pull, and score submission.

## Files

| File | Purpose |
|------|---------|
| `src/commands/fish.ts` | Telegram command and callback flow |
| `src/lib/fishCore.ts` | record and fishing helpers |
| `src/lib/fishCatalog.ts` | catalog persistence and validation |
| `src/data/fish.ts` | seed catalog and cast text |
| `src/web/fish/` | web game |

## Tests

Relevant tests:

- `test/commands/fish.spec.ts`
- `test/lib/fishCatalog.spec.ts`
- `test/index-fish-alias.spec.ts`
