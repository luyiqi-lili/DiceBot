# 架构

English source: [../architecture.md](../architecture.md)

本文按 `src/index.ts` 的当前代码描述运行时架构。

## 运行时

DiceBot 运行为 Cloudflare Worker。Worker 导出：

- default `scheduled()` 和 `fetch()` handler
- `CoinDO`
- `LotteryDO`

`scheduled()` 独立启动 `runCoinCheck(env)` 与 `runSelfEvolutionReview(env)`；后者扫描 PR、选择 ready Issue，并至多检查一个已授权共享凭据的健康状态。

`fetch()` 处理 Web 页面、外部 API、Telegram webhook update 和健康检查。

## HTTP 路由

`src/index.ts` 按顺序处理请求：

1. `/web/` 开头的路径交给 `src/web/router.ts` 的 `handleWebRequest()`。
2. `/api/` 开头的路径交给 `handleExternalAPI()`。
3. 非 POST 请求返回 `I am alive`。
4. POST 请求按 Telegram update 解析。
5. 根据解析后的 update type 分发；群数据按 `chat_id` 隔离。

## 外部 API

| 路径 | 处理 |
|------|------|
| `/api/coin/*` | 去掉 `/api/coin` 后转发给 `CoinDO` |
| `/api/lottery/*` | 去掉 `/api/lottery` 后转发给 `LotteryDO` |
| `/api/donations/api-keys` | 使用独立 bearer token 接收并加密保存捐赠 API Key |
| `/api/donations/api-keys/:id/validate`、`.../status` | 使用独立管理 token 验证或变更生命周期，不返回秘密 |
| `/api/ai/models`、`/api/ai/route` | 受保护的非敏感目录与模型路由建议 |
| `/api/evolution/candidate` | 受保护地读取最新 Issue 候选 |
| `/api/health` | JSON 状态响应 |

普通 `/api/*` 路由校验 `EXTERNAL_API_KEY`；捐赠接收单独校验 `DONATION_INTAKE_KEY`，凭据管理使用 `DONATION_ADMIN_KEY`。

## Telegram Update 分发

| 类型 | 行为 |
|------|------|
| `topic_edited` | `src/commands/topicEditHandler.ts` |
| `callback_query` | 游戏启动、删除消息或 `loadCallback()` |
| 命令消息 | `loadCommand()` |
| 非命令消息 | 星号快捷方式，然后 D1 备份 |

非命令文本在星号处理后通过 `handleBackup()` 备份。`/wish` 与 `/issue` 是普通命令，仅在默认关闭的写开关开启后创建 GitHub Issue。

## 静态导入

Cloudflare Workers 构建要求动态导入路径可静态分析。因此运行时命令和回调分发在 `src/index.ts` 中使用显式 switch：

- `loadCommand(cmd)`
- `loadCallback(type)`

`src/routes.ts` 仍用于命令元数据，尤其是处理完成后是否删除触发命令消息。

维护注意：命令是否真实可用以 `src/index.ts` 为准；`src/routes.ts` 目前没有列出全部 DND 命令和回调。

## 命令消息删除

命令 handler 完成后，`src/index.ts` 读取 `COMMAND_ROUTES[cmd]`：

- 没有 route 元数据时，命令消息会延迟删除。
- `deleteMsg: false` 会保留命令消息。

## 回调处理

特殊回调：

- `game_short_name=hello` 打开 `/web/hello`。
- `game_short_name=fish` 打开 `/web/fish`。
- callback data `{ "type": "delete_message" }` 立即删除机器人消息。

`loadCallback()` 注册的类型包括 `congrats`、`21`、`duel`、`fish`、`groll`、`lottery`、`dnd_reroll`、`dnd_confirm`、`item_action`、`lu`。

## 星号快捷方式

普通消息以 `*` 开头且不是 `**` 时，按以下顺序分发：

1. 如果用户有匹配装备武器，或发送 `*攻击`，执行武器攻击。
2. 如果 D1 技能有 `damage` 或 `mana_cost`，执行魔法施放。
3. 否则执行普通 DND 技能检定。

如果消息是回复他人，会把目标信息传给 attack/cast/skill handler。

## Web 路由

见 [web-games.md](web-games.md)。

## 定时任务

生产环境 `wrangler.jsonc` 配置 `59 * * * *`。自进化审视会保存 PR 与 `bot:ready` Issue 快照，优先合适的社区 PR，并在适合时记录一个只读 Issue 候选；不会修改源码、评论、批准或合并。已明确授权共享的 Gemini 凭据可通过只读模型列表做健康检查。详见[自进化系统分阶段路线图](self-evolution-roadmap.md)。
