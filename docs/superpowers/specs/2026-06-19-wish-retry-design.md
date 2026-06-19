# Wish Retry Design

## Goal

Improve local wish automation reliability when the local network or Codex execution is unstable.

## Scope

This change applies to local scripts only. It does not change Worker APIs, D1 schema, Telegram command behavior, or deployment behavior.

## Current Behavior

`scripts/wish-net.sh` already provides `curl_retry`, and some executor status updates use it. However, `scripts/wish-execute.sh` claims tasks with `curl_once`, so a transient network timeout can abort before any work starts. The core `codex exec` step also runs only once; when it fails or times out, the task is requeued for a future cron run.

## Design

Use `curl_retry` for claiming approved tasks so transient API failures retry before the executor exits.

Wrap `codex exec` in a retry loop controlled by:

- `WISH_EXEC_ATTEMPTS`, default `3`
- `WISH_EXEC_RETRY_DELAY`, default `30`

After each failed Codex attempt, clean generated worktree changes before retrying the same claimed task. If all attempts fail, requeue the task as `approved` with the existing failure message. Verification failures, diff-check failures, empty diffs, commit, and push remain single-shot operations because those indicate deterministic local state rather than transient execution startup failure.

## Safety

The executor still refuses to start with a dirty worktree. Cleanup remains limited to generated changes after a task has been claimed. The task is reported as `done` only after verification, commit, and push succeed.

## Tests

Add shell test coverage for:

- claim API retries after a transient timeout
- Codex execution retries after a failed first attempt
- failed-attempt cleanup before the successful retry

Keep existing cleanup/status retry coverage intact.
