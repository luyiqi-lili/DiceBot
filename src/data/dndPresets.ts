/**
 * @file src/data/dndPresets.ts
 * @description DND 跑团系统预设数据 — 种族、职业、技能的默认定义。
 *   当群组中尚未配置自定义数据时作为回退（/dnd 帮助展示用），
 *   以及 /gm init 初始化时写入 D1 的数据源。
 */

// ── 种族预设 ──────────────────────────────────────────────

/** 预设种族定义 */
export const PRESET_RACES: Array<{
  race_name: string;
  attr_bonuses: Record<string, number>;
  description: string;
}> = [
  {
    race_name: '人类',
    attr_bonuses: { '力量': 1, '敏捷': 1, '体质': 1, '智力': 1, '感知': 1, '魅力': 1 },
    description: '多才多艺的人类做什么都合适',
  },
  {
    race_name: '精灵',
    // 精灵两条规则合并：敏捷+2, 智力+1
    attr_bonuses: { '敏捷': 2, '智力': 1 },
    description: '精灵们行动优雅，身形矫健，长时间的学习让他们掌握了很多知识',
  },
];

// ── 职业预设 ──────────────────────────────────────────────

/** 预设职业定义 */
export const PRESET_CLASSES: Array<{
  class_name: string;
  primary_attr: string;
  hit_die: number;
  description: string;
}> = [
  {
    class_name: '战士',
    primary_attr: '力量',
    hit_die: 10,
    description: '战士依靠力量使用各种武器',
  },
  {
    class_name: '法师',
    primary_attr: '智力',
    hit_die: 6,
    description: '法师依靠智慧掌控魔法',
  },
];

// ── 技能预设 ──────────────────────────────────────────────

/** 预设技能定义 */
export const PRESET_SKILLS: Array<{
  skill_name: string;
  linked_attr: string;
  class_name: string;
  race_bonus: Record<string, number>;
  damage: string;
  mana_cost: number;
  spell_level: number;
  description: string;
}> = [
  {
    skill_name: '扑倒',
    linked_attr: '敏捷',
    class_name: '战士',
    race_bonus: { '精灵': 1 },
    damage: '',
    mana_cost: 0,
    spell_level: 1,
    description: '扑倒目标之后，做什么都很方便了',
  },
  {
    skill_name: '挥拳',
    linked_attr: '力量',
    class_name: '战士',
    race_bonus: { '人类': 1 },
    damage: '',
    mana_cost: 0,
    spell_level: 1,
    description: '拳头也是交流感情的一种方法',
  },
  {
    skill_name: '火球术',
    linked_attr: '智力',
    class_name: '法师',
    race_bonus: { '人类': 1 },
    damage: '2d6智力',
    mana_cost: 3,
    spell_level: 1,
    description: '指尖凝聚火焰掷向敌人',
  },
  {
    skill_name: '治疗术',
    linked_attr: '感知',
    class_name: '牧师',
    race_bonus: {},
    damage: '1d8智力 heal',
    mana_cost: 2,
    spell_level: 1,
    description: '柔和的光芒包裹目标，加速伤口愈合',
  },
];
