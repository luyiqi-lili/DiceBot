# 好感度系统

English source: [../affection-system.md](../affection-system.md)

好感度系统记录 Telegram 用户之间的有向好感。

## 运行入口

`/rose` 由 `src/commands/rose.ts` 处理。

## 存储

| Store | 角色 |
|-------|------|
| D1 `affections` | 主好感记录 |
| D1 `rose_sends` | 每日免费送花跟踪 |
| `AFFECTION_KV` | 回退/迁移来源 |
| `COIN_DO` | 额外送花付费 |

`src/lib/affectionDB.ts` 负责 D1/KV 回退逻辑。

## 命令

| 命令 | 行为 |
|------|------|
| `/rose` 回复 | 查看你对被回复用户的好感 |
| `/rose send` 回复 | 向被回复用户送花 |
| `/rose check` | 查看自己或被回复用户收到的好感排行 |

## 送花

每日第一次 `/rose send` 免费，增加 160 好感。

同一 UTC 日期额外送花花费 30 coins，也增加 160 好感。

如果扣款成功但 D1 写入失败，用户会收到扣款成功但好感记录失败的警告。

## 排行榜

`/rose check` 读取目标收到的好感排行。实现会在必要时合并 D1 和 KV 回退数据。

## 显示

`src/commands/rose.ts` 中的 `scoreToEmoji()` 将分数映射为 emoji 层级。具体显示由代码定义，而不是固定文档表。

## 测试

相关测试：`test/commands/rose.spec.ts`。
