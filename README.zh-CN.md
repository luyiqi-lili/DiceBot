# DiceBot Telegram Bot

English source: [README.md](README.md)

DiceBot 是运行在 Cloudflare Workers 上的 Telegram 群组机器人，提供群工具、游戏、轻量 DND 跑团和 Telegram Web 小游戏。运行时使用 TypeScript、KV、Durable Objects、D1 和 Telegram Bot API。AI 推理仅用于 `/trans` 和受控的 GitHub Issue 门禁；两者都经过 Cloudflare AI Gateway，并优先使用用户捐赠凭据，再回退到 Workers AI。

## 当前状态

- 运行时：Cloudflare Workers。
- 主入口：`src/index.ts`。
- 命令分发：`src/index.ts` 中的静态 `import()` switch。
- 路由元数据：`src/routes.ts`，主要用于 `deleteMsg`。
- 本地单元测试：`npm run test:unit -- --run`。
- 类型检查：`npx tsc --noEmit`。
- 依赖审计：`npm audit --audit-level=low`。

已知运行风险：

- 普通 `/api/*` 在 `EXTERNAL_API_KEY` 缺失或不匹配时默认拒绝；捐赠接口使用独立的 intake/admin 凭据。
- `src/web/score.ts` 在 inline 分数提交时会记录 `env.TOKEN`，生产日志应先删除或脱敏。
- `routes.ts` 没有列出 `src/index.ts` 能分发的全部命令和回调。运行时行为以 `src/index.ts` 为准。
- 截至 2026-07-30，`npm audit --audit-level=low` 报告 Wrangler/Miniflare 开发工具链中的 5 个 high 级问题（`postcss`、`sharp`）。完整自动修复会包含 Cloudflare Vitest pool 的破坏性升级，应作为独立依赖升级处理。

## 请求流程

```text
HTTP request
  |
  +-- /web/*  -> src/web/router.ts
  |
  +-- /api/*  -> handleExternalAPI()
  |              /api/coin/* -> CoinDO HTTP facade
  |              /api/donations/*, /api/ai/*, /api/evolution/*
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

Cloudflare 需要构建工具能静态分析模块导入，因此 `src/index.ts` 使用显式 switch-case `import()`，即使项目里也存在 `src/routes.ts`。

## 命令概览

- 骰子与游戏：`/roll`、`/r`、`/rd`、`/rh`、`/groll`、`/21`、`/duel`。
- 经济：`/coin`、`/lottery`、`/congrats`、`/恭喜发财`。
- 工具：`/help`、`/whoami`、`/book`、`/news`、`/rule`、`/echo`、`/em`、`/me`、`/emote`、`/like`、`/act`、`/trans`、`/wish`、`/issue`、`/status`。
- 凭据捐赠：仅私聊可用的 `/donatetoken`、`/quota`、`/revoketoken`。
- 权限控制：机器人在其被加入的任意群组都会响应（无群组白名单；数据按 `chat_id` 隔离）。群主自动拥有全部管理命令权限，并可用 `/perm` 为具体用户授予/移除权限（存于 D1 `permission_grants` 表）。详见 [docs/zh-CN/commands.md](docs/zh-CN/commands.md)。
- 钓鱼：`/f`、`/f check`、`/f add`、`/f list`、`/f remove`。
- 好感度：`/rose`、`/rose send`、`/rose check`。
- DND：`/dnd`、`/new`、`/char`、`/skill`、`/skills`、`/rest`、`/gm`、`/item`、`/attack`、`/atk`、`/cast`、`/lvup`、`/level`。
- 星号快捷方式：以 `*` 开头的普通消息会根据角色状态和 D1 技能数据分发到武器攻击、魔法施放或技能检定。

完整命令参考：[docs/zh-CN/commands.md](docs/zh-CN/commands.md)。

## 自进化底座

当前实现阶段 1–2 的安全底座：生产 Cron 每小时评估开放 PR；无合适社区 PR 时从低风险 `bot:ready` Issue 中选择候选。选择前，每轮最多由捐赠的 Ollama Cloud 大模型或 Workers AI 70B 回退模型批准一个未 ready Issue。显式开启后，`/wish`/`/issue` 可创建公开需求。新捐赠密钥只保存在 Cloudflare AI Gateway Secrets Store，D1 仅保存指纹、路由、健康状态和模型缓存等非敏感元数据。当前不会自动改源码、评论、批准、合并、支付或切换 Cloudflare 套餐。

分阶段范围、验收标准和后续路线见[自进化系统路线图](docs/zh-CN/self-evolution-roadmap.md)。
当前模型顺序、费用分级和凭据生命周期见 [AI 路由与凭据捐赠](docs/zh-CN/ai-routing.md)。

## 存储

Cloudflare 绑定定义在 `src/index.ts` 和 `wrangler.jsonc`。

活跃存储：

- KV：`NEWS_STORE`、`TOPIC_KV`、`BOOK_STORE`、`FISHING_RECORD_KV`、`FISH_KV`、`TGBOTCOUNT`、`AFFECTION_KV`、`COIN_KV`、`ITEM_STORE`。
- Durable Objects：`COIN_DO`、`LOTTERY_DO`。
- D1：生产环境中的 `DB`，用于 DND、物品、好感度、备份、调用统计、规则、权限授予、主题访问和消息历史等功能。

兼容/遗留绑定：

- `ITEM_STORE` 是旧版 KV 物品存储；当前 `/item` 使用 D1。
- `COIN_KV` 是旧版货币缓存；当前余额变更使用 `CoinDO`。
- `AFFECTION_KV` 仍作为好感度回退和迁移来源。

存储手册：[docs/zh-CN/storage.md](docs/zh-CN/storage.md)。

## 仓库结构

```text
src/
  index.ts                  Worker 入口、HTTP 路由、Telegram 事件分发
  routes.ts                 命令元数据
  commands/                 Telegram 命令处理器
  lib/                      领域服务与 Telegram 工具
  data/                     白名单、种子数据、文本预设
  durableObjects/           CoinDO 和 LotteryDO
  cron/                     定时任务
  web/                      Telegram Web 游戏与分数 API
