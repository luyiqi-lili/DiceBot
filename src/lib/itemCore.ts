/**
 * @file src/lib/itemCore.ts
 * @description 物品系统核心逻辑 — 模板 CRUD、背包 CRUD、装备加成计算、按钮消息生成。
 */

import type { Env } from '../index';
import { calcMod, parseAttributes, rollD, type DndCharAttributes } from './dndCore';

// ── 类型 ──────────────────────────────────────────────────

export interface ItemTemplate {
  id: number;
  chat_id: string;
  name: string;
  item_type: '装备' | '消耗品';
  slot: string;
  attr_bonus: string;  // JSON
  damage: string;      // "1d8力量"
  uses: number;
  description: string;
}

export interface InventoryItem {
  id: number;
  chat_id: string;
  user_id: string;
  template_id: number;
  quantity: number;
  equipped: number;
  name: string;
  item_type: string;
  slot: string;
  attr_bonus: string;
  damage: string;
  uses: number;
  description: string;
}

export const EQUIP_SLOTS = ['head', 'body', 'hands', 'feet', 'weapon', 'offhand', 'accessory'] as const;
export type EquipSlot = typeof EQUIP_SLOTS[number];

export const SLOT_NAMES: Record<EquipSlot, string> = {
  head: '头部',
  body: '身体',
  hands: '手部',
  feet: '脚部',
  weapon: '武器',
  offhand: '副手',
  accessory: '饰品',
};

// ── 模板 CRUD ─────────────────────────────────────────────

export async function createTemplate(
  env: Env, chatId: string,
  name: string, itemType: '装备' | '消耗品',
  slot: string, attrBonus: Record<string,number>, damage: string, uses: number, description: string,
): Promise<void> {
  if (!env.DB) return;
  await env.DB.prepare(
    `INSERT OR REPLACE INTO dnd_item_templates (chat_id, name, item_type, slot, attr_bonus, damage, uses, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(chatId, name, itemType, slot, JSON.stringify(attrBonus), damage, uses, description).run();
}

export async function getAllTemplates(env: Env, chatId: string): Promise<ItemTemplate[]> {
  if (!env.DB) return [];
  const r = await env.DB.prepare(
    `SELECT * FROM dnd_item_templates WHERE chat_id = ? ORDER BY item_type, name`
  ).bind(chatId).all<ItemTemplate>();
  return r.results ?? [];
}

export async function getTemplate(env: Env, chatId: string, name: string): Promise<ItemTemplate | null> {
  if (!env.DB) return null;
  return await env.DB.prepare(
    `SELECT * FROM dnd_item_templates WHERE chat_id = ? AND name = ?`
  ).bind(chatId, name).first<ItemTemplate>() ?? null;
}

export async function deleteTemplate(env: Env, chatId: string, name: string): Promise<boolean> {
  if (!env.DB) return false;
  const r = await env.DB.prepare(
    `DELETE FROM dnd_item_templates WHERE chat_id = ? AND name = ?`
  ).bind(chatId, name).run();
  return r.meta.changes > 0;
}

// ── 背包 CRUD ─────────────────────────────────────────────

export async function addToInventory(
  env: Env, chatId: string, userId: string, templateId: number, quantity: number,
): Promise<void> {
  if (!env.DB) return;
  // 已有同类物品则叠加数量
  const existing = await env.DB.prepare(
    `SELECT id, quantity FROM dnd_inventory WHERE chat_id = ? AND user_id = ? AND template_id = ?`
  ).bind(chatId, userId, templateId).first<{id:number;quantity:number}>();
  if (existing) {
    await env.DB.prepare(
      `UPDATE dnd_inventory SET quantity = ? WHERE id = ?`
    ).bind(existing.quantity + quantity, existing.id).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO dnd_inventory (chat_id, user_id, template_id, quantity) VALUES (?, ?, ?, ?)`
    ).bind(chatId, userId, templateId, quantity).run();
  }
}

