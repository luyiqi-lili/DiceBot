# Wish Automation Design

## Goal

Add a `/wish` workflow where users submit feature ideas, the system summarizes pending ideas into actionable candidates, and admin approval from Telegram can trigger Codex CLI implementation and deployment.

## Scope

This feature has two parts:

1. Bot-side collection and approval state.
2. A local scheduled automation that reads approved work and runs Codex CLI.

The bot records wishes and approvals. It does not run Codex CLI inside Cloudflare Workers.

## Users

- Any allowed Telegram user can submit a wish with `/wish <idea>`.
- Only Telegram user `8080375150` can approve summarized items by replying to the summary message.

## Storage

Use D1 with two tables:

- `wishes`
  - `id`
  - `chat_id`
  - `thread_id`
  - `user_id`
  - `first_name`
  - `body`
  - `status`: `pending`, `summarized`, `approved`, `in_progress`, `done`, `failed`, `rejected`
  - `summary_id`
  - `created_at`
  - `updated_at`

- `wish_summaries`
  - `id`
  - `message_id`
  - `chat_id`
  - `thread_id`
  - `body`
  - `items_json`
  - `created_at`

- `wish_tasks`
  - `id`
  - `summary_id`
  - `item_number`
  - `title`
  - `body`
  - `wish_ids_json`
  - `status`: `summarized`, `approved`, `in_progress`, `done`, `failed`
  - `approved_by`
  - `approved_at`
  - `result_text`
  - `created_at`
  - `updated_at`

`items_json` stores the displayed numbered candidates. `wish_tasks` stores the executable candidates so a reply like `1` can map to a durable approved task.

## Commands

### `/wish <idea>`

- Requires non-empty idea text.
- Ignores obviously meaningless submissions, such as blank text, very short noise, repeated punctuation, or common placeholder words.
- Writes a pending wish to D1.
- Replies with the stored wish id.

### Admin Reply Approval

When user `8080375150` replies to a bot summary message with a number or a space-separated list of numbers:

- The bot loads the matching `wish_summaries` row by replied message id.
- The selected candidate items are marked `approved`.
- The bot replies with a confirmation.

Non-admin replies are ignored.

## Digest Cadence

During debugging, run the digest every 10 minutes with cron syntax:

```cron
*/10 * * * *
```

Later this can be changed to a daily schedule without changing the data model.

## Digest Automation

A local script runs on the server or development machine:

1. Fetch pending wishes from the Worker API or directly from D1.
2. Ask Codex CLI to convert raw wishes into 1-3 actionable candidates.
3. Send a Telegram summary message to the configured group/topic.
4. Store the Telegram message id and candidate mapping in `wish_summaries`.
5. Mark included wishes as `summarized`.

The digest prompt must ask for small, testable feature points, not broad product visions.

## Execution Automation

A second local script runs periodically:

1. Read approved candidate items.
2. Process one item at a time.
3. Pull latest `main`.
4. Run Codex CLI in the repo with workspace write access and a prompt scoped to the approved item.
5. Run focused tests and `git diff --check`.
6. If verification passes, commit and push to `main`.
7. GitHub Actions deploys the pushed commit.
8. Send Telegram status: done or failed.

If verification fails, do not push. Mark the candidate as `failed` and send the failure summary to Telegram.

## Safety Rules

- Only approved candidate items from user `8080375150` can trigger Codex execution.
- Codex execution happens outside Cloudflare Workers.
- The execution script must process one approved item per run.
- Failed tests stop push/deploy.
- The Codex prompt must include the original summary item and forbid unrelated refactors.
- Secrets must not be exposed to `codex exec` unless required for that exact invocation.

## Initial Implementation Boundaries

The first implementation should include:

- `/wish <idea>` storage.
- Summary approval parsing from Telegram replies.
- A digest script scheduled every 10 minutes.
- An execution script that can pick up approved work.

The first version does not need a web UI.
