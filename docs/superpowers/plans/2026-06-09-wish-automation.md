# Wish Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/wish` collection, 10-minute digest tooling, Telegram reply approval, and a local Codex execution handoff.

**Architecture:** Store raw wishes, digest summaries, and executable candidate tasks in D1. Cloudflare Worker handles `/wish`, admin reply approval, and authenticated `/api/wish/*` endpoints; local scripts call those endpoints and run Codex CLI outside Workers.

**Tech Stack:** TypeScript Cloudflare Workers, D1, Telegram Bot API, shell scripts, Codex CLI non-interactive mode.

---

### Task 1: Wish Storage Core

**Files:**
- Create: `src/lib/wishCore.ts`
- Test: `test/lib/wishCore.spec.ts`

- [x] Write failing tests for `isMeaningfulWish`, `createWish`, summary creation, approval, claim, and status updates.
- [x] Implement D1 table initialization and typed helpers.
- [x] Run `npm test -- test/lib/wishCore.spec.ts`.

### Task 2: Bot Command and Approval

**Files:**
- Create: `src/commands/wish.ts`
- Modify: `src/routes.ts`
- Modify: `src/index.ts`
- Modify: `src/commands/help.ts`
- Test: `test/commands/wish.spec.ts`

- [x] Write failing tests for `/wish`, meaningless wish ignoring, non-admin reply ignored, and admin reply approval.
- [x] Implement command registration and reply approval hook.
- [x] Run `npm test -- test/commands/wish.spec.ts`.

### Task 3: Worker API for Local Scripts

**Files:**
- Modify: `src/index.ts`
- Test: `test/index.spec.ts` or `test/commands/wish.spec.ts`

- [x] Add authenticated `/api/wish/pending`, `/api/wish/summaries`, `/api/wish/approved/claim`, and `/api/wish/tasks/:id/status` endpoints.
- [x] Reuse existing `EXTERNAL_API_KEY` check.
- [x] Run focused API tests.

### Task 4: Local Automation Scripts

**Files:**
- Create: `scripts/wish-digest.sh`
- Create: `scripts/wish-execute.sh`
- Create: `docs/wish-automation.md`

- [x] Implement `wish-digest.sh` for 10-minute cron use: fetch pending wishes, call `codex exec` for 1-3 candidates, send Telegram summary, store summary through API.
- [x] Implement `wish-execute.sh`: claim one approved task, run Codex CLI, verify, commit, push, report result.
- [x] Document cron entries and required environment variables.

### Task 5: Verification

**Files:**
- All changed files

- [x] Run `npm test -- test/lib/wishCore.spec.ts test/commands/wish.spec.ts test/lib/wishApi.spec.ts`.
- [x] Run `git diff --check`.
- [x] Run `npm test` and record any existing unrelated failures.
