# 🎲 DiceBot 项目

一个基于 Cloudflare Workers 和 Telegram Bot 的掷骰子服务，集货币系统、彩票、钓鱼、塔罗占卜、AI 翻译等功能于一体，支持生产环境和开发环境的自动化部署。

---

## 🏗️ 系统架构

```
                        ┌─────────────────┐
                        │  Telegram API   │ ← webhook POST
                        └────────┬────────┘
                                 │
           ┌─────────────────────▼──────────────────────┐
           │           src/index.ts (319 行)             │
           │  fetch() 入口 ─ 请求路由 + 事件分发        │
           │                                              │
           │  ┌─ /web/*  → web/router.ts                 │
           │  ├─ /api/*  → handleExternalAPI → CoinDO    │
           │  ├─ POST    → parseUpdate → 白名单检查       │
           │  └─ type 分发:                              │
           │      ├─ inline_query  → aiAssistInline      │
           │      ├─ topic_edited  → topicEditHandler    │
           │      ├─ callback_query→ loadCallback()      │
           │      └─ message        → loadCommand()       │
           │              + COMMAND_ROUTES (deleteMsg)    │
           └────────────────────┬──────────────────────┘
                                │
     ┌──────────────────────────┼──────────────────────────┐
     │                          │                          │
┌────▼────┐              ┌──────▼──────┐           ┌──────▼──────┐
│commands/│              │    lib/     │           │ durableObj/ │
│  22 files│             │  7 files    │           │  2 files    │
│         │              │            │           │            │
│ roll    │◄─────┐       │ tgMessage  │           │ CoinDO     │
│ coin    │──┐   │       │ coinService│──────────│ LotteryDO  │
│ fish    │  │   │       │ liveConfig │           └──────┬─────┘
│ duel    │  │   │       │ backup     │                  │
│ rose    │──┤   │       │ affctnDB  │           ┌──────▼──────┐
│ lottery │  │   │       │ fishCore   │           │ Cloudflare  │
│ news    │  │   │       │ util       │           │ KV / D1     │
│ ...     │  │   │       └────────────┘           └─────────────┘
└─────────┘  │   │
     └───────┴───┘  (静态 import，Workers 构建兼容)
```

**数据流**：Telegram webhook → `parseUpdate` 解析 → `loadCommand/loadCallback` 静态 import → handler 执行业务逻辑 → `TgMessage.sendText` 回复 → 备份到 D1

**存储层**：
- **KV**（8 个 namespace）：配置、书签、新闻、好感度、钓鱼记录、话题标题、物品、货币缓存
- **Durable Objects**（2 个）：CoinDO（原子转账 SQLite）、LotteryDO（彩票状态 SQLite）
- **D1**：用户活跃、消息历史、好感度主存储、长期记忆

**核心设计原则**：
- `tgMessage.ts` 将所有 Telegram update 归一化为 `ParsedUpdate`，下游 handler 无需关心原始 JSON
- `routes.ts` 命令注册表负责 `deleteMsg` 等元数据，`index.ts` `loadCommand/loadCallback` 用 switch-case 做静态 import（Workers 要求 import() 参数为字面量）
- `coinService.ts` 对 CoinDO HTTP 接口做语义化封装（`transfer` / `getBalance` / `addToTreasury`）

---

## 📋 功能列表

### 🎲 掷骰
| 命令 | 说明 |
|------|------|
| `/roll` `/r` `/rdY` | 掷骰，支持 XdY / {选项} / 表达式 |
| `/rh` | 隐藏掷骰，结果私聊发送 |
| `/groll` | 发起群骰，多人加入一起 roll |
| `/21` | 发起多人 21 点游戏 |

### 💰 货币
| 命令 | 说明 |
|------|------|
| `/coin` | 查询余额 |
| `/coin pray` | 今日祈祷领钱 |
| `/coin send 50` | 回复消息转账 |
| `/coin check` | （管理）查询国库 |
| `/coin take 100` | （管理）国库取款 |
| `/lottery` | 彩票系统 |
| `/congrats` `/恭喜发财` | 回复他人发红包 |

### 🎣 娱乐
| 命令 | 说明 |
|------|------|
| `/fish X` | 花费 X 鱼饵钓鱼 |
| `/fate` | 塔罗占卜（抽 3 张牌） |
| `/em` `/me` `/emote` | 动作指令 |
| `/duel 赌注` | 回复某人发起赌注决斗 |
| `/rose` | 回复某人查看好感度 |
| `/rose send` | 回复某人送花 |

