# 货币与彩票系统

## 存储

- **CoinDO**（Durable Object + SQLite）：原子转账、余额记录、国库管理
- **LotteryDO**（Durable Object + SQLite）：彩票状态、购买记录、奖池
- **COIN_KV**（KV）：旧版余额缓存（兼容层）

## 货币命令

| 命令 | 说明 | 权限 |
|------|------|------|
| `/coin` | 查询余额 | 任何人 |
| `/coin pray` | 今日祈祷领钱（每日一次） | 任何人 |
| `/coin send 50` | 回复消息转账 | 任何人 |
| `/coin check` | 查询国库 | 管理员 |
| `/coin take 100` | 国库取款 | 管理员 |
| `/coin create 100` | 创建货币 | 管理员 |
| `/coin remove 100` | 销毁货币 | 管理员 |

### 转账费率

- 目标余额 < 300：免费
- 目标余额 300-3000：0.1%-0.3% cubic ease-in-out
- 目标余额 ≥ 3000：0.5%

手续费进入国库（TREASURY_KEY）。

## 彩票命令

| 命令 | 说明 | 权限 |
|------|------|------|
| `/lottery` | 查看彩票状态 | 任何人 |
| `/lottery buy` | 购买彩票（消耗货币） | 任何人 |
| `/lottery now` | 立即开奖 | 管理员 |
| `/lottery clean` | 清空记录 | 管理员 |
| `/lottery list` | 查看购买记录 | 管理员 |

## 文件

| 文件 | 用途 |
|------|------|
| `src/durableObjects/coin_do.ts` | CoinDO — 原子转账 SQLite |
| `src/durableObjects/lottery_do.ts` | LotteryDO — 彩票状态 SQLite |
| `src/lib/coinService.ts` | CoinDO HTTP 接口语义化封装 |
| `src/commands/coin.ts` | 货币命令处理器 |
| `src/commands/coinList.ts` | 货币列表 |
| `src/commands/lottery.ts` | 彩票命令处理器 |
| `src/cron/cron.ts` | 定时任务 — Coin 余额每日检查 |

## 管理员白名单

定义于 `src/data/admin.ts`：

- `ADMIN_UIDS_CHECK`: coin check/list
- `ADMIN_UIDS_TAKE`: coin take
- `ADMIN_UIDS_CREATE`: coin create
- `ADMIN_UIDS_REMOVE`: coin remove
- `LOTTERY_ADMIN_UIDS`: lottery 管理
