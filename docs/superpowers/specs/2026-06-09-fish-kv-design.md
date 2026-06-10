# Fish KV Implementation Record

Chinese translation: [../../zh-CN/superpowers/specs/2026-06-09-fish-kv-design.md](../../zh-CN/superpowers/specs/2026-06-09-fish-kv-design.md)

## Original Intent

Move the fish catalog from a static TypeScript list into a Cloudflare KV namespace and allow users to add fish from Telegram.

## Current Implementation

The feature is implemented in the current codebase:

- `FISH_KV` stores the catalog.
- `src/lib/fishCatalog.ts` owns catalog loading, seeding, validation, addition, and removal.
- `src/data/fish.ts` remains the seed/fallback source.
- `src/commands/fish.ts` supports `/fish add`, `/fish list`, and `/fish remove`.
- `test/lib/fishCatalog.spec.ts` and `test/commands/fish.spec.ts` cover the active behavior.

## Current User Behavior

- `/fish add <name> <value>` adds a fish after validation and payment.
- Values must be in the allowed user range.
- Duplicate or invalid entries are rejected by catalog logic.
- `/fish list [page]` and `/fish remove <index>` are admin operations.

## Canonical Documentation

Use [../../fish-system.md](../../fish-system.md) for the maintained fish system manual.
