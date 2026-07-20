# 命令参考

English source: [../commands.md](../commands.md)

本参考以 `src/index.ts` 的运行时分发为准。`src/routes.ts` 的元数据不完整，因此命令可用性以 `loadCommand()` 为准。

> 聊天功能已不再依赖旧 DeepSeek 兼容 API。`/trans`、`/ask`、`/report` 和内联 `@bot` 智能回复仍然下线。`/wish` 已以新语义恢复：创建公开源码需求 Issue，不调用聊天模型。

## 通用命令

| 命令 | Handler | 说明 |
|------|---------|------|
| `/help` | `handleHelp` | 主帮助文本 |
| `/whoami` | `handleWhoami` | 显示 Telegram 用户/聊天信息 |
| `/echo` | `handleEcho` | 掷骰给用户文本一个静态态度评价 |
| `/em`, `/me`, `/emote` | `handleEmote` | 动作文本 |
| `/like` | `handleLike` | D1 调用统计 |
| `/book` | `handleBook` | `BOOK_STORE` 书签 |
| `/news` | `handleNews` | `NEWS_STORE` 每日群消息 |
| `/rule` | `handleRule` | D1 群规则 |
| `/check <问题>` | `handleCheck` | 查询当前实现里的功能规则（本地预置回答）|
| `/act` | `handleAct` | D1 活动/会话记录 |
| `/top` | `handleTop` | 管理员查看最近 7 天主题消息排行 |
| `/fate` | `handleFate` | 塔罗式抽 3 张牌 |
| `/perm` | `handlePerm` | 群主为具体用户授予/移除管理权限（见下文）|
| `/topic` | `handleTopic` | 群主配置「仅特定主题可用」的功能在本群的可用主题（见下文）|
| `/wish <需求>`、`/issue <需求>` | `handleWish` | intake 已开启且 GitHub token 具备 Issues 写权限时创建公开 Issue |
| `/donatetoken <平台> <授权范围> <Token>`、`/donate_token ...` | `handleDonateToken` | 仅限机器人私聊；先删除原消息，再加密接收 AI Token |
| `/donate`、`/donate stars <数量>`、`/donate ton [数量]` | `handleDonate` | 私聊生成 Stars 发票，或创建带唯一备注的 TON 转账意向 |
| `/terms`、`/paysupport` | 支付支持处理器 | 查看捐赠说明和支付支持指南 |

## 权限控制

机器人在**任意被加入的群组**都会响应——没有群组白名单。存储数据按 Telegram `chat_id` 隔离。

管理命令（`/coin check|take|create|remove`、`/coin list`、`/lottery` 管理子命令、`/top`）在满足以下**任一**条件时通过鉴权：

1. 调用者的 Telegram 用户 ID 在静态白名单中（`src/data/admin.ts`）。
2. 调用者是**群主**（Telegram `creator`）——群主隐式拥有全部管理权限。
3. 调用者在本群被群主通过 `/perm` **动态授予**了该权限（存于 D1 表 `permission_grants`，按 `chat_id` 隔离）。

鉴权逻辑集中在 `hasAdminPermission()`（`src/lib/permissions.ts`）。

### `/perm` — 按用户的动态权限（仅群主）

回复目标用户的一条消息后，执行：

| 命令 | 作用 |
|------|------|
| `/perm grant <权限名\|all>` | 授予被回复用户某项权限 |
| `/perm revoke <权限名\|all>` | 移除某项权限 |
| `/perm list` | 查看该用户已被动态授予的权限 |
| `/perm keys` | 列出全部可用权限名（所有人可用）|
| `/perm help` | 用法帮助（所有人可用）|

也可不回复、在命令末尾附数字用户 ID（例如 `/perm grant coin_take 12345`）。

权限名：`coin_check`、`coin_take`、`coin_create`、`coin_remove`、`lottery`、`top`，以及 `all`。`grant`/`revoke`/`list` 要求调用者为群主，且需要 D1 `DB` 绑定。

### 仅特定主题可用的功能与 `/topic`

部分功能仅在特定论坛主题内可用：`/coin pray`、`/fate`、`/f`（钓鱼）。可用主题由 `isFeatureAllowed()`（`src/lib/topicAccess.ts`）按以下优先级判定：

1. 本群已通过 `/topic` 显式配置（存于 D1 `topic_access`，按 `chat_id` 隔离）→ 以配置为准。
2. 未配置但命中历史硬编码默认 → 沿用默认（保持原有群组行为不变）。
3. 未配置且无默认（新群）→ 所有主题放开。

`/topic` 让**群主**自定义。改配置的子命令须**在目标主题内执行**（命令取当前 `message_thread_id`）：

| 命令 | 作用 |
|------|------|
| `/topic allow <功能名>` | 允许该功能在当前主题使用（转为按主题限制）|
| `/topic disallow <功能名>` | 取消当前主题的许可 |
| `/topic anywhere <功能名>` | 允许在本群所有主题使用 |
| `/topic reset <功能名>` | 清除本群配置，恢复默认 |
| `/topic list [功能名]` | 查看生效配置（所有人可用）|
| `/topic features` | 列出可配置的功能名（所有人可用）|

功能名：`pray`、`fate`、`fish`。`allow`/`disallow`/`anywhere`/`reset` 要求群主，且需要 D1 `DB` 绑定。

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