### 📦 信息 & 工具
| 命令 | 说明 |
|------|------|
| `/news` | 查看当日小道消息 |
| `/book` | 书签管理 |
| `/item` | 物品管理 |
| `/trans` | 回复消息翻译（Gemini API） |
| `/echo` | 让骰娘评判你的话 |
| `/whoami` | 查看用户信息 |
| `/act start/end` | 记录会话并生成摘要 |
| `/report` | AI 生成昨日群聊汇报 |
| `/rule` | 查看/设置群组规则 |
| `/help` | 查看帮助 |

---

## 📂 仓库结构

```
├── src/
│   ├── index.ts              # Worker 入口 — webhook 路由、API 分发
│   ├── routes.ts             # 命令/回调路由注册表（deleteMsg 元数据）
│   ├── commands/             # 命令处理器（22 个命令模块）
│   │   ├── roll.ts           # 掷骰 /roll /r /rd /rh
│   │   ├── coin.ts           # 货币系统 /coin
│   │   ├── lottery.ts        # 彩票系统 /lottery
│   │   ├── fish.ts           # 钓鱼 /fish
│   │   ├── rose.ts           # 好感度 /rose
│   │   ├── duel.ts           # 决斗 /duel
│   │   ├── groll.ts          # 群骰 /groll
│   │   ├── 21.ts             # 21 点 /21
│   │   ├── fate.ts           # 塔罗占卜 /fate
│   │   ├── news.ts           # 新闻爆料 /news
│   │   ├── book.ts           # 书签 /book
│   │   ├── item.ts           # 物品 /item
│   │   ├── act.ts            # 活动记录 /act
│   │   ├── report.ts         # 群聊汇报 /report
│   │   ├── rule.ts           # 群规则 /rule
│   │   ├── trans.ts          # 翻译 /trans
│   │   ├── echo.ts           # 回声 /echo
│   │   ├── emote.ts          # 动作指令 /em /me
│   │   ├── like.ts           # 调用统计 /like
│   │   ├── whoami.ts         # 用户信息 /whoami
│   │   ├── help.ts           # 帮助 /help
│   │   ├── congrats.ts       # 红包 /恭喜发财
│   │   ├── aiAssistInline.ts # AI 辅助 inline query
│   │   ├── topicEditHandler.ts
│   │   └── deleteMessage.ts
│   ├── data/                  # 静态数据（按域拆分）
│   │   ├── admin.ts           # 管理员权限白名单
│   │   ├── groups.ts          # 群组白名单
│   │   ├── tarot.ts           # 塔罗牌大阿尔卡那
│   │   ├── fish.ts            # 鱼种 + 抛竿描述
│   │   ├── texts.ts           # 好感度/态度文本
│   │   ├── payment.ts         # 付费场景配置
│   │   └── backup.ts          # 消息备份映射
│   ├── lib/                  # 公共库
│   │   ├── tgMessage.ts      # Telegram API 封装 & 消息解析
│   │   ├── coinService.ts    # Coin DO 服务层封装
│   │   ├── liveConfig.ts     # 运行时配置（白名单、静态数据）
│   │   ├── backup.ts         # 消息备份到 D1
│   │   ├── affectionDB.ts    # 好感度 DB/KV 双写存储
│   │   ├── fishCore.ts       # 钓鱼核心算法
│   │   └── util.ts           # 工具函数（HTML 转义等）
│   ├── durableObjects/       # Durable Objects
│   │   ├── coin_do.ts        # CoinDO — 原子转账
│   │   └── lottery_do.ts     # LotteryDO — 彩票状态
│   ├── cron/                 # 定时任务
│   │   └── cron.ts           # Coin 余额每日检查
│   └── web/                  # Web 页面
│       ├── router.ts         # Web 路由
│       ├── hello.ts/html     # Hello 游戏
│       └── fish/             # 钓鱼 Web 游戏
├── test/                     # 测试（22 个测试文件，111 个用例）
├── wrangler.jsonc            # Wrangler 配置（dev / prod 环境）
├── tsconfig.json
├── vitest.config.mts
└── .github/workflows/
    └── deploy.yml            # CI/CD 自动部署
```

---

## ⚙️ 运行平台及环境