export async function getUserInventory(
  env: Env, chatId: string, userId: string,
): Promise<InventoryItem[]> {
  if (!env.DB) return [];
  const r = await env.DB.prepare(
    `SELECT inv.*, tpl.name, tpl.item_type, tpl.slot, tpl.attr_bonus, tpl.damage, tpl.uses, tpl.description
     FROM dnd_inventory inv
     JOIN dnd_item_templates tpl ON inv.template_id = tpl.id
     WHERE inv.chat_id = ? AND inv.user_id = ?
     ORDER BY inv.equipped DESC, tpl.item_type, tpl.slot, tpl.name`
  ).bind(chatId, userId).all<InventoryItem>();
  return r.results ?? [];
}

export async function getInventoryItem(
  env: Env, chatId: string, invId: number,
): Promise<InventoryItem | null> {
  if (!env.DB) return null;
  return await env.DB.prepare(
    `SELECT inv.*, tpl.name, tpl.item_type, tpl.slot, tpl.attr_bonus, tpl.damage, tpl.uses, tpl.description
     FROM dnd_inventory inv
     JOIN dnd_item_templates tpl ON inv.template_id = tpl.id
     WHERE inv.id = ? AND inv.chat_id = ?`
  ).bind(invId, chatId).first<InventoryItem>() ?? null;
}

export async function equipItem(env: Env, chatId: string, userId: string, invId: number): Promise<string | null> {
  if (!env.DB) return null;
  const item = await getInventoryItem(env, chatId, invId);
  if (!item || item.item_type !== '装备') return '该物品不是装备';
  if (item.equipped) return '该物品已装备';

  // 同部位先卸
  if (item.slot) {
    await env.DB.prepare(
      `UPDATE dnd_inventory SET equipped = 0
       WHERE chat_id = ? AND user_id = ? AND equipped = 1
       AND template_id IN (SELECT id FROM dnd_item_templates WHERE slot = ?)`
    ).bind(chatId, userId, item.slot).run();
  }

  await env.DB.prepare(
    `UPDATE dnd_inventory SET equipped = 1 WHERE id = ?`
  ).bind(invId).run();
  return null;
}

export async function unequipItem(env: Env, chatId: string, invId: number): Promise<string | null> {
  if (!env.DB) return null;
  const item = await getInventoryItem(env, chatId, invId);
  if (!item || !item.equipped) return '该物品未装备';
  await env.DB.prepare(`UPDATE dnd_inventory SET equipped = 0 WHERE id = ?`).bind(invId).run();
  return null;
}

export async function useConsumable(env: Env, chatId: string, invId: number): Promise<string | null> {
  if (!env.DB) return null;
  const item = await getInventoryItem(env, chatId, invId);
  if (!item || item.item_type !== '消耗品') return '该物品不是消耗品';

  if (item.uses > 0) {
    // 有限次数
    if (item.quantity <= 1) {
      await env.DB.prepare(`DELETE FROM dnd_inventory WHERE id = ?`).bind(invId).run();
    } else {
      await env.DB.prepare(`UPDATE dnd_inventory SET quantity = quantity - 1 WHERE id = ?`).bind(invId).run();
    }
  }
  // uses=0 无限使用，不消耗
  return null;
}

export async function sendItem(
  env: Env, chatId: string, fromUserId: string, toUserId: string,
  invId: number, qty: number,
): Promise<string | null> {
  if (!env.DB) return null;
  const item = await getInventoryItem(env, chatId, invId);
  if (!item) return '物品不存在';
  if (item.equipped) return '请先卸下已装备的物品再赠送';

  qty = Math.min(qty, item.quantity);
  if (qty <= 0) return null;

  if (item.quantity <= qty) {
    await env.DB.prepare(`DELETE FROM dnd_inventory WHERE id = ?`).bind(invId).run();
  } else {
    await env.DB.prepare(`UPDATE dnd_inventory SET quantity = quantity - ? WHERE id = ?`).bind(qty, invId).run();
  }

  await addToInventory(env, chatId, toUserId, item.template_id, qty);
  return null;
}

// ── 装备加成计算 ──────────────────────────────────────────

