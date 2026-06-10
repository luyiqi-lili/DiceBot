# Web Games

Chinese translation: [zh-CN/web-games.md](zh-CN/web-games.md)

Web routes are handled before Telegram webhook parsing. See `src/web/router.ts`.

## Routes

| Route | Method | Handler |
|-------|--------|---------|
| `/web/hello` | GET | `handleHelloWeb` |
| `/web/hello/submit-score` | POST | `handleScoreSubmit` |
| `/web/fish` | GET | `handleFishWeb` |
| `/web/fish/data` | GET | `handleFishData` |
| `/web/fish/cast` | POST | `handleFishCast` |
| `/web/fish/pull` | POST | `handleFishPull` |
| `/web/fish/submit-score` | POST | `handleFishScore` |

## Telegram Game Launch

In `src/index.ts`, `callback_query.game_short_name` is handled before JSON callback dispatch.

| Game short name | URL opened |
|-----------------|------------|
| `hello` | `/web/hello` |
| `fish` | `/web/fish` |

The bot answers the callback with a URL containing Telegram user/game context.

## Score Submission

`src/web/score.ts` provides `handleGameScore()` used by hello and fish. It accepts JSON containing:

- `score`
- `user_id`
- either `inline_message_id` or `chat_id` plus `message_id`
- optional `game`

It calls Telegram `setGameScore` through `callTelegramApi()`.

Security note: inline score handling currently logs `env.TOKEN`. Remove or redact this log before treating Worker logs as safe.

## Fish Web Game

`src/web/fish/index.ts` owns the web fish game behavior. It is separate from the Telegram `/fish` command flow but shares the same Worker and Telegram score infrastructure.
