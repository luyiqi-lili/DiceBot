# 存储

English source: [../storage.md](../storage.md)

项目使用 Cloudflare KV、Durable Objects 和 D1。

## 绑定概览

| Binding | 类型 | 主要用途 |
|---------|------|----------|
| `NEWS_STORE` | KV | `/news` |
| `TOPIC_KV` | KV | 话题标题跟踪 |
| `BOOK_STORE` | KV | `/book` |
| `FISHING_RECORD_KV` | KV | 钓鱼记录和鱼塘汇总 |
| `FISH_KV` | KV | 鱼种列表 |
| `TGBOTCOUNT` | KV | 调用统计遗留/辅助 |
| `AFFECTION_KV` | KV | 好感度迁移回退 |
| `ITEM_STORE` | KV | 旧版物品存储 |
| `COIN_KV` | KV | 旧版货币支持 |
| `COIN_DO` | Durable Object | 余额、国库、coin raw key |
| `LOTTERY_DO` | Durable Object | 彩票奖池与票据 |
| `DB` | D1 | DND、物品、好感度、wish、备份、规则、PR 快照和加密 API Key 捐赠 |

## KV

KV 用于较低风险或遗留数据：

- 每日新闻
- 书签
- 钓鱼记录和鱼种列表
- 话题标题缓存
- 好感度回退迁移

## Durable Objects

Durable Objects 提供串行化状态变更：

- `src/durableObjects/coin_do.ts`：余额和国库。
- `src/durableObjects/lottery_do.ts`：彩票状态。

`src/lib/coinService.ts` 封装 CoinDO HTTP 接口，包括 `getBalance`、`transfer`、`addToTreasury`、`takeFromTreasury`、`getTreasury`、`sumAllUserBalances`。

## D1

prod 和 dev 都有名为 `DB` 的 D1 绑定，分别指向 `dicebot-db` 与 `dicebot-dev-db`。代码仍需在测试或缺少绑定的临时环境中优雅降级。

主要 D1 表族：

- DND：`dnd_races`、`dnd_classes`、`dnd_skills`、`dnd_characters`、`dnd_gm`、`dnd_dc`。
- 物品：`dnd_item_templates`、`dnd_inventory`。
- 好感度：`affections`、`rose_sends`。
- Wish 自动化：`wishes`、`wish_summaries`、`wish_tasks`。
- 使用与备份：调用统计、用户活跃、消息历史、活动和汇报相关表。
- 规则：`src/commands/rule.ts` 使用的群规则表。
- 自进化底座：`api_key_donations` 保存 AES-GCM 密文和不可逆指纹；`pull_request_snapshots` 与 `pr_monitor_runs` 保存只读 PR 扫描结果。

`api_key_donations.encrypted_key` 不能通过 HTTP API 读回。后续模型路由只能选取 `status = 'active'` 的记录；阶段 1 新记录固定为 `pending`。

仓库目前没有单一完整 D1 migration 文件，schema 信息分散在文档和命令/库模块 SQL 中。

## 遗留说明

- `ITEM_STORE` 属于旧 `/item create/list/use/send #N`；当前 `/item` 使用 D1。
- `COIN_KV` 不是主货币账本。
- `AFFECTION_KV` 仍用于回退迁移和排行榜合并。

## 运维说明

- Durable Object API 应视为内部服务边界。
- dev 与 prod 使用独立 D1 数据库；不要在本地验证时误用 `--remote` 修改线上数据。
- 新增表时，应记录 owner module，并围绕查询契约写聚焦测试。
