# Fish KV Catalog Design

## Goal

Move the fishing catalog from the static TypeScript list into a dedicated Cloudflare KV namespace, then allow users to add new fish with `/fish add`.

## Decisions

- Use a dedicated `FISH_KV` binding in both `dev` and `prod`.
- Store the full catalog under `fish:list:v1`.
- Keep `src/data/fish.ts` as the default seed and fallback source.
- On first read, if `FISH_KV` has no catalog, write the current static list into KV and return it.
- `/fish add <name> <value>` adds a new fish:
  - `value` must be an integer from `1` to `13`.
  - Hook rate is server-controlled and derived from the existing default list for that value.
  - The user pays `10c` via `addToTreasury`.
  - The stored fish name is HTML-escaped and wrapped in the current Telegram HTML display format.

## Architecture

- `src/lib/fishCatalog.ts` owns catalog persistence, validation, seed initialization, and value-to-hook-rate mapping.
- `src/lib/fishCore.ts` stays focused on fishing algorithms and accepts a fish list argument instead of reading static config directly.
- `src/commands/fish.ts` reads the KV catalog for regular fishing, callback resolution, and guarantee selection.
- `wrangler.jsonc` declares `FISH_KV` for both environments.

## Errors

- Missing `FISH_KV` returns a user-facing configuration error for commands that need the catalog.
- Invalid `/fish add` usage returns a usage hint.
- Values outside `1..13` are rejected.
- Insufficient balance rejects the add before mutating KV.

## Tests

- KV catalog initializes from the static list when empty.
- `/fish add` deducts 10c and writes the new fish to `FISH_KV`.
- `/fish add` rejects invalid values.
- `/fish add` rejects insufficient balance.
