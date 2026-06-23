# Testing And Audit

Chinese translation: [zh-CN/testing.md](zh-CN/testing.md)

## Test Layout

```text
test/
  commands/                 command handler unit tests
  lib/                      library and domain unit tests
  e2e/external-api.spec.ts  live Worker API test
  scripts/                  shell tests for wish scripts
  helpers/mocks.ts          shared mocks
  index.spec.ts             Worker entry tests
  routes.spec.ts            route registration tests
```

## Unit Tests

Use Node.js 22 or newer for local commands that invoke Wrangler. CI currently runs on Node.js 24.x.

Run all unit tests:

```bash
npm test -- --run
```

Run one file:

```bash
npx vitest run test/commands/item.spec.ts
```

The default unit suite should not call the live Worker.

## E2E Tests

Run:

```bash
npm run test:e2e
```

Required environment:

- `WORKER_BASE_URL`
- `EXTERNAL_API_KEY`

The e2e suite calls the live external API and should be run intentionally.

## Script Tests

Shell tests live in `test/scripts/`:

- `test/scripts/wish-digest-format.sh`
- `test/scripts/wish-execute-cleanup.sh`
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

The current dependency graph is expected to pass this check.

## Documentation Verification

Useful stale-text scans should look for placeholder words and known old counts/labels across `README.md`, `docs/`, and `.deepseek/instructions.md`.

Some historical docs may intentionally mention old names if marked as historical.
