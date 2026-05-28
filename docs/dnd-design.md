# DND 跑团系统 — 详细设计文档

> 版本: 1.0
> 日期: 2026-05-28
> 设计原则: 数据存储全部走 D1 数据库（仅 prod 可用），dev 环境下 DB 为 undefined 时优雅降级。

---

## 一、总体架构

```
                        Telegram Webhook
                              │
                              ▼
                     src/index.ts (fetch)
                              │
                    loadCommand("gm") ──────► src/commands/dndGm.ts
                    loadCommand("dnd") ──────► src/commands/dndHelp.ts
                    loadCommand("new") ──────► src/commands/dndNew.ts
                    loadCommand("char") ─────► src/commands/dndChar.ts
                    loadCommand("skill") ────► src/commands/dndSkill.ts
                    loadCommand("skills") ───► src/commands/dndSkills.ts
                    loadCommand("rest") ─────► src/commands/dndRest.ts
                              │
                    loadCallback("dnd_reroll") ──► dndNew.ts (重骰回调)
                              │
                              ▼
                     D1 Database (dnd_* 6 张表)
                              │
                     src/lib/dndCore.ts    ← 公共逻辑
                     src/data/dndPresets.ts ← 预设常量
```

## 二、D1 建表语句（共 6 张表）

### 2.1 `dnd_races` — 种族定义

```sql
CREATE TABLE IF NOT EXISTS dnd_races (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  race_name TEXT NOT NULL,
  attr_bonuses TEXT NOT NULL DEFAULT '{}',
  description TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(chat_id, race_name)
);
```

- `attr_bonuses`: JSON map，如 `{"敏捷":2,"智力":1}` 或 `{"力量":1,"敏捷":1,"体质":1,"智力":1,"感知":1,"魅力":1}`
- **幂等语义**：同一 `(chat_id, race_name)` 的 bonuses 做 JSON merge；description 以最新调用为准

### 2.2 `dnd_classes` — 职业定义

```sql
CREATE TABLE IF NOT EXISTS dnd_classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  class_name TEXT NOT NULL,
  primary_attr TEXT NOT NULL,
  hit_die INTEGER NOT NULL DEFAULT 6,
  description TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(chat_id, class_name)
);
```

- `primary_attr`: 力量 / 敏捷 / 体质 / 智力 / 感知 / 魅力
- `hit_die`: 战士 d10，法师 d6

### 2.3 `dnd_skills` — 技能定义

```sql
CREATE TABLE IF NOT EXISTS dnd_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  linked_attr TEXT NOT NULL,
  class_name TEXT NOT NULL,
  race_bonus TEXT NOT NULL DEFAULT '{}',
  description TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(chat_id, skill_name)
);
```

- `linked_attr`: 技能检定使用的属性
- `class_name`: 关联职业 — 该职业角色做此技能视为 **熟练**（掷 d20），否则掷 d10
- `race_bonus`: JSON，如 `{"精灵":1,"人类":1}`

### 2.4 `dnd_characters` — 角色卡

```sql
CREATE TABLE IF NOT EXISTS dnd_characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  char_name TEXT NOT NULL,
  race TEXT NOT NULL,
  class TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  hp_max INTEGER NOT NULL DEFAULT 10,
  hp_current INTEGER NOT NULL DEFAULT 10,
  attributes TEXT NOT NULL,
  proficiencies TEXT DEFAULT '[]',
  equipment TEXT DEFAULT '[]',
  rest_short_used INTEGER NOT NULL DEFAULT 0,
  rest_long_used INTEGER NOT NULL DEFAULT 0,
  rest_date TEXT NOT NULL DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(chat_id, user_id)
);
```

- `attributes`: JSON，键名为英文缩写：`{"str":14,"dex":12,"con":13,"int":10,"wis":8,"cha":15}`
- 唯一约束：同一群组内一个用户只能有一个角色

### 2.5 `dnd_gm` — GM 列表

```sql
CREATE TABLE IF NOT EXISTS dnd_gm (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  set_by TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(chat_id, user_id)
);
```

### 2.6 `dnd_dc` — 场景 DC

```sql
CREATE TABLE IF NOT EXISTS dnd_dc (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  dc_value INTEGER NOT NULL DEFAULT 0,
  description TEXT DEFAULT '',
  set_by TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(chat_id)
);
```

