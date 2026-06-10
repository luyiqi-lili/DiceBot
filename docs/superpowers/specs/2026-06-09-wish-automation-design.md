# Wish Automation Implementation Record

Chinese translation: [../../zh-CN/superpowers/specs/2026-06-09-wish-automation-design.md](../../zh-CN/superpowers/specs/2026-06-09-wish-automation-design.md)

## Original Intent

Add a `/wish` workflow where users submit ideas, a local script summarizes pending wishes, an admin approves items in Telegram, and a local executor lets Codex CLI implement approved tasks.

## Current Implementation

Implemented components:

- `src/commands/wish.ts`: `/wish` submission and admin reply approval.
- `src/lib/wishCore.ts`: D1 persistence for wishes, summaries, and tasks.
- `src/lib/wishApi.ts`: authenticated Worker API endpoints.
- `scripts/wish-digest.sh`: local digest generator.
- `scripts/wish-execute.sh`: local task executor.
- `scripts/wish-local.sh`: setup and cron management.
- `scripts/wish-net.sh`: shared network retry helpers.

## Current API

- `GET /api/wish/pending?limit=50`
- `POST /api/wish/summaries`
- `POST /api/wish/approved/claim`
- `POST /api/wish/tasks/:id/status`

Authentication is effective only when `EXTERNAL_API_KEY` is configured.

## Current Safety Model

- Only admin user `8080375150` can approve digest items.
- Codex CLI execution happens outside the Worker.
- The executor refuses dirty worktrees before claiming a task.
- Failed execution can clean generated changes and report failure.

## Canonical Documentation

Use [../../wish-automation.md](../../wish-automation.md) for the maintained wish automation manual.