- **部署工具**：Wrangler CLI
- **执行平台**：Cloudflare Workers
- **存储**：KV Namespace × 8 / Durable Objects（CoinDO、LotteryDO）/ D1 Database
- **API**：Gemini（翻译、汇报、AI 辅助）/ SiliconFlow（备用）
- **源码托管**：GitHub
- **管理账号**：`luyiqi.lili@gmail.com`

---

## 🚀 初始化设置

1. **创建 Telegram Bot** — 通过 `@BotFather` 创建 `lili_DiceBot`（生产）和 `lili_DevDiceBot`（开发），获取 API Token

2. **配置 Cloudflare** — 创建 KV Namespace，填写 `wrangler.jsonc` 中的 namespace ID

3. **设置 GitHub Secrets** — `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN`

4. **设置 Secrets（API Key）**：
   ```bash
   wrangler secret put GOOGLE_API_KEY   -e prod
   wrangler secret put SILICONFLOW_API_KEY -e prod
   ```

5. **首轮部署** — 推送到 `main` 自动部署生产，推送到其他分支自动部署开发环境

6. **设置 Telegram Webhook**：
   ```bash
   # 生产
   curl -X POST "https://api.telegram.org/bot${PROD_TOKEN}/setWebhook" \
     -d "url=https://telegram-bot.luyiqi-lili.workers.dev"
   # 开发
   curl -X POST "https://api.telegram.org/bot${DEV_TOKEN}/setWebhook" \
     -d "url=https://telegram-bot-dev.luyiqi-lili.workers.dev"
   ```

---

## 🛠️ 本地开发

```bash
npm install          # 安装依赖
npm run dev          # 启动本地开发服务器（wrangler dev）
npm test             # 运行测试（vitest）
npm run cf-typegen   # 生成 Worker 类型定义
```

---

## 🔧 新增命令

1. 在 `src/commands/` 创建 `xxx.ts`，导出 `handleXxx(parsed, env)` 函数
2. 在 `src/index.ts` 的 `loadCommand()` 中添加 case：
   ```typescript
   case 'xxx': { const { handleXxx } = await import('./commands/xxx'); return handleXxx; }
   ```
3. 在 `src/routes.ts` 的 `COMMAND_ROUTES` 中添加元数据（`deleteMsg` 配置）
4. 可选：更新 `src/commands/help.ts` 的帮助文本

---

## 📝 TODO — 待重构

| 优先级 | 事项 | 状态 |
|--------|------|------|
| 🔴 P0 | API Key 从 wrangler.jsonc 迁移到 `wrangler secret` | ⬜ |
| 🔴 P0 | 配置 `EXTERNAL_API_KEY` 或关闭 `/api/*` 路由 | ⬜ |
| 🟡 P1 | 拆分 `liveConfig.ts`（1178 行 → admin / groups / tarot / fish / texts） | ✅ 完成 |
| 🟡 P1 | 统一 `Env` 类型定义（消除 `any` 和分散的类型） | ✅ 完成 |
| 🟡 P1 | 消除 handler 中重复的 `chatId/threadId/from` 提取 | ⬜ |
| 🟡 P1 | 删除死代码：`incrementUsageCount` import、空 `deleteUids` 数组 | ⬜ |
| 🟢 P2 | DRY wrangler.jsonc 配置（顶层 + env override） | ⬜ |
| 🟢 P2 | CoinDO / LotteryDO 单元测试 | ⬜ |
| 🟢 P2 | 修复 `coinService.ts` 3 个 TS 类型错误 | ⬜ |
| 🟢 P2 | 提取 hello/fish 游戏启动代码到独立模块 | ⬜ |
| 🔵 P3 | Web URL 改为环境变量 | ⬜ |
| 🔵 P3 | 按场景决定是否删除命令消息 | ⬜ |

---

## 🧪 测试

```bash
npm test              # 运行全部测试（22 文件，111 用例）
npx vitest run        # 单次运行
npx vitest --reporter=verbose  # 详细输出
```

---

## 📦 部署

- `main` 分支 → 生产环境 `telegram-bot`（`@lili_DiceBot`）
- 其他分支 → 开发环境 `telegram-bot-dev`（`@lili_DevDiceBot`）
- 部署日志：[GitHub Actions](https://github.com/luyiqi-lili/DiceBot/actions)
- Worker 控制台：[Cloudflare Dashboard](https://dash.cloudflare.com/36108a546384a0ef4f8d0556d5a6df3c/workers-and-pages)
