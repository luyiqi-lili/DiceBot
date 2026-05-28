/**
 * @file src/lib/dndCore.ts
 * @description DND 跑团系统核心逻辑库。
 *   提供掷骰、属性调整值计算、GM 权限校验、DC 读写、
 *   种族/职业/技能 D1 CRUD 等公共函数。
 */

import type { Env } from '../index';
import { PRESET_RACES, PRESET_CLASSES, PRESET_SKILLS } from '../data/dndPresets';

// ── 类型定义 ──────────────────────────────────────────────

export interface DndRaceRow {
  id: number;
  chat_id: string;
  race_name: string;
  attr_bonuses: string; // JSON
  description: string;
}

export interface DndClassRow {
  id: number;
  chat_id: string;
  class_name: string;
  primary_attr: string;
  hit_die: number;
  description: string;
}

export interface DndSkillRow {
  id: number;
  chat_id: string;
  skill_name: string;
  linked_attr: string;
  class_name: string;
  race_bonus: string; // JSON
  description: string;
}

export interface DndCharacterRow {
  id: number;
  chat_id: string;
  user_id: string;
  char_name: string;
  race: string;
  class: string;
  level: number;
  xp: number;
  hp_max: number;
  hp_current: number;
  attributes: string;   // JSON
  proficiencies: string; // JSON string[]
  equipment: string;     // JSON string[]
  rest_short_used: number;
  rest_long_used: number;
  rest_date: string;
}

