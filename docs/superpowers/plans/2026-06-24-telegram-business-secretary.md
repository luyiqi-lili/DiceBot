# Telegram Business Secretary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for implementation. When tasks have disjoint file ownership and no dependencies, dispatch them in parallel waves; use `superpowers:executing-plans` only when subagents are unavailable or sequential execution is required. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept Telegram Business / Chat Automation updates and send a minimal secretary reply using `business_connection_id`.

**Architecture:** Extend the existing Telegram parser to expose Business update types and connection IDs. Add a small focused Business command module, then dispatch Business updates before group allowlist checks in `src/index.ts`.

**Tech Stack:** TypeScript, Cloudflare Workers, grammY, Vitest.

---

### Task 1: Business Update Parsing

**Files:**
- Modify: `src/lib/telegram.ts`
- Test: `test/lib/telegram.spec.ts`

- [ ] Write failing tests for `business_connection`, `business_message`, and `deleted_business_messages` parsing.
- [ ] Run `npm test -- test/lib/telegram.spec.ts --run` and verify the new tests fail because parsing is missing.
- [ ] Extend `ParsedUpdate` and `parsedUpdateFromContext` to preserve Business update data.
- [ ] Run `npm test -- test/lib/telegram.spec.ts --run` and verify the parser tests pass.

### Task 2: Secretary Handler

**Files:**
- Create: `src/commands/businessSecretary.ts`
- Test: `test/commands/businessSecretary.spec.ts`

- [ ] Write a failing test that a Business text message sends a reply containing `business_connection_id`.
- [ ] Run `npm test -- test/commands/businessSecretary.spec.ts --run` and verify it fails because the handler is missing.
- [ ] Implement the minimal Business secretary handler.
- [ ] Run `npm test -- test/commands/businessSecretary.spec.ts --run` and verify it passes.

### Task 3: Webhook Dispatch

**Files:**
- Modify: `src/index.ts`
- Test: `test/telegram-webhook-contract.spec.ts`

- [ ] Write a failing webhook test proving a `business_connection` update returns 200.
- [ ] Run `npm test -- test/telegram-webhook-contract.spec.ts --run` and verify it fails before dispatch support.
- [ ] Dispatch Business updates before the group allowlist.
- [ ] Run `npm test -- test/telegram-webhook-contract.spec.ts --run` and verify it passes.

### Task 4: Verification

**Files:**
- No new files.

- [ ] Run targeted tests: `npm test -- test/lib/telegram.spec.ts test/commands/businessSecretary.spec.ts test/telegram-webhook-contract.spec.ts test/index.spec.ts --run`.
- [ ] Run full test suite: `npm test -- --run`.
- [ ] Check git diff and summarize publish steps without pushing `main`.
