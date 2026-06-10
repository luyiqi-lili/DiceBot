# Bilingual Documentation Implementation Plan

Chinese translation: [../../zh-CN/superpowers/plans/2026-06-10-bilingual-docs.md](../../zh-CN/superpowers/plans/2026-06-10-bilingual-docs.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Chinese mirror documentation while keeping the current English documentation as the canonical source.

**Architecture:** Keep English files in their current locations. Add `README.zh-CN.md` and `docs/zh-CN/` mirror files, including `docs/zh-CN/superpowers/` for implementation records. Add language-switch links between paired files.

**Tech Stack:** Markdown documentation in a TypeScript Cloudflare Workers Telegram bot repository.

---

### Task 1: Add Language Switch Links

**Files:**
- Modify: `README.md`
- Modify: `docs/*.md`
- Modify: `docs/superpowers/**/*.md`

- [x] **Step 1: Add links from English docs to Chinese mirrors**

Add `Chinese translation: ...` near the top of each English documentation file.

- [x] **Step 2: Keep English content canonical**

Do not rewrite English content except for language links.

### Task 2: Create Chinese Mirror

**Files:**
- Create: `README.zh-CN.md`
- Create: `docs/zh-CN/*.md`
- Create: `docs/zh-CN/superpowers/specs/*.md`
- Create: `docs/zh-CN/superpowers/plans/*.md`

- [x] **Step 1: Translate entry and core manuals**

Create Chinese translations for README, architecture, commands, environment, storage, testing, and web games.

- [x] **Step 2: Translate subsystem manuals**

Create Chinese translations for DND, item, coin, fish, affection, and wish automation.

- [x] **Step 3: Translate implementation records**

Create Chinese translations for Superpowers specs and plans.

### Task 3: Verify

**Files:**
- Read: `README.md`
- Read: `README.zh-CN.md`
- Read: `docs/**/*.md`

- [x] **Step 1: Check mirror files**

Run a shell check that every English doc has its matching Chinese file.

- [x] **Step 2: Check stale text**

Run the existing stale marker scan.

- [x] **Step 3: Run unit tests**

Run:

```bash
npm test -- --run
```

Expected: all unit tests pass.