export interface DndCharAttributes {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export type AttrKey = keyof DndCharAttributes;

// ── 常量 ──────────────────────────────────────────────────

/** 超级管理员 user_id */
export const SUPER_ADMIN_ID = '8080375150';

/** 属性中文名 → 英文 key 映射 */
const ATTR_NAME_TO_KEY: Record<string, AttrKey> = {
  '力量': 'str',
  '敏捷': 'dex',
  '体质': 'con',
  '智力': 'int',
  '感知': 'wis',
  '魅力': 'cha',
};

/** 属性英文 key → 中文名映射 */
const ATTR_KEY_TO_NAME: Record<AttrKey, string> = {
  str: '力量',
  dex: '敏捷',
  con: '体质',
  int: '智力',
  wis: '感知',
  cha: '魅力',
};

/** 所有属性 key 列表（用于遍历） */
export const ALL_ATTR_KEYS: AttrKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

// ── 掷骰函数 ──────────────────────────────────────────────

/** 掷一个 dN */
export function rollD(n: number): number {
  return Math.floor(Math.random() * n) + 1;
}

export function rollD6(): number { return rollD(6); }
export function rollD10(): number { return rollD(10); }
export function rollD20(): number { return rollD(20); }

/** 4d6k3: 掷 4 个 d6，取最高的 3 个求和 */
export function roll4d6k3(): number {
  const rolls = [rollD6(), rollD6(), rollD6(), rollD6()];
  rolls.sort((a, b) => b - a);
  return rolls[0] + rolls[1] + rolls[2];
}

/** 掷 6 组 4d6k3，返回 6 个值数组 */
export function roll6x4d6k3(): number[] {
  return Array.from({ length: 6 }, () => roll4d6k3());
}

/** Fisher-Yates 洗牌 */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── 属性计算 ──────────────────────────────────────────────

/** 属性调整值 */
export function calcMod(value: number): number {
  return Math.floor((value - 10) / 2);
}

/** 调整值格式化 "+2" / "-1" / "0" */
export function fmtMod(value: number): string {
  const m = calcMod(value);
  return m >= 0 ? `+${m}` : `${m}`;
}

/** 中文属性名 → 英文 key */
export function attrNameToKey(name: string): AttrKey | null {
  return ATTR_NAME_TO_KEY[name] ?? null;
}

/** 英文 key → 中文属性名 */
export function attrKeyToName(key: AttrKey): string {
  return ATTR_KEY_TO_NAME[key];
}

/**
 * 解析属性加值文本。
 * 格式: "+2敏捷,+1智力" 或 "+1力量" 或 "力量+2,敏捷+1"
 * 返回中文属性名 → 数值的 map
 */
export function parseAttrBonus(text: string): Record<string, number> {
  const result: Record<string, number> = {};
  if (!text) return result;

  // 按逗号分割
  const parts = text.split(/[,，]/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // 匹配 +N属性 或 -N属性 或 N属性 或 属性+N
    let m = trimmed.match(/^([+-]?\d+)\s*(.+)$/);
    if (m) {
      const val = parseInt(m[1], 10);
      const name = m[2].trim();
      if (!isNaN(val) && name) {
        result[name] = val;
        continue;
      }
    }

    m = trimmed.match(/^(.+?)\s*([+-]\d+)$/);
    if (m) {
      const name = m[1].trim();
      const val = parseInt(m[2], 10);
      if (!isNaN(val) && name) {
        result[name] = val;
        continue;
      }
    }
  }

  return result;
}

/** 将加值 map 格式化为可读字符串 */
export function fmtAttrBonuses(bonuses: Record<string, number>): string {
  const entries = Object.entries(bonuses).filter(([, v]) => v !== 0);
  if (entries.length === 0) return '无';
  return entries.map(([k, v]) => `${v >= 0 ? '+' : ''}${v}${k}`).join(', ');
}

// ── 权限校验 ──────────────────────────────────────────────

/** 检查是否为超级管理员 */
export function isSuperAdmin(userId: string | number): boolean {
  return String(userId) === SUPER_ADMIN_ID;
}

/**
 * 检查用户是否为群组 GM（或超管）。
 * 超管天然拥有所有 GM 权限。
 */
export async function checkIsGM(
  env: Env,
  chatId: string | number,
  userId: string | number,
): Promise<boolean> {
  if (isSuperAdmin(userId)) return true;
  if (!env.DB) return false;

  const row = await env.DB.prepare(
    `SELECT 1 FROM dnd_gm WHERE chat_id = ? AND user_id = ?`
  )
    .bind(String(chatId), String(userId))
    .first();
  return !!row;
}

/** 校验 GM 权限，失败时返回错误消息字符串；成功返回 null */
export async function requireGM(
  env: Env,
  chatId: string | number,
  userId: string | number,
): Promise<string | null> {
  if (await checkIsGM(env, chatId, userId)) return null;
  return '⛔ 此操作需要 GM 权限。';
}

// ── DC 读写 ───────────────────────────────────────────────

/** 读取当前场景 DC。无 DC 时返回 null */
export async function getDC(
  env: Env,
  chatId: string | number,
): Promise<{ dc_value: number; description: string } | null> {
  if (!env.DB) return null;
  const row = await env.DB.prepare(
    `SELECT dc_value, description FROM dnd_dc WHERE chat_id = ?`
  )
    .bind(String(chatId))
    .first<{ dc_value: number; description: string }>();
  return row ?? null;
}

/** 设置场景 DC（INSERT OR REPLACE） */
export async function setDC(
  env: Env,
  chatId: string | number,
  dcValue: number,
  description: string,
  setBy: string | number,
): Promise<void> {
  if (!env.DB) return;
  await env.DB.prepare(
    `INSERT OR REPLACE INTO dnd_dc (chat_id, dc_value, description, set_by, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  )
    .bind(String(chatId), dcValue, description, String(setBy))
    .run();
}

// ── 角色读写 ──────────────────────────────────────────────

/** 查询用户已有角色 */
export async function getCharacter(
  env: Env,
  chatId: string | number,
  userId: string | number,
): Promise<DndCharacterRow | null> {
  if (!env.DB) return null;
  return await env.DB.prepare(
    `SELECT * FROM dnd_characters WHERE chat_id = ? AND user_id = ?`
  )
    .bind(String(chatId), String(userId))
    .first<DndCharacterRow>() ?? null;
}

/** 写入/更新角色（INSERT OR REPLACE） */
export async function saveCharacter(
  env: Env,
  char: {
    chat_id: string;
    user_id: string;
    char_name: string;
    race: string;
    class: string;
    level?: number;
    xp?: number;
    hp_max: number;
    hp_current: number;
    attributes: DndCharAttributes;
    proficiencies?: string[];
    equipment?: string[];
    rest_short_used?: number;
    rest_long_used?: number;
    rest_date?: string;
  },
): Promise<void> {
  if (!env.DB) return;
  await env.DB.prepare(
    `INSERT OR REPLACE INTO dnd_characters
     (chat_id, user_id, char_name, race, class, level, xp, hp_max, hp_current,
      attributes, proficiencies, equipment,
      rest_short_used, rest_long_used, rest_date, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  )
    .bind(
      char.chat_id,
      char.user_id,
      char.char_name,
      char.race,
      char.class,
      char.level ?? 1,
      char.xp ?? 0,
      char.hp_max,
      char.hp_current,
      JSON.stringify(char.attributes),
      JSON.stringify(char.proficiencies ?? []),
      JSON.stringify(char.equipment ?? []),
      char.rest_short_used ?? 0,
      char.rest_long_used ?? 0,
      char.rest_date ?? '',
    )
    .run();
}

/** 解析角色 attributes JSON 为类型化对象 */
export function parseAttributes(attrStr: string): DndCharAttributes {
  try {
    const obj = JSON.parse(attrStr);
    return {
      str: obj.str ?? 10,
      dex: obj.dex ?? 10,
      con: obj.con ?? 10,
      int: obj.int ?? 10,
      wis: obj.wis ?? 10,
      cha: obj.cha ?? 10,
    };
  } catch {
    return { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  }
}

// ── 种族/职业/技能 D1 查询 ────────────────────────────────

/** 获取某种族加值（中文属性名 → 数值） */
export async function getRaceBonuses(
  env: Env,
  chatId: string | number,
  raceName: string,
): Promise<Record<string, number> | null> {
  if (!env.DB) return null;
  const row = await env.DB.prepare(
    `SELECT attr_bonuses FROM dnd_races WHERE chat_id = ? AND race_name = ?`
  )
    .bind(String(chatId), raceName)
    .first<{ attr_bonuses: string }>();
  if (!row) return null;
  try {
    return JSON.parse(row.attr_bonuses);
  } catch {
    return null;
  }
}

/** 获取职业信息 */
export async function getClassInfo(
  env: Env,
  chatId: string | number,
  className: string,
): Promise<DndClassRow | null> {
  if (!env.DB) return null;
  return await env.DB.prepare(
    `SELECT * FROM dnd_classes WHERE chat_id = ? AND class_name = ?`
  )
    .bind(String(chatId), className)
    .first<DndClassRow>() ?? null;
}

/** 获取某职业的所有技能 */
export async function getSkillsForClass(
  env: Env,
  chatId: string | number,
  className: string,
): Promise<DndSkillRow[]> {
  if (!env.DB) return [];
  const result = await env.DB.prepare(
    `SELECT * FROM dnd_skills WHERE chat_id = ? AND class_name = ?`
  )
    .bind(String(chatId), className)
    .all<DndSkillRow>();
  return result.results ?? [];
}

/** 获取全部技能 */
export async function getAllSkills(
  env: Env,
  chatId: string | number,
): Promise<DndSkillRow[]> {
  if (!env.DB) return [];
  const result = await env.DB.prepare(
    `SELECT * FROM dnd_skills WHERE chat_id = ? ORDER BY skill_name`
  )
    .bind(String(chatId))
    .all<DndSkillRow>();
  return result.results ?? [];
}

/** 获取全部种族 */
export async function getAllRaces(
  env: Env,
  chatId: string | number,
): Promise<DndRaceRow[]> {
  if (!env.DB) return [];
  const result = await env.DB.prepare(
    `SELECT * FROM dnd_races WHERE chat_id = ? ORDER BY race_name`
  )
    .bind(String(chatId))
    .all<DndRaceRow>();
  return result.results ?? [];
}

/** 获取全部职业 */
export async function getAllClasses(
  env: Env,
  chatId: string | number,
): Promise<DndClassRow[]> {
  if (!env.DB) return [];
  const result = await env.DB.prepare(
    `SELECT * FROM dnd_classes WHERE chat_id = ? ORDER BY class_name`
  )
    .bind(String(chatId))
    .all<DndClassRow>();
  return result.results ?? [];
}

// ── 预设数据初始化 ────────────────────────────────────────

/**
 * 将预设数据写入 D1（幂等：已存在的种族/职业/技能不会被覆盖）。
 * 通常在首次 /dnd 或 /gm init 时调用。
 */
export async function initPresetsToDB(env: Env, chatId: string | number): Promise<void> {
  if (!env.DB) return;
  const cid = String(chatId);

  // 种族
  for (const r of PRESET_RACES) {
    const exists = await env.DB.prepare(
      `SELECT 1 FROM dnd_races WHERE chat_id = ? AND race_name = ?`
    ).bind(cid, r.race_name).first();
    if (!exists) {
      await env.DB.prepare(
        `INSERT INTO dnd_races (chat_id, race_name, attr_bonuses, description)
         VALUES (?, ?, ?, ?)`
      ).bind(cid, r.race_name, JSON.stringify(r.attr_bonuses), r.description).run();
    }
  }

  // 职业
  for (const c of PRESET_CLASSES) {
    const exists = await env.DB.prepare(
      `SELECT 1 FROM dnd_classes WHERE chat_id = ? AND class_name = ?`
    ).bind(cid, c.class_name).first();
    if (!exists) {
      await env.DB.prepare(
        `INSERT INTO dnd_classes (chat_id, class_name, primary_attr, hit_die, description)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(cid, c.class_name, c.primary_attr, c.hit_die, c.description).run();
    }
  }

  // 技能
  for (const s of PRESET_SKILLS) {
    const exists = await env.DB.prepare(
      `SELECT 1 FROM dnd_skills WHERE chat_id = ? AND skill_name = ?`
    ).bind(cid, s.skill_name).first();
    if (!exists) {
      await env.DB.prepare(
        `INSERT INTO dnd_skills (chat_id, skill_name, linked_attr, class_name, race_bonus, description)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(cid, s.skill_name, s.linked_attr, s.class_name, JSON.stringify(s.race_bonus), s.description).run();
    }
  }
}

// ── HP 计算 ───────────────────────────────────────────────

/** 计算初始最大 HP = 职业生命骰取满 + CON 调整值（最小为 1） */
export function calcMaxHP(hitDie: number, conMod: number): number {
  return Math.max(1, hitDie + conMod);
}
