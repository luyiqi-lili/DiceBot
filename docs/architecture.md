# Architecture

Chinese translation: [zh-CN/architecture.md](zh-CN/architecture.md)

This document describes the current runtime architecture from the code in `src/index.ts`.

## Runtime

DiceBot runs as a Cloudflare Worker. The Worker exports:

- default `scheduled()` and `fetch()` handlers
- `CoinDO`
- `LotteryDO`

`scheduled()` independently starts `runCoinCheck(env)` and `runSelfEvolutionReview(env)`. The latter scans PRs, triages at most one unready Issue with a donated Ollama Cloud large model or Workers AI fallback through AI Gateway, ranks ready issues, and performs at most one consented credential health check.

`fetch()` handles web pages, external APIs, Telegram webhook updates, and health checks.

## HTTP Routing

`src/index.ts` processes requests in this order:

1. Paths starting with `/web/` are passed to `handleWebRequest()` in `src/web/router.ts`.
2. Paths starting with `/api/` are passed to `handleExternalAPI()`.
3. Non-POST requests return `I am alive`.
4. POST requests are parsed as Telegram updates with `TgMessage.parseUpdate()`.
5. The parsed update type determines the handler; stored group data is isolated by `chat_id`.

## External API

`handleExternalAPI()` supports:

| Path | Handler |
|------|---------|
| `/api/coin/*` | Forwarded to `CoinDO` after stripping `/api/coin` |
| `/api/lottery/*` | Forwarded to `LotteryDO` after stripping `/api/lottery` |
| `/api/donations/api-keys` | Accepts API-key donations with a dedicated bearer token and stores keys in Cloudflare AI Gateway Secrets Store |
| `GET /api/donations/api-keys`, `POST .../:id/validate`, `POST .../:id/status` | Donation-admin bearer token; lists metadata, validates, or changes lifecycle without returning secrets |
| `POST /api/donations/api-keys/:id/migrate` | Moves one legacy D1-encrypted key into Gateway Secrets Store |
| `/api/ai/models`, `/api/ai/route` | Protected non-secret catalog and routing recommendation |
| `/api/evolution/candidate` | Protected read-only latest issue candidate |
| `/api/evolution/github-auth` | Protected, read-only GitHub token capability diagnostic |
| `/api/health` | JSON status response |

Regular `/api/*` routes validate `EXTERNAL_API_KEY` and fail closed when it is absent. Donation intake separately validates `DONATION_INTAKE_KEY`. List, validate, and status operations require `DONATION_ADMIN_KEY`; legacy migration additionally accepts the intake key or AI Gateway management token. Production currently leaves the donation-admin API disabled by not configuring `DONATION_ADMIN_KEY`; Telegram donation, status, quota, and donor-owned revocation do not depend on that admin key.

## AI Gateway Routing

AI-enabled user and scheduled paths never call a provider directly:

```text
/trans
  -> donated Gemini aliases
  -> donated Ollama Cloud aliases
  -> Workers AI 3B

Issue gate
  -> donated Ollama Cloud aliases
  -> Workers AI 70B
```

All arrows are AI Gateway requests. Multiple healthy `shared_inference` aliases rotate through D1-backed cursors. Ollama Cloud is registered as an account-level custom provider and uses its OpenAI-compatible `/v1/models` and `/v1/chat/completions` endpoints through the Gateway.

New donated key values live only in Cloudflare AI Gateway Secrets Store. D1 retains the fingerprint, Gateway alias and secret/store ids, consent policy, health, cost class, and cached model catalog. `validation_only` credentials never enter shared routing. Paid credentials may be catalogued but are not automatically selected. See [AI routing and donated credentials](ai-routing.md).

## Telegram Update Dispatch

Update types:

| Type | Behavior |
|------|----------|
| `topic_edited` | `src/commands/topicEditHandler.ts` |
| `callback_query` | game launch, delete message, or `loadCallback()` |
| `pre_checkout_query` | validates a pending Stars intent and answers within Telegram's checkout deadline |
| `message.successful_payment` | idempotently records the Telegram charge id and sends a receipt |
| `message` command | `loadCommand()` |
| `message` non-command | star shortcut, then D1 backup |

Payment updates are handled before ordinary message parsing. Non-command text is backed up through `handleBackup()` after star handling. `/wish` and `/issue` are regular commands that create GitHub Issues only when the fail-closed write switch is enabled.

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

Production `wrangler.jsonc` schedules `59 * * * *`. Before candidate selection, the review statically filters unready Issues and may add `bot:ready` to at most one. That write is allowed only when an Ollama Cloud or Workers AI large model returns a low-risk decision at or above the configured confidence threshold; both routes go through AI Gateway. Each decision is stored in `ai_issue_triage_runs`; unchanged rejected Issues are not repeatedly reviewed. The Worker still does not edit source, comment, create branches, approve PRs, or merge. See the [self-evolution roadmap](self-evolution-roadmap.md).
