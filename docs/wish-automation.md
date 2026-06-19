# Wish Automation

Chinese translation: [zh-CN/wish-automation.md](zh-CN/wish-automation.md)

Wish automation lets group users submit feature ideas, lets an admin approve summarized candidates, and lets local scripts execute approved tasks outside Cloudflare Workers.

## Runtime Boundaries

Cloudflare Worker responsibilities:

- accept `/wish <text>`
- store wishes in D1
- approve digest items when admin replies with item numbers
- expose authenticated `/api/wish/*` endpoints

Local machine responsibilities:

- run `scripts/wish-digest.sh`
- run `scripts/wish-execute.sh`
- run Codex CLI
- verify, commit, push, and report results

Codex does not run inside the Worker.

## Telegram Command

`/wish <idea>`:

- requires D1
- rejects vague or empty wishes
- stores a pending wish
- replies with the stored wish id

Admin approval:

- admin id: `8080375150`
- admin replies to a digest message with item numbers such as `1` or `1 3`
- optional prefix `做` is accepted by parser
- approved candidates become executable tasks

## D1 Data

Core tables are managed by `src/lib/wishCore.ts`:

- `wishes`
- `wish_summaries`
- `wish_tasks`

Statuses include:

- `pending`
- `summarized`
- `approved`
- `in_progress`
- `done`
- `failed`

## API Endpoints

Handled by `src/lib/wishApi.ts` under `/api/wish`.

| Endpoint | Method | Behavior |
|----------|--------|----------|
| `/api/wish/pending?limit=50` | GET | list pending wishes |
| `/api/wish/summaries` | POST | store a digest summary and tasks |
| `/api/wish/approved/claim` | POST | claim one approved task |
| `/api/wish/tasks/:id/status` | POST | update task status |

API authentication is enforced only when `EXTERNAL_API_KEY` is configured in the Worker environment.

## Local Scripts

| Script | Purpose |
|--------|---------|
| `scripts/wish-local.sh` | setup, install/uninstall cron, status, manual digest/execute |
| `scripts/wish-digest.sh` | fetch pending wishes, ask Codex to summarize, send Telegram digest, store summary |
| `scripts/wish-execute.sh` | claim one approved task, run Codex, verify, commit, push, report |
| `scripts/wish-net.sh` | shared curl retry helpers |

## Local Environment

`scripts/wish-local.sh setup` writes `.wish-local.env`.

Required for digest:

- `WORKER_BASE_URL`
- `EXTERNAL_API_KEY`
- `BOT_TOKEN`
- `CHAT_ID`
- `TOPIC_ID`

Required for executor:

- `WORKER_BASE_URL`
- `EXTERNAL_API_KEY`

Optional executor reporting:

- `BOT_TOKEN`
- `CHAT_ID`
- `TOPIC_ID`

Verification command:

- `WISH_VERIFY_CMD`, defaulting to wish-related tests.

Retry controls:

- `WISH_RETRY_ATTEMPTS`, `WISH_RETRY_DELAY`, `WISH_CONNECT_TIMEOUT`, and `WISH_MAX_TIME` tune API request retries.
- `WISH_EXEC_ATTEMPTS` controls Codex execution attempts, defaulting to `3`.
- `WISH_EXEC_RETRY_DELAY` controls the delay between failed Codex execution attempts, defaulting to `30` seconds.

## Cron Examples

Digest every 10 minutes:

```cron
*/10 * * * * cd /home/linux/dicebot/telegram-bot && scripts/wish-digest.sh >> /tmp/wish-digest.log 2>&1
```

Executor every 5 minutes:

```cron
*/5 * * * * cd /home/linux/dicebot/telegram-bot && scripts/wish-execute.sh >> /tmp/wish-execute.log 2>&1
```

Daily digest:

```cron
0 9 * * * cd /home/linux/dicebot/telegram-bot && scripts/wish-digest.sh >> /tmp/wish-digest.log 2>&1
```

## Safety Behavior

`scripts/wish-execute.sh`:

- refuses to run if the working tree is dirty
- claims one task per run
- retries transient API failures, including task claim and status updates
- retries failed Codex execution attempts for the same claimed task
- cleans generated changes between failed Codex execution attempts
- cleans generated changes after failed execution
- reports failed verification as task failure
- pushes only after successful execution and verification

## Tests

Relevant tests:

- `test/commands/wish.spec.ts`
- `test/lib/wishCore.spec.ts`
- `test/lib/wishApi.spec.ts`
- `test/scripts/wish-digest-format.sh`
- `test/scripts/wish-execute-cleanup.sh`
- `test/scripts/wish-execute-retry.sh`