/** 获取角色已装备物品的属性加成总和（中文属性名 → 加值） */
export async function getEquippedBonuses(
  env: Env, chatId: string, userId: string,
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  if (!env.DB) return result;

  const rows = await env.DB.prepare(
    `SELECT tpl.attr_bonus FROM dnd_inventory inv
     JOIN dnd_item_templates tpl ON inv.template_id = tpl.id
     WHERE inv.chat_id = ? AND inv.user_id = ? AND inv.equipped = 1`
  ).bind(chatId, userId).all<{attr_bonus:string}>();

  for (const row of (rows.results ?? [])) {
    try {
      const bonus: Record<string, number> = JSON.parse(row.attr_bonus);
      for (const [k, v] of Object.entries(bonus)) {
        result[k] = (result[k] ?? 0) + v;
      }
    } catch {}
  }
  return result;
}

// ── 武器相关 ──────────────────────────────────────────────

/** 获取已装备的武器（weapon slot）*/
export async function getEquippedWeapon(
  env: Env, chatId: string, userId: string,
): Promise<InventoryItem | null> {
  if (!env.DB) return null;
  return await env.DB.prepare(
    `SELECT inv.*, tpl.name, tpl.item_type, tpl.slot, tpl.attr_bonus, tpl.damage, tpl.uses, tpl.description
     FROM dnd_inventory inv
     JOIN dnd_item_templates tpl ON inv.template_id = tpl.id
     WHERE inv.chat_id = ? AND inv.user_id = ? AND inv.equipped = 1 AND tpl.slot = 'weapon'`
  ).bind(chatId, userId).first<InventoryItem>() ?? null;
}

/** 解析伤害骰文本 "1d8力量" → {dice:"1d8", attr:"力量"} | "2d6" → {dice:"2d6", attr:""} */
export function parseDamage(damageStr: string): { dice: string; attr: string } {
  if (!damageStr) return { dice: '1d4', attr: '' };
  const m = damageStr.match(/^(\d*d\d+|d\d+)([力量敏捷体质智力感知魅力]*)$/);
  if (!m) return { dice: '1d4', attr: '' };
  return { dice: m[1], attr: m[2] || '' };
}

/** 掷武器伤害 = 骰子部分 + 属性调整值 */
export function rollWeaponDamage(damageStr: string, attrs: DndCharAttributes, attrBonus: Record<string, number>): { total: number; diceLabel: string } {
  const parsed = parseDamage(damageStr);
  // 解析骰子: "1d8" → 1个d8
  const diceMatch = parsed.dice.match(/^(\d*)d(\d+)$/);
  let diceTotal = 0;
  let diceLabel = parsed.dice;
  if (diceMatch) {
    const count = diceMatch[1] ? parseInt(diceMatch[1]) : 1;
    const faces = parseInt(diceMatch[2]);
    const rolls: number[] = [];
    for (let i = 0; i < count; i++) rolls.push(rollD(faces));
    diceTotal = rolls.reduce((a, b) => a + b, 0);
    diceLabel = `${count}d${faces}(${rolls.join('+')})`;
  }
  let attrTotal = 0;
  if (parsed.attr) {
    const keyMap: Record<string, keyof DndCharAttributes> = {
      '力量': 'str', '敏捷': 'dex', '体质': 'con', '智力': 'int', '感知': 'wis', '魅力': 'cha',
    };
    const k = keyMap[parsed.attr];
    if (k) attrTotal = calcMod(attrs[k]) + (attrBonus[parsed.attr] ?? 0);
  }
  return { total: diceTotal + attrTotal, diceLabel };
}

/** 获取角色已装备物品中 weapon 部位的 attr_bonus 合并 */
export async function getWeaponEquipBonus(env: Env, chatId: string, userId: string): Promise<Record<string, number>> {
  if (!env.DB) return {};
  const rows = await env.DB.prepare(
    `SELECT tpl.attr_bonus FROM dnd_inventory inv
     JOIN dnd_item_templates tpl ON inv.template_id = tpl.id
     WHERE inv.chat_id = ? AND inv.user_id = ? AND inv.equipped = 1 AND tpl.slot = 'weapon'`
  ).bind(chatId, userId).all<{ attr_bonus: string }>();
  const result: Record<string, number> = {};
  for (const row of (rows.results ?? [])) {
    try {
      const bonus: Record<string, number> = JSON.parse(row.attr_bonus);
      for (const [k, v] of Object.entries(bonus)) result[k] = (result[k] ?? 0) + v;
    } catch {}
  }
  return result;
}
