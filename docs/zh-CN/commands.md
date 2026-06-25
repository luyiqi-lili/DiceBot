# 命令参考

English source: [../commands.md](../commands.md)

本参考以 `src/index.ts` 的运行时分发为准。`src/routes.ts` 的元数据不完整，因此命令可用性以 `loadCommand()` 为准。

## 通用命令

| 命令 | Handler | 说明 |
|------|---------|------|
| `/help` | `handleHelp` | 主帮助文本 |
| `/whoami` | `handleWhoami` | 显示 Telegram 用户/聊天信息 |
| `/echo` | `handleEcho` | 让机器人评价用户文本 |
| `/em`, `/me`, `/emote` | `handleEmote` | 动作文本 |
| `/like` | `handleLike` | D1 调用统计 |
| `/book` | `handleBook` | `BOOK_STORE` 书签 |
| `/news` | `handleNews` | `NEWS_STORE` 每日群消息 |
| `/rule` | `handleRule` | D1 群规则 |
| `/trans` | `handleTrans` | DeepSeek 翻译回复文本 |
| `/ask` | `handleAsk` | DeepSeek 评论回复内容 |
| `/act` | `handleAct` | D1 活动/会话记录 |
| `/top` | `handleTop` | 管理员查看最近 7 天主题消息排行 |
| `/report` | `handleReport` | AI 群汇报 |
| `/fate` | `handleFate` | 塔罗式抽取 |

## 骰子与游戏

| 命令 | Handler | 说明 |
|------|---------|------|
| `/roll`, `/r`, `/rd`, `/rh` | `handleRoll` | 掷骰；`rh` 为隐藏结果 |
| `/groll` | `handleGroll` | 群骰，支持加入/结束回调 |
| `/21` | `handle21` | 21 点游戏 |
| `/duel` | `handleDuel` | 回复他人发起决斗 |
| `/lottery` | `handleLottery` | 彩票状态、购买、开奖和管理 |

## 经济

| 命令 | 说明 |
|------|------|
| `/coin` | 查询余额 |
| `/coin pray` | 在允许话题中每日祈祷 |
| `/coin send <amount>` | 回复转账 |
| `/coin check` | 管理员检查 |
| `/coin take <amount>` | 管理员从国库取款 |
| `/coin create <amount>` | 管理员铸币 |
| `/coin remove <amount>` | 管理员销毁货币 |
| `/congrats`、`/恭喜发财` 等 | 红包/恭喜发财别名 |

## 钓鱼

| 命令 | 说明 |
|------|------|
| `/f <bait>` | 花费鱼饵并创建拉杆按钮 |
| `/f check` | 查看今日钓鱼记录 |
| `/f add <name> <value>` | 花费 `FISH_ADD_COST` 向 `FISH_KV` 添加鱼 |
| `/f list [page]` | 管理员列表，每页 20 条 |
| `/f remove <index>` | 管理员按列表序号删除 |

钓鱼管理员当前是用户 `8080375150`。

## 好感度

| 命令 | 说明 |
|------|------|
| `/rose` | 回复查看自己对目标的好感度 |
| `/rose send` | 回复送花；每日首次免费 |
| `/rose check` | 查看自己或被回复用户收到的好感度排行 |

## Wish 自动化

| 命令 | 说明 |
|------|------|
| `/wish <text>` | 将有意义的愿望写入 D1 |
| 管理员回复汇总编号 | 非命令路径批准任务，管理员 id 为 `8080375150` |

## DND 命令

| 命令 | 说明 |
|------|------|
| `/dnd` | 列出种族、职业、技能和快捷入口 |
| `/new <race> <class> <name>` | 创建角色预览与确认 |
| `/char` | 角色卡，含装备加成 |
| `/skill <name>` | 技能检定；回复时进行 PVP 对抗 |
| `/skills` | 技能列表和当前调整值 |
| `/rest short`, `/rest long` | 恢复 HP/法力/休息计数 |
| `/gm ...` | GM 管理种族、职业、技能、DC、XP、物品 |
| `/item` | 按钮背包 |
| `/item send <name> [qty]` | 回复赠送未装备物品 |
| `/attack [weapon]`, `/atk [weapon]` | 装备武器攻击 |
| `/cast <spell>` | 魔法伤害/治疗/技能回退 |
| `/lvup` | 升级菜单 |
| `/level` | 等级与 XP 摘要 |

GM 子命令包括 `/gm init`、`/gm 种族`、`/gm 种族加值`、`/gm 职业`、`/gm 技能`、`/gm dc`、`/gm addxp`、`/gm setgm`、`/gm item create/list/delete/give`。

## 回调类型

回调类型包括 `congrats`、`21`、`duel`、`fish`、`groll`、`lottery`、`dnd_reroll`、`dnd_confirm`、`item_action`、`lu` 和内联处理的 `delete_message`。

## 星号快捷方式

以 `*` 开头的消息：

- `*攻击` 或 `*<装备武器名>` 使用装备武器攻击。
- `*<魔法名>` 在 D1 技能有 `damage` 或 `mana_cost` 时施法。
- `*<技能名>` 回退为 DND 技能检定。

以 `**` 开头的消息不会触发快捷方式。
