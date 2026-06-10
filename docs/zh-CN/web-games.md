# Web 游戏

English source: [../web-games.md](../web-games.md)

Web 路由在 Telegram webhook 解析之前处理，入口是 `src/web/router.ts`。

## 路由

| Route | Method | Handler |
|-------|--------|---------|
| `/web/hello` | GET | `handleHelloWeb` |
| `/web/hello/submit-score` | POST | `handleScoreSubmit` |
| `/web/fish` | GET | `handleFishWeb` |
| `/web/fish/data` | GET | `handleFishData` |
| `/web/fish/cast` | POST | `handleFishCast` |
| `/web/fish/pull` | POST | `handleFishPull` |
| `/web/fish/submit-score` | POST | `handleFishScore` |

## Telegram 游戏启动

`src/index.ts` 在 JSON callback 分发前处理 `callback_query.game_short_name`。

| Game short name | URL |
|-----------------|-----|
| `hello` | `/web/hello` |
| `fish` | `/web/fish` |

机器人会用包含 Telegram 用户/游戏上下文的 URL 回答 callback。

## 分数提交

`src/web/score.ts` 提供 `handleGameScore()`，hello 和 fish 共用。请求 JSON 包含：

- `score`
- `user_id`
- `inline_message_id` 或 `chat_id` + `message_id`
- 可选 `game`

它通过 `callTelegramApi()` 调用 Telegram `setGameScore`。

安全注意：inline 分数处理当前会记录 `env.TOKEN`，生产日志应先删除或脱敏。

## Fish Web Game

`src/web/fish/index.ts` 实现 Web 钓鱼游戏。它与 Telegram `/fish` 命令流程分离，但共用同一个 Worker 和 Telegram 分数基础设施。
