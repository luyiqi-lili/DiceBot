# /top Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for implementation. When tasks have disjoint file ownership and no dependencies, dispatch them in parallel waves; use `superpowers:executing-plans` only when subagents are unavailable or sequential execution is required. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a whitelisted-admin `/top` command that reports the most active topics in the current chat over the last 7 days.

**Architecture:** Implement a focused command handler that validates a dedicated whitelist, runs a read-only grouped D1 query against `message_history`, and replies in the triggering thread. Register the command through the existing static loader and route metadata.

**Tech Stack:** TypeScript, Cloudflare Workers, D1, grammY wrapper, Vitest.

---

### Task 1: Command Tests

**Files:**
- Create: `test/commands/top.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create tests that mock `src/lib/telegram`, import `handleTop`, and cover unauthorized users, ranked recent results, and empty results.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- test/commands/top.spec.ts --run`

Expected: FAIL because `src/commands/top.ts` does not exist.

### Task 2: Command Handler

**Files:**
- Create: `src/commands/top.ts`
- Modify: `src/data/admin.ts`
- Modify: `src/lib/liveConfig.ts`

- [ ] **Step 1: Add `TOP_ADMIN_UIDS`**

Add a dedicated whitelist in `src/data/admin.ts` and re-export it from `src/lib/liveConfig.ts`.

- [ ] **Step 2: Implement `handleTop`**

Validate the caller, require `env.DB`, query recent `message_history` rows, group by `thread_id`, and send formatted output through `TgMessage.sendText`.

- [ ] **Step 3: Run focused tests**

Run: `npm test -- test/commands/top.spec.ts --run`

Expected: PASS.

### Task 3: Runtime Registration

**Files:**
- Modify: `src/index.ts`
- Modify: `src/routes.ts`

- [ ] **Step 1: Register `/top`**

Add `top` to `loadCommand()` in `src/index.ts` and `COMMAND_ROUTES` in `src/routes.ts`.

- [ ] **Step 2: Run integration-relevant tests**

Run: `npm test -- test/commands/top.spec.ts test/index.spec.ts --run`

Expected: PASS.

### Task 4: Verification

**Files:**
- No new files.

- [ ] **Step 1: Run final verification**

Run: `npm test -- test/commands/top.spec.ts test/index.spec.ts --run`

Expected: PASS with no failed tests.
