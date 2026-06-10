# Project Documentation Rewrite Implementation Plan

Chinese translation: [../../zh-CN/superpowers/plans/2026-06-10-project-docs-rewrite.md](../../zh-CN/superpowers/plans/2026-06-10-project-docs-rewrite.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite all project-owned Markdown documentation so it reflects the current Telegram bot implementation.

**Architecture:** Keep `README.md` as the short entry point and move detailed operating knowledge into focused files under `docs/`. Rewrite historical Superpowers specs/plans as implementation records with current status. Use code files, Wrangler config, scripts, and tests as the source of truth.

**Tech Stack:** Markdown documentation for a TypeScript Cloudflare Workers Telegram bot using KV, Durable Objects, D1, Vitest, Wrangler, and shell automation scripts.

---

### Task 1: Gather Current Implementation Facts

**Files:**
- Read: `src/index.ts`
- Read: `src/routes.ts`
- Read: `wrangler.jsonc`
- Read: `package.json`
- Read: `scripts/*.sh`
- Read: `src/commands/*.ts`
- Read: `src/lib/*.ts`
- Read: `test/**/*`

- [x] **Step 1: Capture command and callback surface**

Run:

```bash
sed -n '90,190p' src/index.ts
sed -n '1,160p' src/routes.ts
```

Expected: list of `loadCommand`, `loadCallback`, and route metadata entries.

- [x] **Step 2: Capture environment and storage bindings**

Run:

```bash
sed -n '18,48p' src/index.ts
sed -n '1,220p' wrangler.jsonc
```

Expected: Env type plus dev/prod Cloudflare bindings.

- [x] **Step 3: Capture test and script layout**

Run:

```bash
find test -maxdepth 3 -type f | sort
find scripts -maxdepth 2 -type f | sort
```

Expected: current unit, e2e, shell test, and automation file list.

### Task 2: Rewrite Entry Point And Core Manuals

**Files:**
- Modify: `README.md`
- Create: `docs/architecture.md`
- Create: `docs/commands.md`
- Create: `docs/environment.md`
- Create: `docs/testing.md`
- Create: `docs/storage.md`
- Create: `docs/web-games.md`

- [x] **Step 1: Rewrite `README.md`**

Replace stale architecture, counts, and backlog-heavy content with concise current sections: overview, request flow, feature map, storage map, command summary, setup/run/test/deploy, risks, and document index.

- [x] **Step 2: Add architecture manual**

Create `docs/architecture.md` covering Worker routing, static imports, callbacks, non-command message handling, web/API routes, scheduled cron, and backup flow.

- [x] **Step 3: Add command reference**

Create `docs/commands.md` from `loadCommand`, callback handling, and command modules. Include DND `attack`, `atk`, `cast`, `lvup`, `level`, and `*` shortcut behavior.

- [x] **Step 4: Add environment, testing, storage, and web manuals**

Create `docs/environment.md`, `docs/testing.md`, `docs/storage.md`, and `docs/web-games.md` with current commands and known risks.

### Task 3: Rewrite Subsystem Manuals

**Files:**
- Modify: `docs/dnd-design.md`
- Modify: `docs/item-system.md`
- Modify: `docs/coin-system.md`
- Modify: `docs/fish-system.md`
- Modify: `docs/affection-system.md`
- Modify: `docs/wish-automation.md`

- [x] **Step 1: Rewrite DND and item docs**

Document current DND commands, callbacks, D1 tables, item equipment, weapon damage, magic casting, attacks, rests, level up, and GM management.

- [x] **Step 2: Rewrite coin, lottery, fish, and affection docs**

Document active storage, commands, permission sources, and legacy migration notes.

- [x] **Step 3: Rewrite wish automation docs**

Document `/wish`, API endpoints, local digest/executor scripts, environment variables, cron, and safety behavior.

### Task 4: Rewrite Historical And Assistant-Facing Docs

**Files:**
- Modify: `.deepseek/instructions.md`
- Modify: `docs/superpowers/specs/2026-06-09-fish-kv-design.md`
- Modify: `docs/superpowers/specs/2026-06-09-wish-automation-design.md`
- Modify: `docs/superpowers/plans/2026-06-09-fish-kv.md`
- Modify: `docs/superpowers/plans/2026-06-09-wish-automation.md`
- Modify: `docs/superpowers/specs/2026-06-10-project-docs-rewrite-design.md`
- Modify: `docs/superpowers/plans/2026-06-10-project-docs-rewrite.md`

- [x] **Step 1: Replace `.deepseek/instructions.md`**

Write current project structure and agent guidance instead of the stale auto-generated tree.

- [x] **Step 2: Normalize historical specs/plans**

Rewrite historical docs as implementation records with current status and links to the canonical manuals.

### Task 5: Verify Documentation Rewrite

**Files:**
- Read: `README.md`
- Read: `docs/**/*.md`
- Read: `.deepseek/instructions.md`

- [x] **Step 1: Scan for stale markers**

Run a repository documentation scan for placeholder words and old counts/labels across `README.md`, `docs/`, and `.deepseek/instructions.md`.

Expected: no stale documentation hits except intentional historical references if clearly marked.

- [x] **Step 2: Run unit tests**

Run:

```bash
npm test -- --run
```

Expected: all unit tests pass.

- [x] **Step 3: Run type check and audit for status**

Run:

```bash
npx tsc --noEmit
npm audit --audit-level=low
```

Expected: record current failures or passes in the final report.
