/**
 * @file src/commands/dndChar.ts
 * @description /char — 查看自己的完整角色卡（属性分行、种族加值、职业特性）。
 */

import TgMessage, { ParsedUpdate } from '../lib/tgMessage';
import { escapeHtml, deleteMarkup } from '../lib/util';
import type { Env } from '../index';
import {
  getCharacter,
  getRaceBonuses,
  getClassInfo,
  parseAttributes,
  calcMod,
  fmtMod,
  attrKeyToName,
  ALL_ATTR_KEYS,
  type DndCharacterRow,
} from '../lib/dndCore';
import { getEquippedBonuses, getUserInventory, getEquippedWeapon, parseDamage, SLOT_NAMES, type EquipSlot } from '../lib/itemCore';

function fmtRaceBonusesText(bonuses: Record<string, number>): string {
  if (!bonuses || Object.keys(bonuses).length === 0) return '';
  return Object.entries(bonuses).map(([k, v]) => `${k}${v >= 0 ? '+' : ''}${v}`).join(', ');
}

function fmtCharSheetFull(
  char: DndCharacterRow,
  raceBonuses: Record<string, number>,
  classPrimaryAttr: string,
  classHitDie: number,
  equipped: Array<{ name: string; slot: string; bonus: string }>,
  equipAttrBonus: Record<string, number>,
): string {
  const attrs = parseAttributes(char.attributes);
  let profs: string[] = [];
  let equip: string[] = [];
  try { profs = JSON.parse(char.proficiencies); } catch {}
  try { equip = JSON.parse(char.equipment); } catch {}

  const attrLines = ALL_ATTR_KEYS.map(k => {
    const baseVal = attrs[k];
    const equipVal = equipAttrBonus[attrKeyToName(k)] ?? 0;
    const finalVal = baseVal + equipVal;
    const mod = fmtMod(finalVal);
    const modStr = mod === '0' ? '±0' : mod;
    const equipNote = equipVal !== 0 ? ` <i>[${equipVal >= 0 ? '+' : ''}${equipVal}装备]</i>` : '';
    return `  ${escapeHtml(attrKeyToName(k))}  <b>${finalVal}</b>  (${modStr})${equipNote}`;
  }).join('\n');

  const raceLine = fmtRaceBonusesText(raceBonuses);

  return (
    `📜 <b>${escapeHtml(char.char_name)}</b>\n` +
    `🎭 ${escapeHtml(char.class)} | ${escapeHtml(char.race)}  Lv.${char.level}\n` +
    `❤️ HP: ${char.hp_current}/${char.hp_max}\n` +
    `⭐ XP: ${char.xp}\n` +
    (raceLine ? `🧬 种族加值: ${escapeHtml(raceLine)}\n` : '') +
    `⚔️ 职业: 主属性 ${escapeHtml(classPrimaryAttr)} | 生命骰 d${classHitDie}\n\n` +
    `<b>📊 属性</b>\n` +
    attrLines + '\n\n' +
    (equipped.length > 0
      ? `<b>🛡️ 已装备</b>\n` + equipped.map(e => `  ${escapeHtml(e.slot)} ${escapeHtml(e.name)}${e.bonus ? ' (' + escapeHtml(e.bonus) + ')' : ''}`).join('\n') + '\n\n'
      : '') +
    `<b>🏹 技能熟练</b>\n` +
    (profs.length > 0 ? profs.map(s => `  ✔ ${escapeHtml(s)}`).join('\n') : '  暂无') + '\n\n' +
    `<b>🎒 装备</b>\n` +
    (equip.length > 0 ? equip.map(e => `  • ${escapeHtml(e)}`).join('\n') : '  暂无')
  );
}

export async function handleDndChar(parsed: ParsedUpdate, env: Env): Promise<void> {
  const chatId = parsed.chatId!;
  const threadId = parsed.threadId;
  const userId = String(parsed.from?.id ?? '');

  if (!env.DB) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: '⚠️ DND 系统需要 D1 数据库支持，当前环境未配置。',
      message_thread_id: threadId,
    });
    return;
  }

  const char = await getCharacter(env, chatId, userId);
  if (!char) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: '⚠️ 你还没有角色。使用 <code>/new 种族 职业 角色名</code> 创建。',
      parse_mode: 'HTML',
      message_thread_id: threadId,
      reply_markup: deleteMarkup,
    });
    return;
  }

  // 查询种族加值、职业信息、装备加成
  const [raceBonuses, classInfo, inventory, equipAttrBonus, weapon] = await Promise.all([
    getRaceBonuses(env, chatId, char.race),
    getClassInfo(env, chatId, char.class),
    getUserInventory(env, String(chatId), userId),
    getEquippedBonuses(env, String(chatId), userId),
    getEquippedWeapon(env, String(chatId), userId),
  ]);

  const equipped = inventory
    .filter(i => i.equipped)
    .map(i => {
      let bonus = '';
      try {
        const b: Record<string, number> = JSON.parse(i.attr_bonus);
        bonus = Object.entries(b).map(([k, v]) => `${k}${v >= 0 ? '+' : ''}${v}`).join(',');
      } catch {}
      const slotName = i.slot ? (SLOT_NAMES[i.slot as EquipSlot] ?? i.slot) : '';
      return { name: i.name, slot: slotName, bonus };
    });

  // 拼接武器统计
  let charSheet = fmtCharSheetFull(char, raceBonuses ?? {}, classInfo?.primary_attr ?? '?', classInfo?.hit_die ?? 0, equipped, equipAttrBonus);
  if (weapon && weapon.damage) {
    const attrs = parseAttributes(char.attributes);
    const parsed = parseDamage(weapon.damage);
    const attrMap: Record<string, string> = { '力量': 'str', '敏捷': 'dex', '体质': 'con', '智力': 'int', '感知': 'wis', '魅力': 'cha' };
    const k = parsed.attr ? (attrMap[parsed.attr] ?? null) : null;
    const attrMod = k ? calcMod(attrs[k as keyof typeof attrs]) : 0;
    const modStr = attrMod >= 0 ? `+${attrMod}` : `${attrMod}`;
    charSheet += `\n<b>⚔️ 武器</b>\n  ${escapeHtml(weapon.name)}  伤害 ${parsed.dice}${parsed.attr ? '+' + parsed.attr + '(' + modStr + ')' : ''}`;
  }

  await TgMessage.sendText(env, {
    chat_id: chatId,
    text: charSheet,
    parse_mode: 'HTML',
    message_thread_id: threadId,
    reply_markup: deleteMarkup,
  });
}
