/**
 * @file src/commands/dndCast.ts
 * @description /cast <魔法名> 和 *魔法名 — 施放魔法。
 *   消耗法力、骰伤害/治疗、扣减/恢复目标 HP。
 */

import TgMessage, { ParsedUpdate } from '../lib/tgMessage';
import { escapeHtml, deleteMarkup } from '../lib/util';
import type { Env } from '../index';
import {
  getCharacter, parseAttributes, calcMod, rollD20,
  attrNameToKey, type DndSkillRow, type DndCharacterRow,
} from '../lib/dndCore';
import { rollWeaponDamage, getWeaponEquipBonus } from '../lib/itemCore';

async function findSkill(env: Env, chatId: number, name: string): Promise<DndSkillRow | null> {
  if (!env.DB) return null;
  return await env.DB.prepare(
    `SELECT * FROM dnd_skills WHERE chat_id = ? AND skill_name = ?`
  ).bind(String(chatId), name).first<DndSkillRow>() ?? null;
}

/** 计算目标 AC */
async function calcTargetAC(env: Env, chatId: number, userId: string): Promise<number> {
  if (!env.DB) return 10;
  const char = await getCharacter(env, chatId, userId);
  if (!char) return 10;
  const attrs = parseAttributes(char.attributes);
  const dexMod = calcMod(attrs.dex);
  const rows = await env.DB.prepare(
    `SELECT tpl.attr_bonus FROM dnd_inventory inv JOIN dnd_item_templates tpl ON inv.template_id = tpl.id
     WHERE inv.chat_id = ? AND inv.user_id = ? AND inv.equipped = 1`
  ).bind(String(chatId), userId).all<{ attr_bonus: string }>();
  let equipDex = 0;
  for (const row of (rows.results ?? [])) {
    try { const b: Record<string, number> = JSON.parse(row.attr_bonus); if (b['敏捷']) equipDex += b['敏捷']; } catch {}
  }
  return 10 + dexMod + equipDex;
}

