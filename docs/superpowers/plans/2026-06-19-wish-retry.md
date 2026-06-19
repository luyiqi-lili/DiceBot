# Wish Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for implementation. When tasks have disjoint file ownership and no dependencies, dispatch them in parallel waves; use `superpowers:executing-plans` only when subagents are unavailable or sequential execution is required. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make local wish execution retry both transient API claim failures and failed Codex execution attempts.

**Architecture:** Reuse the existing shell retry helper for network calls, and keep Codex retries inside `scripts/wish-execute.sh` so the same claimed task can be retried safely. Each failed Codex attempt cleans generated changes before the next attempt.

**Tech Stack:** Bash, git, jq, curl stubs in shell tests.

---

### Task 1: Add Failing Shell Test For Claim And Codex Retries

**Files:**
- Modify: `test/scripts/wish-execute-cleanup.sh`

- [x] **Step 1: Write the failing test**

Update the existing curl stub so `/api/wish/approved/claim` fails once with exit 28 before returning a task, and update the Codex stub so the first attempt writes tracked and untracked changes then fails while the second attempt writes the final change and succeeds.

Expected assertions:

- claim count is `2`
- codex count is `2`
- final tracked file contains only the successful retry content
- generated failed-attempt file is absent
- status update still requeues only when all execution attempts fail in the existing failure path

- [x] **Step 2: Run the script test to verify it fails**

Run:

```bash
bash test/scripts/wish-execute-cleanup.sh
```

Expected: FAIL because `scripts/wish-execute.sh` uses `curl_once` for claim and has no Codex retry loop.

### Task 2: Implement Executor Retries

**Files:**
- Modify: `scripts/wish-execute.sh`

- [x] **Step 1: Retry claim network request**

Change:

```bash
CLAIM_JSON=$(curl_once -X POST \
```

to:

```bash
CLAIM_JSON=$(curl_retry -X POST \
```

- [x] **Step 2: Add configurable execution retry settings**

Near `VERIFY_CMD`, add:

```bash
EXEC_ATTEMPTS="${WISH_EXEC_ATTEMPTS:-3}"
EXEC_RETRY_DELAY="${WISH_EXEC_RETRY_DELAY:-30}"
```

- [x] **Step 3: Extract worktree cleanup helper**

Add a helper that can be used between failed Codex attempts:

```bash
reset_generated_changes() {
	if has_worktree_changes; then
		git reset --hard HEAD >/dev/null 2>&1 || true
		git clean -fd >/dev/null 2>&1 || true
	fi
}
```

Use it from `cleanup_failed_changes`.

- [x] **Step 4: Wrap Codex execution in a retry loop**

Replace the single `codex exec` call with a loop that retries until success or `EXEC_ATTEMPTS` is reached. On each failed attempt, clean generated changes. Between attempts, print a retry message and sleep `EXEC_RETRY_DELAY`.

- [x] **Step 5: Run the shell test to verify it passes**

Run:

```bash
bash test/scripts/wish-execute-cleanup.sh
```

Expected: PASS.

### Task 3: Update Docs And Full Verification

**Files:**
- Modify: `docs/wish-automation.md`
- Modify: `docs/zh-CN/wish-automation.md`

- [x] **Step 1: Document retry knobs**

Add `WISH_EXEC_ATTEMPTS` and `WISH_EXEC_RETRY_DELAY` to local environment docs. Mention that API calls use retry helpers and Codex execution retries clean generated changes between attempts.

- [x] **Step 2: Run targeted verification**

Run:

```bash
bash test/scripts/wish-execute-cleanup.sh
bash test/scripts/wish-digest-format.sh
npm test -- test/lib/wishCore.spec.ts test/commands/wish.spec.ts test/lib/wishApi.spec.ts
git diff --check
```

Expected: all commands exit 0.
