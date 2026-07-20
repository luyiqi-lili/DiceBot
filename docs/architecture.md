# Architecture

Chinese translation: [zh-CN/architecture.md](zh-CN/architecture.md)

This document describes the current runtime architecture from the code in `src/index.ts`.

## Runtime

DiceBot runs as a Cloudflare Worker. The Worker exports:

- default `scheduled()` and `fetch()` handlers
- `CoinDO`
- `LotteryDO`

`scheduled()` independently starts `runCoinCheck(env)` from `src/cron/cron.ts` and the read-only PR scan in `src/lib/githubPrMonitor.ts`.

`fetch()` handles web pages, external APIs, Telegram webhook updates, and health checks.

## HTTP Routing

`src/index.ts` processes requests in this order:

1. Paths starting with `/web/` are passed to `handleWebRequest()` in `src/web/router.ts`.
2. Paths starting with `/api/` are passed to `handleExternalAPI()`.
3. Non-POST requests return `I am alive`.
4. POST requests are parsed as Telegram updates with `TgMessage.parseUpdate()`.
5. Parsed updates are ignored unless `chatId` is in `ALLOWED_CHAT_IDS`.
6. The parsed update type determines the handler.

## External API

`handleExternalAPI()` supports:

| Path | Handler |
|------|---------|
| `/api/coin/*` | Forwarded to `CoinDO` after stripping `/api/coin` |
| `/api/lottery/*` | Forwarded to `LotteryDO` after stripping `/api/lottery` |
| `/api/donations/api-keys` | Accepts encrypted API-key donations using a dedicated bearer token |
| `/api/health` | JSON status response |

Regular `/api/*` routes validate `EXTERNAL_API_KEY`. Donation intake separately validates `DONATION_INTAKE_KEY`, which grants no access to other admin APIs.

## Telegram Update Dispatch

Update types:

| Type | Behavior |
|------|----------|
| `inline_query` | `src/commands/aiAssistInline.ts` |
| `topic_edited` | `src/commands/topicEditHandler.ts` |
| `callback_query` | game launch, delete message, or `loadCallback()` |
| `message` command | `loadCommand()` |
| `message` non-command | wish approval, star shortcut, then D1 backup |

Non-command text is backed up through `handleBackup()` after wish/star handling.

## Static Imports

Cloudflare Workers build analysis requires literal dynamic import paths. For that reason, runtime command and callback dispatch lives in explicit switch statements in `src/index.ts`:

- `loadCommand(cmd)`
- `loadCallback(type)`

`src/routes.ts` is still used for command metadata, especially whether the triggering command message should be deleted after handling.

Maintenance note: runtime command availability is determined by `src/index.ts`; `src/routes.ts` can drift and currently does not list every DND command/callback.

## Command Deletion

After a command handler completes, `src/index.ts` reads `COMMAND_ROUTES[cmd]`.

- Missing route metadata means the command message is deleted after a delay.
- `deleteMsg: false` keeps the command message.

Examples with `deleteMsg: false` include congratulations aliases and `/gm`.

## Callback Handling

Special callback handling:

- `game_short_name=hello` opens `/web/hello`.
- `game_short_name=fish` opens `/web/fish`.
- callback data `{ "type": "delete_message" }` deletes the inline message immediately.

Registered callback types in `loadCallback()`:

- `congrats`
- `21`
- `duel`
- `fish`
- `groll`
- `lottery`
- `dnd_reroll`
- `dnd_confirm`
- `item_action`
- `lu`

## Star Shortcut

For non-command messages starting with `*` but not `**`, `src/index.ts` dispatches in this order:

1. Equipped weapon attack if the user has a matching equipped weapon or sends `*攻击`.
2. Magic cast if the named D1 skill has `damage` or `mana_cost`.
3. Regular DND skill check.

When the message replies to another user, target information is passed to attack/cast/skill handlers.

## Web Routes

See [web-games.md](web-games.md).

Top-level web routes:

- `/web/hello`
- `/web/hello/submit-score`
- `/web/fish`
- `/web/fish/data`
- `/web/fish/cast`
- `/web/fish/pull`
- `/web/fish/submit-score`

## Scheduled Work

Production `wrangler.jsonc` schedules `59 * * * *`, which invokes the treasury check and read-only GitHub PR scan. The scan stores D1 snapshots and deterministic risk signals but never comments, approves, or merges. See the [self-evolution roadmap](self-evolution-roadmap.md).

Wish digest/execution automation is not a Worker cron. It is local cron managed by `scripts/wish-local.sh`.
