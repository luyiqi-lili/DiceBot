# 钓鱼系统

English source: [../fish-system.md](../fish-system.md)

钓鱼系统包含 Telegram 命令流程和独立 Web 游戏流程。

## 存储

| Binding | 用途 |
|---------|------|
| `FISH_KV` | `fish:list:v1` 鱼种列表 |
| `FISHING_RECORD_KV` | 用户钓鱼记录和每日鱼塘汇总 |
| `COIN_DO` | 鱼饵支付和渔获发放 |

`src/data/fish.ts` 仍作为 catalog 初始化种子和回退来源。

## 命令

| 命令 | 行为 |
|------|------|
| `/fish <bait>` | 花费鱼饵并创建拉杆按钮 |
| `/fish check` | 查看今日记录 |
| `/fish add <name> <value>` | 花费 10 coins 添加鱼，value 1-13 |
| `/fish list [page]` | 管理员列表，每页 20 条 |
| `/fish remove <index>` | 管理员按序号删除 |

管理员用户：`8080375150`。

## 钓鱼回调

`handleFishCallback()`：

- 只允许发起者拉杆。
- 根据经过秒数和 strength 计算 score。
- 防止同一消息重复处理。
- 限制每日次数。
- 在 `FISHING_RECORD_KV` 记录空竿、跑鱼和钓中。
- 通过 `COIN_DO` 从国库支付渔获。
- 记录鱼塘总鱼饵、总支付、钓中次数和抛竿次数。

## 保底

足够多次零收益后，当 score 落在可钓窗口内，会触发每日一次高价值鱼保底。

## 鱼种列表

`src/lib/fishCatalog.ts` 负责从 KV 读取、从种子初始化、校验用户新增鱼、追加、删除和按价值映射上钩率。

## Web 游戏

Web 游戏位于 `src/web/fish/`，路由见 [web-games.md](web-games.md)。

## 测试

相关测试：

- `test/commands/fish.spec.ts`
- `test/lib/fishCatalog.spec.ts`
- `test/index-fish-alias.spec.ts`
