# 货币与彩票系统

English source: [../coin-system.md](../coin-system.md)

经济功能由 CoinDO、LotteryDO、命令 handler 和 `coinService` 组成。

## 存储

| Store | 角色 |
|-------|------|
| `COIN_DO` | 主货币账本、国库、祈祷日期等 raw key |
| `LOTTERY_DO` | 彩票票据、奖池、开奖状态 |
| `COIN_KV` | 遗留/辅助绑定，不是主账本 |

## Coin 命令

| 命令 | 行为 |
|------|------|
| `/coin` | 显示余额 |
| `/coin pray` | 在允许话题中每日获得货币 |
| `/coin send <amount>` | 回复转账 |
| `/coin check` | 管理员检查 |
| `/coin take <amount>` | 管理员取国库 |
| `/coin create <amount>` | 管理员铸币 |
| `/coin remove <amount>` | 管理员销毁 |

管理员白名单来自 `src/lib/liveConfig.ts` 和数据模块。

## 转账手续费

手续费取决于接收方转账后余额：

- 低于 300：免费。
- 300 到 3000：0.1% 到 0.3% 的 cubic ease-in-out。
- 3000 及以上：0.5%。

手续费进入 `TREASURY_KEY`。

## 祈祷

`/coin pray` 限定在代码中的特定 chat/thread。它在 CoinDO raw storage 中记录 `coin_pray:<userId>`，并允许国库为负地向用户支付。

## Coin Service

`src/lib/coinService.ts` 封装 CoinDO 端点：`getBalance`、`transfer`、`addToTreasury`、`takeFromTreasury`、`getTreasury`、`sumAllUserBalances`。

已知类型检查问题：`coinService.ts` 当前在 `npx tsc --noEmit` 下有 JSON `unknown`/`{}` 类型错误。

## 彩票命令

| 命令 | 行为 |
|------|------|
| `/lottery` | 显示当前彩票状态 |
| `/lottery buy [NNN]` | 购买彩票，不填则随机三位数 |
| `/lottery now` | 管理员开奖 |
| `/lottery clean` | 管理员清理 |
| `/lottery list` | 管理员列出票据 |

规则：

- 每张 10 coins。
- 每人最多 5 张。
- 精确匹配和前两位匹配奖池逻辑在 `lottery.ts` 和 `LotteryDO` 中。

## 文件与测试

主要文件：`src/commands/coin.ts`、`src/lib/coinService.ts`、`src/durableObjects/coin_do.ts`、`src/commands/lottery.ts`、`src/durableObjects/lottery_do.ts`。

测试：`test/commands/coin.spec.ts`、`test/commands/lottery.spec.ts`。
