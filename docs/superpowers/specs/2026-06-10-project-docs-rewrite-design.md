# Project Documentation Rewrite Design

Chinese translation: [../../zh-CN/superpowers/specs/2026-06-10-project-docs-rewrite-design.md](../../zh-CN/superpowers/specs/2026-06-10-project-docs-rewrite-design.md)

## Goal

Rewrite the repository documentation into a coherent project manual based on the current code implementation, not on older README text or historical plans.

## Scope

This pass covers every project-owned Markdown document:

- `README.md`
- `.deepseek/instructions.md`
- `docs/*.md`
- `docs/superpowers/specs/*.md`
- `docs/superpowers/plans/*.md`

Generated dependency documentation under `node_modules/` is out of scope.

## Documentation Model

The new structure treats `README.md` as the entry point and `docs/` as the detailed handbook.

`README.md` should answer:

- what the bot is
- how requests flow through the Worker
- which commands exist
- which storage bindings are required
- how to run tests, type checks, dev, deploy, and e2e
- which operational and security caveats matter right now

`docs/` should hold focused subsystem and operator manuals:

- architecture and routing
- command reference
- environment and deployment
- testing and audit status
- storage schema and bindings
- subsystem docs for DND, item, coin/lottery, fish, affection, wish automation, web games, and AI features

Historical Superpowers specs and plans should be rewritten as project-readable implementation records. They should keep enough history to explain why features exist, but the current implementation status must be explicit.

## Source Of Truth

The rewrite must derive facts from current code:

- `src/index.ts` for HTTP routing, event dispatch, static command imports, callback handling, web/API handling, cron entry point, and Env bindings
- `src/routes.ts` for command metadata such as `deleteMsg`
- `wrangler.jsonc` for Cloudflare bindings, env names, bot usernames, cron schedules, Durable Objects, and D1 availability
- `src/commands/*` for command syntax and behavior
- `src/lib/*` for storage and domain logic
- `scripts/*` for local automation behavior
- `test/*` for actual test layout and validation commands

When `routes.ts` and `index.ts` differ, document the actual runtime behavior from `index.ts` and call out route metadata drift as a maintenance note.

## Target Files

### Entry Point

- `README.md`: concise but complete project overview, architecture, feature map, setup, runbook, test commands, deploy notes, audit status, and doc index.

### New Or Reworked Manuals

- `docs/architecture.md`: request lifecycle, routing, command/callback loading, backup flow, cron, web/API routes.
- `docs/commands.md`: full user/admin command reference based on `loadCommand`, callbacks, and star shortcut handling.
- `docs/environment.md`: Cloudflare bindings, secrets, local env files, dev/prod differences, external API key behavior.
- `docs/testing.md`: unit/e2e/script tests, known current type-check failures, audit commands.
- `docs/storage.md`: KV, Durable Objects, D1 table families, legacy bindings, migration notes.
- `docs/web-games.md`: `/web/hello`, `/web/fish`, score APIs, Telegram game launch flow.
- Existing subsystem docs remain but are rewritten to match the new style:
  - `docs/dnd-design.md`
  - `docs/item-system.md`
  - `docs/coin-system.md`
  - `docs/fish-system.md`
  - `docs/affection-system.md`
  - `docs/wish-automation.md`

### Historical Records

- `docs/superpowers/specs/*.md`
- `docs/superpowers/plans/*.md`

These will be normalized with a short header explaining that they are implementation records, followed by current status. Original detailed task content may be summarized if it duplicates the new manuals.

## Content Rules

- Prefer concrete filenames and commands over broad prose.
- Avoid stale counts unless they are generated from current repository state during the rewrite.
- Mark known risks explicitly:
  - `EXTERNAL_API_KEY` only gates `/api/*` when configured.
  - `src/web/score.ts` logs `env.TOKEN`.
  - `npx tsc --noEmit` currently fails in files unrelated to docs.
  - dependency audit currently reports vulnerabilities.
- Do not include actual secret values.
- Keep legacy systems documented as legacy, not as active behavior.
- Do not modify production code during this documentation rewrite.

## Verification

Run these after the rewrite:

```bash
npm test -- --run
npx tsc --noEmit
npm audit --audit-level=low
```

Passing unit tests are required for this documentation task. Type check and audit may still fail because they already fail in the current project; the final report must state their exact status.

## Non-Goals

- No production code changes.
- No dependency upgrades.
- No Cloudflare configuration changes.
- No secret rotation.
- No schema migration.
