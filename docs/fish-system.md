# 钓鱼系统

## 存储

- **FISHING_RECORD_KV**（KV）：钓鱼记录、鱼塘汇总

## 命令

| 命令 | 说明 |
|------|------|
| `/fish X` | 花费 X 鱼饵钓鱼 |
| `/fish check` | 查看今日钓鱼情况 |

## 钓鱼机制

- 每天最多尝试 20 次
- 连续 3 次空竿触发保底
- 鱼种列表定义于 `src/data/fish.ts`
- 鱼塘每日汇总（总消耗鱼饵、总产出渔获）

## 文件

| 文件 | 用途 |
|------|------|
| `src/lib/fishCore.ts` | 钓鱼核心算法 + KV 记录操作 |
| `src/commands/fish.ts` | 钓鱼命令处理器 + 鱼塘查询 |
| `src/data/fish.ts` | 鱼种列表 + 抛竿描述 |
| `src/web/fish/` | 钓鱼 Web 游戏 |
