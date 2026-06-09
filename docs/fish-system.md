# 钓鱼系统

## 存储

- **FISH_KV**（KV）：鱼种列表，key = `fish:list:v1`
- **FISHING_RECORD_KV**（KV）：钓鱼记录、鱼塘汇总

## 命令

| 命令 | 说明 |
|------|------|
| `/fish X` | 花费 X 鱼饵钓鱼 |
| `/fish check` | 查看今日钓鱼情况 |
| `/fish add 名称 价值` | 花费 10c 添加鱼，价值必须为 1-13 |

## 钓鱼机制

- 每天最多尝试 20 次
- 连续 10 次空竿触发当日一次保底
- 鱼种列表存储于 `FISH_KV`，`src/data/fish.ts` 作为首次初始化种子
- 用户新增鱼的上钩率由价值固定匹配，不能自定义
- 鱼塘每日汇总（总消耗鱼饵、总产出渔获）

## 文件

| 文件 | 用途 |
|------|------|
| `src/lib/fishCore.ts` | 钓鱼核心算法 + KV 记录操作 |
| `src/lib/fishCatalog.ts` | 鱼种列表 KV 初始化、读取、追加 |
| `src/commands/fish.ts` | 钓鱼命令处理器 + 鱼塘查询 |
| `src/data/fish.ts` | 默认鱼种种子 + 抛竿描述 |
| `src/web/fish/` | 钓鱼 Web 游戏 |
