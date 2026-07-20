# DiceBot Telegram Bot

Chinese translation: [README.zh-CN.md](README.zh-CN.md)

DiceBot is a Cloudflare Workers Telegram bot for group utility, games, lightweight DND play, and small web games. The runtime is TypeScript on Cloudflare Workers with KV, Durable Objects, D1, and the Telegram Bot API. Chat features have no external AI dependency; the controlled self-evolution foundation accesses GitHub and can validate donated model credentials.

This README is the entry point. Detailed manuals live in `docs/`.

## Current Status

- Runtime: Cloudflare Workers.
- Main entry: `src/index.ts`.
- Command dispatch: static `import()` switch in `src/index.ts`.
- Route metadata: `src/routes.ts`, mainly for `deleteMsg`.
- Unit tests: `npm test -- --run`.
- Type check: `npx tsc --noEmit`.
- Dependency audit: `npm audit --audit-level=low`.

Known operational risks:

- `/api/*` authentication only runs when `EXTERNAL_API_KEY` is configured. If the secret is absent, API routes are not blocked by key comparison.
- `src/web/score.ts` logs `env.TOKEN` in inline score submission. Remove or redact before treating logs as safe.
- `routes.ts` does not list every command/callback that `src/index.ts` can dispatch. Runtime behavior follows `src/index.ts`.

## Request Flow

```text
HTTP request
  |
  +-- /web/*  -> src/web/router.ts
  |
  +-- /api/*  -> handleExternalAPI()
  |              /api/coin/* -> CoinDO HTTP facade
  |              /api/health
  |
  +-- non-POST -> "I am alive"
  |
  +-- POST Telegram update
         |
         +-- TgMessage.parseUpdate()
         +-- topic_edited       -> topicEditHandler
         +-- callback_query     -> game launch, delete_message, loadCallback()
         +-- command message    -> loadCommand()
         +-- non-command text   -> *skill/*weapon/*spell, backup
```

Cloudflare requires statically analyzable module imports. `src/index.ts` therefore uses explicit switch-case `import()` calls even though `src/routes.ts` also exists.

## Command Surface

Main command groups:

