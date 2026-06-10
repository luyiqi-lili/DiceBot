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

They validate local wish automation formatting and cleanup behavior.

## Type Check

Run:

```bash
npx tsc --noEmit
```

Current known failures are in existing production files:

- `src/commands/act.ts`
- `src/commands/dndAttack.ts`
- `src/lib/coinService.ts`

These are not documentation failures, but they block claiming the project type-checks cleanly.

## Dependency Audit

Run:

```bash
npm audit --audit-level=low
```

Current audit status includes vulnerabilities in the toolchain/dependency graph. Review `npm audit` output before release work involving dependency updates.

## Documentation Verification

Useful stale-text scans should look for placeholder words and known old counts/labels across `README.md`, `docs/`, and `.deepseek/instructions.md`.

Some historical docs may intentionally mention old names if marked as historical.
