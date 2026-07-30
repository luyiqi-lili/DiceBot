# Testing And Audit

Chinese translation: [zh-CN/testing.md](zh-CN/testing.md)

## Test Layout

```text
test/
  commands/                 command handler unit tests
  lib/                      library and domain unit tests
  e2e/                     live external API and local-Wrangler webhook tests
  scripts/                  shell tests for wish scripts
  helpers/mocks.ts          shared mocks
  index.spec.ts             Worker entry tests
  routes.spec.ts            route registration tests
```

## Unit Tests

Use Node.js 22 or newer for local commands that invoke Wrangler. CI currently runs on Node.js 24.x.

Run the fast local Node suite:

```bash
npm run test:unit -- --run
```

Run one file:

```bash
npx vitest --config vitest.node.config.mts run test/commands/item.spec.ts
```

`vitest.node.config.mts` excludes E2E and tests that require the Cloudflare Worker runtime, Durable Objects, or Worker integration bindings. It should not call the live Worker.

Run the Cloudflare Workers pool suite:

```bash
npm test -- --run
```

This loads the dev environment from `wrangler.jsonc`. Because that environment has an `AI` binding, startup may establish a Cloudflare remote AI preview and therefore needs a valid Cloudflare token with Workers preview permissions. This is not the preferred offline/unit command.

## E2E Tests

Run:

```bash
npm run test:e2e
```

Required environment:

- `WORKER_BASE_URL`
- `EXTERNAL_API_KEY`

The e2e suite calls the live external API and should be run intentionally.

For the focused local Wrangler webhook smoke test:

```bash
npm run test:e2e:local
```

This starts a local Worker and exercises a synthetic Telegram webhook. It does not send a Telegram message.

## Script Tests

Shell tests live in `test/scripts/`:

- `test/scripts/wish-digest-format.sh`
- `test/scripts/wish-execute-cleanup.sh`
- `test/scripts/wish-execute-interrupt.sh`
- `test/scripts/wish-execute-retry.sh`

They validate local wish automation formatting and cleanup behavior.

## Type Check

Run:

```bash
npx tsc --noEmit
```

The current codebase is expected to pass this check.

## Dependency Audit

Run:

```bash
npm audit --audit-level=low
```

As of 2026-07-30 this reports 5 high-severity transitive findings:

- `postcss` path traversal/source-map disclosure.
- `sharp`/libvips advisories inherited through Miniflare, Wrangler, and `@cloudflare/vitest-pool-workers`.

`npm audit fix --force` proposes a breaking upgrade to `@cloudflare/vitest-pool-workers@0.19.0`. Do not apply that automatically during unrelated work; upgrade the Cloudflare test toolchain intentionally, then rerun the Node suite, Workers-pool suite, type check, and production dry-run.

## Documentation Verification

Useful stale-text scans should look for placeholder words and known old counts/labels across both READMEs, canonical `docs/` pages, their `docs/zh-CN/` translations, and both `.deepseek/instructions*` files.

Files under `docs/superpowers/` and `docs/zh-CN/superpowers/` are dated design/implementation records. They may intentionally describe the state at that date and must not be interpreted as current runtime documentation.