- Dice and party games: `/roll`, `/r`, `/rd`, `/rh`, `/groll`, `/21`, `/duel`.
- Economy: `/coin`, `/lottery`, `/congrats`, `/恭喜发财`.
- Utility: `/help`, `/whoami`, `/book`, `/news`, `/rule`, `/echo`, `/em`, `/me`, `/emote`, `/like`, `/act`, `/wish`, `/issue`.
- Access control: the bot responds in any group it is added to (no chat allowlist; data isolated per `chat_id`). Group owners implicitly hold every admin permission and can grant/revoke per-user permissions with `/perm` (stored in D1 `permission_grants`). See [docs/commands.md](docs/commands.md#access-control-and-permissions).
- Fish: `/f`, `/f check`, `/f add`, `/f list`, `/f remove`.
- Affection: `/rose`, `/rose send`, `/rose check`.
- DND: `/dnd`, `/new`, `/char`, `/skill`, `/skills`, `/rest`, `/gm`, `/item`, `/attack`, `/atk`, `/cast`, `/lvup`, `/level`.
- Star shortcuts: messages starting with `*` dispatch to weapon attack, magic cast, or skill check depending on character state and D1 skill data.

Full command reference: [docs/commands.md](docs/commands.md).

## Self-Evolution Foundation

Stages 1–2 provide a controlled foundation: the hourly cron evaluates open PRs and, only when no suitable community PR exists, selects a low-risk maintainer-labelled `bot:ready` issue. Fail-closed `/wish` and `/issue` commands can create public requests. Credential intake canonicalizes the provider and consent policy before AES-GCM encryption; Gemini credentials can be checked through the read-only model list. The Worker does not edit source, comment, approve, merge, pay bills, or change Cloudflare plans.

See the [self-evolution roadmap](docs/self-evolution-roadmap.md) for scope and later stages.

## Storage

Cloudflare bindings are defined in `src/index.ts` and `wrangler.jsonc`.

Active storage:

- KV: `NEWS_STORE`, `TOPIC_KV`, `BOOK_STORE`, `FISHING_RECORD_KV`, `FISH_KV`, `TGBOTCOUNT`, `AFFECTION_KV`, `COIN_KV`, `ITEM_STORE`.
- Durable Objects: `COIN_DO`, `LOTTERY_DO`.
- D1: `DB` in production, used by DND, item, affection, backup, usage, rules, permission grants, topic access, and message history features.

Legacy bindings remain for compatibility:

- `ITEM_STORE` is the old KV item store. Current `/item` uses D1.
- `COIN_KV` is an older coin cache. Current balance mutations use `CoinDO`.
- `AFFECTION_KV` remains as fallback/migration source for affection records.

Storage manual: [docs/storage.md](docs/storage.md).

## Repository Layout

```text
src/
  index.ts                  Worker entry, HTTP routing, Telegram event dispatch
  routes.ts                 Command metadata used after dispatch
  commands/                 Telegram command handlers
  lib/                      Domain services and Telegram helpers
  data/                     Static seeds and allowlists
  durableObjects/           CoinDO and LotteryDO
  cron/                     Scheduled coin check
  web/                      Telegram game pages and score APIs
scripts/                    Deploy notification
test/                       Vitest unit/e2e/script tests
docs/                       Project manuals and implementation records
wrangler.jsonc              Cloudflare env bindings and deployment config
```

Architecture manual: [docs/architecture.md](docs/architecture.md).

## Setup

Install dependencies:

```bash
npm install
```

Use Node.js 22 or newer. CI currently runs on Node.js 24.x.

Generate Worker types when bindings change:

```bash
npm run cf-typegen
```

Run local Worker:

```bash
npm run dev
```

Useful local command:

```bash
npm test -- --run
```

Environment and secret manual: [docs/environment.md](docs/environment.md).

## Testing And Audit

Commands:

```bash
npm test -- --run
npx tsc --noEmit
npm audit --audit-level=low
npm run test:e2e
```

E2E tests require real external variables, including `WORKER_BASE_URL` and `EXTERNAL_API_KEY`.

Testing manual: [docs/testing.md](docs/testing.md).

## Deployment

Configured environments:

- `dev`: Worker `telegram-bot-dev`, bot username `lili_DevDiceBot`, D1 binding `dicebot-dev-db`.
- `prod`: Worker `telegram-bot`, bot username `lili_DiceBot`, D1 binding `DB`, cron schedule `59 * * * *`.

Scripts:

- `npm run deploy` runs `wrangler deploy`.
- `scripts/notify-deploy.sh` sends deployment notifications, but currently contains literal Telegram notification configuration and should be moved to secrets before being treated as safe.

## Documentation Index

- [Architecture](docs/architecture.md)
- [Commands](docs/commands.md)
- [Environment and deployment](docs/environment.md)
- [Storage](docs/storage.md)
- [Testing and audit](docs/testing.md)
- [Self-evolution roadmap](docs/self-evolution-roadmap.md)
- [Web games](docs/web-games.md)
- [DND system](docs/dnd-design.md)
- [Item system](docs/item-system.md)
- [Coin and lottery](docs/coin-system.md)
- [Fish system](docs/fish-system.md)
- [Affection system](docs/affection-system.md)
- [Lily and Raphael background story](docs/lily-raphael-background.md)
- [Lich rulebook](docs/lich-rulebook.md)

## Maintenance Rules

- When adding a command, update `src/index.ts` first, then `src/routes.ts` metadata if deletion behavior matters, then [docs/commands.md](docs/commands.md).
- When adding storage, update `src/index.ts`, `wrangler.jsonc`, [docs/environment.md](docs/environment.md), and [docs/storage.md](docs/storage.md).
- When changing D1 tables or Durable Object endpoints, update the subsystem doc and tests in the same change.
- Do not document planned behavior as active behavior. Put future work in a clearly marked section.
