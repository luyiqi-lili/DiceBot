# 架构

English source: [../architecture.md](../architecture.md)

本文按 `src/index.ts` 的当前代码描述运行时架构。

## 运行时

DiceBot 运行为 Cloudflare Worker。Worker 导出：

- default `scheduled()` 和 `fetch()` handler
- `CoinDO`
- `LotteryDO`

`scheduled()` 独立启动 `src/cron/cron.ts` 中的 `runCoinCheck(env)`，以及 `src/lib/githubPrMonitor.ts` 中的只读 PR 扫描。

`fetch()` 处理 Web 页面、外部 API、Telegram webhook update 和健康检查。

## HTTP 路由

`src/index.ts` 按顺序处理请求：

1. `/web/` 开头的路径交给 `src/web/router.ts` 的 `handleWebRequest()`。
2. `/api/` 开头的路径交给 `handleExternalAPI()`。
3. 非 POST 请求返回 `I am alive`。
4. POST 请求按 Telegram update 解析。
5. 如果 `chatId` 不在 `ALLOWED_CHAT_IDS`，忽略 update。
6. 根据解析后的 update type 分发。

## 外部 API

| 路径 | 处理 |
|------|------|
| `/api/coin/*` | 去掉 `/api/coin` 后转发给 `CoinDO` |
| `/api/lottery/*` | 去掉 `/api/lottery` 后转发给 `LotteryDO` |
| `/api/donations/api-keys` | 使用独立 bearer token 接收并加密保存捐赠 API Key |
| `/api/health` | JSON 状态响应 |

普通 `/api/*` 路由校验 `EXTERNAL_API_KEY`；捐赠入口单独校验 `DONATION_INTAKE_KEY`，不会因此获得其他管理 API 权限。

## Telegram Update 分发

| 类型 | 行为 |
|------|------|
| `inline_query` | `src/commands/aiAssistInline.ts` |
| `topic_edited` | `src/commands/topicEditHandler.ts` |
| `callback_query` | 游戏启动、删除消息或 `loadCallback()` |
| 命令消息 | `loadCommand()` |
| 非命令消息 | wish 批准、星号快捷方式，然后 D1 备份 |

非命令文本在 wish/星号处理后会通过 `handleBackup()` 备份。

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

生产环境 `wrangler.jsonc` 配置 `59 * * * *`，触发宝库检查和 GitHub PR 扫描。PR 扫描只读取开放 PR 和文件列表，把快照与静态风险信号写入 D1；不会评论、批准或合并。详见[自进化系统分阶段路线图](self-evolution-roadmap.md)。

Wish digest/execution 自动化不是 Worker cron，而是由 `scripts/wish-local.sh` 管理的本地 cron。