scripts/                    部署通知
test/                       Vitest 单元/e2e/脚本测试
docs/                       项目手册和实现记录
wrangler.jsonc              Cloudflare 环境绑定和部署配置
```

架构手册：[docs/zh-CN/architecture.md](docs/zh-CN/architecture.md)。

## 本地设置

安装依赖：

```bash
npm install
```

使用 Node.js 22 或更新版本。CI 当前使用 Node.js 24.x。

绑定变化后生成 Worker 类型：

```bash
npm run cf-typegen
```

本地运行 Worker：

```bash
npm run dev
```

常用测试命令：

```bash
npm run test:unit -- --run
```

环境与 secret 手册：[docs/zh-CN/environment.md](docs/zh-CN/environment.md)。

## 测试与审计

```bash
npm run test:unit -- --run
npx tsc --noEmit
npm audit --audit-level=low
npm run test:e2e
```

默认的 `npm test -- --run` 使用 Cloudflare Vitest pool；由于 Worker 配置了 AI binding，可能需要 Cloudflare 远程预览权限。E2E 测试需要真实外部变量，包括 `WORKER_BASE_URL` 和 `EXTERNAL_API_KEY`。

测试手册：[docs/zh-CN/testing.md](docs/zh-CN/testing.md)。

## 部署

配置的环境：

- `dev`：Worker `telegram-bot-dev`，bot username `lili_DevDiceBot`，D1 绑定 `dicebot-dev-db`。
- `prod`：Worker `telegram-bot`，bot username `lili_DiceBot`，D1 绑定 `DB`，cron `59 * * * *`。

脚本：

- `npm run deploy` 执行 `wrangler deploy`。
- `scripts/notify-deploy.sh` 向可配置目标发送部署通知。生产默认私聊管理员 `8080375150`，开发环境保留群组 topic；Bot Token 保存在 GitHub Secrets。
- 推送 `main` 会由 GitHub Actions 自动发布；除非明确进行故障恢复，不要在推送后再手动部署生产环境。

## 文档索引

- [架构](docs/zh-CN/architecture.md)
- [命令](docs/zh-CN/commands.md)
- [环境与部署](docs/zh-CN/environment.md)
- [存储](docs/zh-CN/storage.md)
- [测试与审计](docs/zh-CN/testing.md)
- [AI 路由与凭据捐赠](docs/zh-CN/ai-routing.md)
- [自进化系统路线图](docs/zh-CN/self-evolution-roadmap.md)
- [Web 游戏](docs/zh-CN/web-games.md)
- [DND 系统](docs/zh-CN/dnd-design.md)
- [物品系统](docs/zh-CN/item-system.md)
- [货币与彩票](docs/zh-CN/coin-system.md)
- [钓鱼系统](docs/zh-CN/fish-system.md)
- [好感度系统](docs/zh-CN/affection-system.md)
- [莉莉与拉斐尔背景故事](docs/zh-CN/lily-raphael-background.md)
- [巫妖的规则书](docs/zh-CN/lich-rulebook.md)

## 维护规则

- 新增命令时，先更新 `src/index.ts`；如果删除命令消息行为重要，再更新 `src/routes.ts` 元数据；然后更新命令文档。
- 新增存储时，更新 `src/index.ts`、`wrangler.jsonc`、环境手册和存储手册。
- 修改 D1 表或 Durable Object 端点时，同步更新子系统文档和测试。
- 不要把计划行为写成活跃行为；未来工作必须明确标记。