export async function performCast(
  env: Env, chatId: number, threadId: number | undefined,
  userId: string, spellName: string,
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

  // 每日法力重置
  const today = new Date().toISOString().split('T')[0];
  if (char.mana_date !== today) {
    char.mana_current = char.mana_max;
    char.mana_date = today;
    await env.DB.prepare(
      `UPDATE dnd_characters SET mana_current = ?, mana_date = ? WHERE chat_id = ? AND user_id = ?`
    ).bind(char.mana_current, today, String(chatId), userId).run();
  }

  const skill = await findSkill(env, chatId, spellName);
  if (!skill) {
    await TgMessage.sendText(env, { chat_id: chatId, text: `⚠️ 魔法「${escapeHtml(spellName)}」不存在。`, parse_mode: 'HTML', message_thread_id: threadId, reply_markup: deleteMarkup });
    return;
  }

  // 检查法力
  if (skill.mana_cost > 0 && char.mana_current < skill.mana_cost) {
    await TgMessage.sendText(env, { chat_id: chatId, text: `⚠️ 法力不足！当前 ${char.mana_current}/${char.mana_max}，需要 ${skill.mana_cost} MP。`, message_thread_id: threadId, reply_markup: deleteMarkup });
    return;
  }

  // 扣法力
  if (skill.mana_cost > 0) {
    char.mana_current -= skill.mana_cost;
    await env.DB.prepare(
      `UPDATE dnd_characters SET mana_current = ? WHERE chat_id = ? AND user_id = ?`
    ).bind(char.mana_current, String(chatId), userId).run();
  }

  // 若无 damage，纯检定 → 走技能逻辑
  if (!skill.damage) {
    const { performSkillCheck } = await import('./dndSkill');
    await performSkillCheck(env, chatId, threadId, userId, spellName, opts);
    return;
  }

  const attrs = parseAttributes(char.attributes);
  const isHeal = skill.damage.includes('heal');

  const attrKeyMap: Record<string, string> = { '力量': 'str', '敏捷': 'dex', '体质': 'con', '智力': 'int', '感知': 'wis', '魅力': 'cha' };

  // 伤害/治疗骰
  const dmgStr = skill.damage.replace(/\s*heal\s*/i, '').trim();
  const weaponEquipBonus = await getWeaponEquipBonus(env, String(chatId), userId);
  const dmg = rollWeaponDamage(dmgStr, attrs, weaponEquipBonus);

  // 攻击掷骰
  const attackRoll = rollD20();
  let attrMod = 0;
  const m = dmgStr.match(/([力量敏捷体质智力感知魅力]+)$/);
  if (m) {
    const k = attrKeyMap[m[1]] as keyof typeof attrs | undefined;
    if (k) attrMod = calcMod(attrs[k]);
  }
  const attackTotal = attackRoll + attrMod;

  let text = `🔮 <b>${escapeHtml(spellName)}</b> 施放！`;
  text += `\n💎 MP: ${char.mana_current}/${char.mana_max}`;

  if (isHeal) {
    // 治疗 = 回复目标 HP
    if (opts?.targetUserId) {
      const target = await getCharacter(env, chatId, opts.targetUserId);
      if (target) {
        const newHp = Math.min(target.hp_max, target.hp_current + dmg.total);
        await env.DB.prepare(
          `UPDATE dnd_characters SET hp_current = ? WHERE chat_id = ? AND user_id = ?`
        ).bind(newHp, String(chatId), opts.targetUserId).run();
        text += `\n💚 ${escapeHtml(target.char_name)} 回复 ${dmg.total} HP → ${newHp}/${target.hp_max}`;
      }
    } else {
      // 自治疗
      const newHp = Math.min(char.hp_max, char.hp_current + dmg.total);
      await env.DB.prepare(
        `UPDATE dnd_characters SET hp_current = ? WHERE chat_id = ? AND user_id = ?`
      ).bind(newHp, String(chatId), userId).run();
      text += `\n💚 自愈 ${dmg.total} HP → ${newHp}/${char.hp_max}`;
    }
  } else if (opts?.targetUserId) {
    // 攻击魔法
    const targetAC = await calcTargetAC(env, chatId, opts.targetUserId);
    const hit = attackTotal > targetAC;
    text += `\n🎯 命中：d20(${attackRoll}) + 属性(${attrMod >= 0 ? '+' : ''}${attrMod}) = ${attackTotal}`;
    text += `\n🛡️ ${escapeHtml(opts.targetName || '目标')} AC: ${targetAC} → ${hit ? '✅ 命中！' : '❌ 未命中'}`;

    if (hit) {
      const target = await getCharacter(env, chatId, opts.targetUserId);
      if (target) {
        const newHp = Math.max(0, target.hp_current - dmg.total);
        await env.DB.prepare(
          `UPDATE dnd_characters SET hp_current = ? WHERE chat_id = ? AND user_id = ?`
        ).bind(newHp, String(chatId), opts.targetUserId).run();
        text += `\n💥 伤害：${dmg.diceLabel} + 属性(${attrMod >= 0 ? '+' : ''}${attrMod}) = <b>${dmg.total}</b>`;
        text += `\n❤️ ${escapeHtml(target.char_name)} HP: ${target.hp_current} → ${newHp}`;
      }
    }
  } else {
    text += `\n💥 伤害：${dmg.diceLabel} + 属性(${attrMod >= 0 ? '+' : ''}${attrMod}) = <b>${dmg.total}</b>`;
    text += `\n（无目标，伤害不生效）`;
  }

  const sendOpts: any = { chat_id: chatId, text, parse_mode: 'HTML', message_thread_id: threadId, reply_markup: deleteMarkup };
  if (opts?.replyToMessageId) sendOpts.reply_to_message_id = opts.replyToMessageId;
  await TgMessage.sendText(env, sendOpts);

  if (opts?.deleteMsgId) {
    try { await TgMessage.deleteMessage(env, chatId, opts.deleteMsgId); } catch {}
  }
}

// ── /cast 命令入口 ────────────────────────────────────────

export async function handleDndCast(parsed: ParsedUpdate, env: Env): Promise<void> {
  const chatId = parsed.chatId!;
  const threadId = parsed.threadId;
  const userId = String(parsed.from?.id ?? '');
  const args = parsed.args ?? [];
  const spellName = args.join(' ').trim();

  const opts: any = {};
  if (parsed.isReply && parsed.replyToMessage?.from && !parsed.replyToMessage.from.is_bot) {
    opts.replyToMessageId = parsed.replyToMessage.message_id;
    opts.targetUserId = String(parsed.replyToMessage.from.id);
    opts.targetName = parsed.replyToMessage.from.first_name || opts.targetUserId;
  }

  await performCast(env, chatId, threadId, userId, spellName, opts);
}