每个群组仅一行，INSERT OR REPLACE 更新。

### 2.7 `dnd_item_templates` — 物品模板

```sql
CREATE TABLE IF NOT EXISTS dnd_item_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  name TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK(item_type IN ('装备','消耗品')),
  slot TEXT DEFAULT '',
  attr_bonus TEXT NOT NULL DEFAULT '{}',
  uses INTEGER NOT NULL DEFAULT 0,
  description TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(chat_id, name)
);
```

- `item_type`: `装备` — 可装备到部位 / `消耗品` — 有使用次数
- `slot`: 部位 — head/body/hands/feet/weapon/offhand/accessory
- `attr_bonus`: JSON，如 `{"力量":2,"敏捷":-1}`
- `uses`: 消耗品次数（0=无限）

### 2.8 `dnd_inventory` — 玩家背包

```sql
CREATE TABLE IF NOT EXISTS dnd_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  template_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  equipped INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (template_id) REFERENCES dnd_item_templates(id)
);
CREATE INDEX IF NOT EXISTS idx_inv_user ON dnd_inventory(chat_id, user_id);
CREATE INDEX IF NOT EXISTS idx_inv_equip ON dnd_inventory(chat_id, user_id, equipped);
```

---

## 三、预设数据

### 3.1 种族

| 种族 | 属性加值 | 描述 |
|------|---------|------|
| 人类 | 全属性+1 | 多才多艺的人类做什么都合适 |
| 精灵 | 敏捷+2, 智力+1 | 精灵们行动优雅，身形矫健 |

> 精灵两条记录合并为 `{"敏捷":2,"智力":1}`

### 3.2 职业

| 职业 | 主属性 | 生命骰 | 描述 |
|------|--------|--------|------|
| 战士 | 力量 | d10 | 战士依靠力量使用各种武器 |
| 法师 | 智力 | d6 | 法师依靠智慧掌控魔法 |

### 3.3 技能

| 技能 | 关联属性 | 关联职业 | 种族加值 | 描述 |
|------|---------|---------|---------|------|
| 扑倒 | 敏捷 | 战士 | 精灵+1 | 扑倒目标之后，做什么都很方便了 |
| 挥拳 | 力量 | 战士 | 人类+1 | 拳头也是交流感情的一种方法 |

---

## 四、命令详细设计

### 4.1 `/dnd` — 游戏帮助
- 列出本群所有可用种族（含加值和描述）
- 列出本群所有可用职业（含主属性和描述）
- 列出本群所有技能
- 带快捷按钮: `/new`, `/char`, `/skills`, `/rest`

### 4.2 `/new <种族> <职业> <角色名>` — 创建角色
- 前两个参数为种族和职业，剩余所有文本作为角色名（可含空格）
- 示例: `/new 精灵 法师 拉斐尔` → 种族=精灵, 职业=法师, 角色名=拉斐尔
- 流程: 校验种族/职业 → 检查已有角色 → 掷属性 4d6k3 × 6 → 种族加值 → HP = hit_die + CON调整 → 职业熟练技能 → 写入 DB → 回复角色卡 + 重骰按钮

### 4.3 `/char` — 查看角色卡
- 完整显示: 属性/调整值、HP、XP、等级、职业技能列表、装备

### 4.4 `/skill <技能名>` — 技能检定
- 熟练（class匹配）→ d20，否则 d10
- + 种族加值 + 属性调整值
- 对比当前 DC → 成功/失败
- 调用 Cloudflare AI 生成 RP 描述

### 4.5 `/skills` — 技能列表
- 全部技能 + 当前角色调整值 + 熟练标记 ✔

### 4.6 `/rest` — 休息
- `/rest short`: 恢复 hit_die + CON调整 HP，每日 2 次
- `/rest long`: 满血，每日 1 次

---

## 五、GM 命令（`/gm` 统一入口）

所有子命令由 `dndGm.ts` 的 `handleDndGm` 解析 `parsed.args` 路由。

