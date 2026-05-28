## 🎲 DiceBot 项目

一个基于 Cloudflare Workers 和 Telegram Bot 的掷骰子服务，支持生产环境和开发环境的自动化部署。

---

### 📂 仓库结构

```
├── src/
│   ├── index.ts              # Worker 入口 — webhook 路由、API 分发
│   ├── routes.ts             # 命令/回调路由注册表（数据驱动分发）
│   ├── commands/             # 命令处理器（22 个命令模块）
│   │   ├── roll.ts           # 掷骰 /roll /r /rd /rh
│   │   ├── coin.ts           # 货币系统 /coin
│   │   ├── lottery.ts        # 彩票系统 /lottery
│   │   ├── fish.ts           # 钓鱼 /fish
│   │   ├── rose.ts           # 好感度 /rose
│   │   ├── duel.ts           # 决斗 /duel
│   │   ├── groll.ts          # 群骰 /groll
│   │   ├── 21.ts             # 21点 /21
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

* **部署工具**：Wrangler CLI ([文档](https://developers.cloudflare.com/workers/wrangler/))
* **执行平台**：Cloudflare Workers & KV
* **源码托管**：GitHub
* **管理账号**：`luyiqi.lili@gmail.com`

---

## 🚀 初始化设置

1. **创建 Telegram Bot**

   * 通过Telegram的 `@BotFather` 创建两个 Bot：`lili_DiceBot`（生产）和 `lili_DevDiceBot`（开发）
   * 获取并保存它们的 API Token

2. **配置 Cloudflare**

   * 登录 Cloudflare 控制台，创建两个 KV Namespace，分别用于生/产测试和开发环境
   * 在 `wrangler.json`中填写对应的命名空间 ID

3. **设置 GitHub Secrets**

   * 打开仓库「Settings」→「Secrets and variables」→「Actions」
   * 添加以下 Secrets：

     * `CLOUDFLARE_ACCOUNT_ID`
     * `CLOUDFLARE_API_TOKEN`

4. **首轮部署**

   * 在主分支（`main`）推送后自动部署到生产环境；在开发分支（`dev`）推送后自动部署到测试环境。
   * 可在 GitHub Actions 页面查看执行状态：
     [https://github.com/luyiqi-lili/DiceBot/actions](https://github.com/luyiqi-lili/DiceBot/actions)
   * 在 Cloudflare Dashboard 确认 Workers & Pages 部署成功：
     [https://dash.cloudflare.com/36108a546384a0ef4f8d0556d5a6df3c/workers-and-pages](https://dash.cloudflare.com/36108a546384a0ef4f8d0556d5a6df3c/workers-and-pages)

5. **设置 Telegram Webhook**

   * 生产环境：

     ```bash
     curl -X POST "https://api.telegram.org/bot${PROD_BOT_TOKEN}/setWebhook" \
       -d "url=https://telegram-bot.luyiqi-lili.workers.dev"
     ```
   * 开发环境：

     ```bash
     curl -X POST "https://api.telegram.org/bot${DEV_BOT_TOKEN}/setWebhook" \
       -d "url=https://telegram-bot-dev.luyiqi-lili.workers.dev"
     ```

---

## 🛠️ 开发流程

1. 在 `dev` 或其他分支完成功能开发。
2. 推送到远程仓库后，开发环境的 Bot(`@lili_DevDiceBOT`) 会自动更新并可进行测试。
3. 提交 Pull Request 合并到 `main` 分支。
4. 仓库主分支合并后，生产环境的 Bot(`@lili_DiceBOT`) 会自动部署。
5. 验证生产环境 Bot 功能正常。



