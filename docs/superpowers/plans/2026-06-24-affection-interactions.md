# Affection Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for implementation. When tasks have disjoint file ownership and no dependencies, dispatch them in parallel waves; use `superpowers:executing-plans` only when subagents are unavailable or sequential execution is required. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add +1 directed affection for replies and one-time-per-message reactions.

**Architecture:** Add a focused `src/lib/affectionInteractions.ts` module and call it from the webhook dispatcher. Parse `message_reaction` updates in `src/lib/telegram.ts`; resolve reaction targets through D1 `message_history`; store reaction counted markers in `AFFECTION_KV`.

**Tech Stack:** TypeScript, Cloudflare Workers, D1, KV, Vitest.

---

### Task 1: Telegram Reaction Parsing

**Files:**
- Modify: `src/lib/telegram.ts`
- Test: `test/lib/telegram.spec.ts`

- [ ] Add `messageReaction?: any` to `ParsedUpdate`.
- [ ] Write a failing test that `parsedUpdateFromContext()` parses `message_reaction`.
- [ ] Implement parsing from `(ctx as any).messageReaction` or `ctx.update.message_reaction`.
- [ ] Run `npx vitest test/lib/telegram.spec.ts --run`.

### Task 2: Interaction Affection Rules

**Files:**
- Create: `src/lib/affectionInteractions.ts`
- Test: `test/lib/affectionInteractions.spec.ts`

- [ ] Write failing tests for reply increment, bot/self skips, initial reaction increment, marker skip, and reaction removal skip.
- [ ] Implement `recordReplyAffection(parsed, env)`.
- [ ] Implement `recordReactionAffection(parsed, env)`.
- [ ] Run `npx vitest test/lib/affectionInteractions.spec.ts --run`.

### Task 3: Webhook Dispatch Integration

**Files:**
- Modify: `src/index.ts`
- Test: focused unit tests from Tasks 1 and 2, plus existing webhook tests.

- [ ] Call `recordReactionAffection()` for `message_reaction` updates.
- [ ] Call `recordReplyAffection()` for `message` updates before command/non-command dispatch.
- [ ] Ensure failures are caught/logged in the interaction module so normal handling continues.
- [ ] Run `npx vitest test/lib/telegram.spec.ts test/lib/affectionInteractions.spec.ts test/index.spec.ts --run`.

### Task 4: Docs and Verification

**Files:**
- Modify: `docs/affection-system.md`
- Modify: `docs/zh-CN/affection-system.md`

- [ ] Document reply and reaction affection increments.
- [ ] Mention reaction webhook requirements.
- [ ] Run `npm test -- --run`.