| args[0] | 参数 | 权限 |
|---------|------|------|
| `种族` | 无 → 列出所有种族 | GM |
| `种族加值` | `<种族> <+N属性> <描述>` | GM |
| `职业` | 无 → 列出 | GM |
| `职业` (设置) | `<职业> <主属性> [生命骰] <描述>` | GM |
| `技能` | 无 → 列出 | GM |
| `技能` (设置) | `<技能> <种族+N> <职业> <属性> <描述>` | GM |
| `dc` | `<值> <描述>` | GM |
| `addxp` | 回复 + `<数值>` | GM |
| `setgm` | 回复某人 | 仅超管 8080375150 |
| `item create` | `<名> 装备/消耗品 [部位] [+N属性] [次数] <描述>` | GM |
| `item list / delete / give` | 列出/删除/发放 | GM |

---

## 六、属性系统

| 中文 | 英文 | 缩写(key) |
|------|------|-----------|
| 力量 | Strength | str |
| 敏捷 | Dexterity | dex |
| 体质 | Constitution | con |
| 智力 | Intelligence | int |
| 感知 | Wisdom | wis |
| 魅力 | Charisma | cha |

**调整值公式**: `Math.floor((value - 10) / 2)`

**4d6k3**: 掷 4 个 d6，取最高的 3 个求和。

**属性加值解析**: `/gm 种族加值 精灵 +1敏捷` → `敏捷 +1`；支持逗号分隔 `+2敏捷,+1智力`。

---

## 七、文件清单

| 文件 | 用途 |
|------|------|
| `docs/dnd-design.md` | 本设计文档 |
| `src/data/dndPresets.ts` | 预设常量（种族/职业/技能） |
| `src/lib/dndCore.ts` | 公共逻辑：roll4d6k3、calcMod、GM校验、DC读写 |
| `src/commands/dndHelp.ts` | `/dnd` 帮助 |
| `src/commands/dndNew.ts` | `/new` + `handleDndRerollCallback` |
| `src/commands/dndChar.ts` | `/char` 角色卡 |
| `src/commands/dndSkill.ts` | `/skill` 检定 |
| `src/commands/dndSkills.ts` | `/skills` 列表 |
| `src/commands/dndRest.ts` | `/rest` 休息 |
| `src/commands/dndGm.ts` | `/gm` 全部子命令 |
| `src/lib/itemCore.ts` | 物品模板/背包 CRUD、装备加成计算 |
| `test/commands/dndNew.spec.ts` | 测试 |
| `test/commands/dndSkill.spec.ts` | 测试 |
| `test/commands/dndGm.spec.ts` | 测试 |

### 修改文件
- `src/index.ts` — `loadCommand()` 添加 8 个 case；`loadCallback()` 添加 `dnd_reroll`/`dnd_confirm`/`item_action`
- `src/routes.ts` — `COMMAND_ROUTES` 添加 `/gm`（deleteMsg: false）
- `src/commands/item.ts` — `handleItemCallback` 按钮背包回调
- `src/commands/dndChar.ts` — 装备加成显示
- `src/commands/dndSkill.ts` — 技能检定 AI 叙事 + PVP 对抗 + 装备加成

---

## 八、API 设计（dndCore.ts 导出的函数）

| 函数 | 签名 | 说明 |
|------|------|------|
| `roll4d6k3()` | `() => number` | 4d6 取最高 3 |
| `rollD6()` | `() => number` | 单次 d6 |
| `rollD20()` | `() => number` | 单次 d20 |
| `rollD10()` | `() => number` | 单次 d10 |
| `calcMod(val)` | `(number) => number` | 属性调整值 |
| `attrNameToKey(name)` | `(string) => string` | "力量"→"str" |
| `attrKeyToName(key)` | `(string) => string` | "str"→"力量" |
| `parseAttrBonus(text)` | `(string) => Record<string,number>` | "+2敏捷,+1智力"→{敏捷:2,智力:1} |
| `checkIsGM(env, chatId, userId)` | `async (Env,string,string) => boolean` | GM 权限校验 |
| `checkIsSuperAdmin(userId)` | `(string) => boolean` | 超管校验 |
| `getDC(env, chatId)` | `async (Env,string) => {dc,desc} \| null` | 读取场景 DC |
| `setDC(env, chatId, dc, desc, setBy)` | `async` | 设置场景 DC |
| `loadRaceBonuses(env, chatId, raceName)` | `async` → `Record<string,number>` | 查询种族加值 |
