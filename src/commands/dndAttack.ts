/**
 * @file src/commands/dndAttack.ts
 * @description /attack <武器名> 和 *武器名 — 攻击检定。
 *   回复目标 → 攻击目标角色；非回复 → 无目标（只显示命中+伤害）。
 */

import TgMessage, { ParsedUpdate } from '../lib/tgMessage';
import { escapeHtml, deleteMarkup } from '../lib/util';
import type { Env } from '../index';
import {
  getCharacter, getRaceBonuses, parseAttributes, calcMod, rollD20,
  attrNameToKey, type DndCharacterRow,
} from '../lib/dndCore';
import {
  getEquippedWeapon, getWeaponEquipBonus, rollWeaponDamage,
  parseDamage, type InventoryItem,
} from '../lib/itemCore';

/** 计算目标 AC = 10 + 敏捷调整 + 所有已装备物品属性中的敏捷加值 */
async function calcTargetAC(env: Env, chatId: number, userId: string): Promise<number> {
  if (!env.DB) return 10;
  const char = await getCharacter(env, chatId, userId);
  if (!char) return 10;
  const attrs = parseAttributes(char.attributes);
  const dexMod = calcMod(attrs.dex);

  // 已装备物品的敏捷加值
  const rows = await env.DB.prepare(
    `SELECT tpl.attr_bonus FROM dnd_inventory inv
     JOIN dnd_item_templates tpl ON inv.template_id = tpl.id
     WHERE inv.chat_id = ? AND inv.user_id = ? AND inv.equipped = 1`
  ).bind(String(chatId), userId).all<{ attr_bonus: string }>();
  let equipDex = 0;
  for (const row of (rows.results ?? [])) {
    try {
      const bonuses: Record<string, number> = JSON.parse(row.attr_bonus);
      if (bonuses['敏捷']) equipDex += bonuses['敏捷'];
    } catch {}
  }

  return 10 + dexMod + equipDex;
}

/** 攻击检定主函数 */
export async function performAttack(
  env: Env, chatId: number, threadId: number | undefined,
  userId: string, weaponName: string,
  opts?: { replyToMessageId?: number; targetUserId?: string; targetName?: string; deleteMsgId?: number },
): Promise<void> {
  if (!env.DB) {
    await TgMessage.sendText(env, { chat_id: chatId, text: '⚠️ DND 系统需要 D1 数据库支持，当前环境未配置。', message_thread_id: threadId, reply_markup: deleteMarkup });
    return;
  }

  const char = await getCharacter(env, chatId, userId);
  if (!char) {
    await TgMessage.sendText(env, { chat_id: chatId, text: '⚠️ 你还没有角色。使用 <code>/new</code> 创建。', parse_mode: 'HTML', message_thread_id: threadId, reply_markup: deleteMarkup });
    return;
  }

  // 查找已装备武器
  const weapon = await getEquippedWeapon(env, String(chatId), userId);
  if (!weapon || !weapon.damage) {
    await TgMessage.sendText(env, { chat_id: chatId, text: '⚠️ 你没有装备武器。请先 /item 装备一把武器。', message_thread_id: threadId, reply_markup: deleteMarkup });
    return;
  }

  const attrs = parseAttributes(char.attributes);
  const weaponEquipBonus = await getWeaponEquipBonus(env, String(chatId), userId);

  // 武器属性加值
  const parsedDmg = parseDamage(weapon.damage);
  const attrKeyMap: Record<string, keyof typeof attrs> = { '力量': 'str', '敏捷': 'dex', '体质': 'con', '智力': 'int', '感知': 'wis', '魅力': 'cha' };
  const dmgAttr = parsedDmg.attr ? (attrKeyMap[parsedDmg.attr] ?? 'str') : 'str';
  const attrMod = calcMod(attrs[dmgAttr]);
  const equipAttrBonus = weaponEquipBonus[parsedDmg.attr] ?? 0;

  // 攻击掷骰
  const attackRoll = rollD20();
  const attackTotal = attackRoll + attrMod + equipAttrBonus;
  const attackParts = [`属性(${attrMod >= 0 ? '+' : ''}${attrMod})`];
  if (equipAttrBonus) attackParts.push(`装备(+${equipAttrBonus})`);
  const attackFormula = ` + ${attackParts.join(' + ')}`;

  // 目标
  let targetLine = '';
  let targetAC: number | null = null;
  let targetChar: DndCharacterRow | null = null;
  if (opts?.targetUserId) {
    targetAC = await calcTargetAC(env, chatId, opts.targetUserId);
    targetChar = await getCharacter(env, chatId, opts.targetUserId);
    const hit = attackTotal > targetAC;
    const tgtName = opts.targetName || (targetChar?.char_name || '目标');
    targetLine = `\n🛡️ ${escapeHtml(tgtName)} AC: ${targetAC} → ${hit ? '✅ 命中！' : '❌ 未命中'}`;

    // 命中 → 伤害
    if (hit && targetChar) {
      const dmg = rollWeaponDamage(weapon.damage, attrs, weaponEquipBonus);
      const newHp = Math.max(0, targetChar.hp_current - dmg.total);
      await env.DB.prepare(
        `UPDATE dnd_characters SET hp_current = ?, updated_at = datetime('now') WHERE chat_id = ? AND user_id = ?`
      ).bind(newHp, String(chatId), opts.targetUserId).run();
      targetLine += `\n💥 伤害：${dmg.diceLabel} + 属性(${attrMod >= 0 ? '+' : ''}${attrMod})${equipAttrBonus ? ' + 装备(+' + equipAttrBonus + ')' : ''} = <b>${dmg.total}</b>`;
      targetLine += `\n❤️ ${escapeHtml(targetChar.char_name)} HP: ${targetChar.hp_current} → ${newHp}`;
    }
  }

  const text =
    `⚔️ <b>${escapeHtml(weapon.name)}</b>攻击：d20(${attackRoll})${attackFormula} = <b>${attackTotal}</b>` +
    targetLine;

  const sendOpts: any = { chat_id: chatId, text, parse_mode: 'HTML', message_thread_id: threadId, reply_markup: deleteMarkup };
  if (opts?.replyToMessageId) sendOpts.reply_to_message_id = opts.replyToMessageId;
  await TgMessage.sendText(env, sendOpts);

  if (opts?.deleteMsgId) {
    try { await TgMessage.deleteMessage(env, chatId, opts.deleteMsgId); } catch {}
  }
}

// ── /attack 命令入口 ──────────────────────────────────────

export async function handleDndAttack(parsed: ParsedUpdate, env: Env): Promise<void> {
  const chatId = parsed.chatId!;
  const threadId = parsed.threadId;
  const userId = String(parsed.from?.id ?? '');
  const args = parsed.args ?? [];
  const weaponName = args.join(' ').trim();

  const opts: any = {};
  if (parsed.isReply && parsed.replyToMessage?.from && !parsed.replyToMessage.from.is_bot) {
    opts.replyToMessageId = parsed.replyToMessage.message_id;
    opts.targetUserId = String(parsed.replyToMessage.from.id);
    opts.targetName = parsed.replyToMessage.from.first_name || opts.targetUserId;
  }

  await performAttack(env, chatId, threadId, userId, weaponName, opts);
}
