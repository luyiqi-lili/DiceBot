/**
 * @file src/commands/dndCast.ts
 * @description /cast <魔法名> 和 *魔法名 — 施放魔法。
 *   消耗法力、骰伤害/治疗、扣减/恢复目标 HP。
 */

import TgMessage, { ParsedUpdate } from '../lib/telegram';
import { escapeHtml, deleteMarkup } from '../lib/util';
import type { Env } from '../index';
import {
  getCharacter, parseAttributes, calcMod, rollD20, rollD10,
  attrNameToKey, type DndSkillRow, type DndCharacterRow,
} from '../lib/dndCore';
import { rollWeaponDamage, getWeaponEquipBonus } from '../lib/itemCore';

async function findSkill(env: Env, chatId: number, name: string): Promise<DndSkillRow | null> {
  if (!env.DB) return null;
  return await env.DB.prepare(
    `SELECT * FROM dnd_skills WHERE chat_id = ? AND skill_name = ?`
  ).bind(String(chatId), name).first<DndSkillRow>() ?? null;
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
  let profs: string[] = [];
  try { profs = JSON.parse(char.proficiencies); } catch {}
  const isProficient = profs.includes(skill.skill_name);

  const attrKeyMap: Record<string, string> = { '力量': 'str', '敏捷': 'dex', '体质': 'con', '智力': 'int', '感知': 'wis', '魅力': 'cha' };

  // 伤害/治疗骰
  const dmgStr = skill.damage.replace(/\s*heal\s*/i, '').trim();
  const weaponEquipBonus = await getWeaponEquipBonus(env, String(chatId), userId);
  const dmg = rollWeaponDamage(dmgStr, attrs, weaponEquipBonus);

  // 攻击方属性调整值（取 damage 中指定的属性，如 2d6智力 → 智力）
  let attrMod = 0;
  const m = dmgStr.match(/([力量敏捷体质智力感知魅力]+)$/);
  if (m) {
    const k = attrKeyMap[m[1]] as keyof typeof attrs | undefined;
    if (k) attrMod = calcMod(attrs[k]);
  }

  // 攻击方种族加值
  let attackerRaceBonus = 0;
  try {
    const rb: Record<string, number> = JSON.parse(skill.race_bonus);
    if (rb[char.race]) attackerRaceBonus = rb[char.race];
  } catch {}

  // 掷骰（熟练 d20，非熟练 d10）
  const attackRoll = isProficient ? rollD20() : rollD10();
  const dieLabel = isProficient ? 'd20' : 'd10';
  const attackTotal = attackRoll + attrMod + attackerRaceBonus;

  let text = `🔮 <b>${escapeHtml(spellName)}</b> 施放！`;
  text += `\n💎 MP: ${char.mana_current}/${char.mana_max}`;

  if (isHeal) {
    // 治疗 — 非熟练减半
    const healAmount = isProficient ? dmg.total : Math.floor(dmg.total / 2);
    const profNote = isProficient ? '' : ' <i>(非熟练减半)</i>';
    if (opts?.targetUserId) {
      const target = await getCharacter(env, chatId, opts.targetUserId);
      if (target) {
        const newHp = Math.min(target.hp_max, target.hp_current + healAmount);
        await env.DB.prepare(
          `UPDATE dnd_characters SET hp_current = ? WHERE chat_id = ? AND user_id = ?`
        ).bind(newHp, String(chatId), opts.targetUserId).run();
        text += `\n💚 ${escapeHtml(target.char_name)} 回复 ${healAmount} HP → ${newHp}/${target.hp_max}${profNote}`;
      }
    } else {
      const newHp = Math.min(char.hp_max, char.hp_current + healAmount);
      await env.DB.prepare(
        `UPDATE dnd_characters SET hp_current = ? WHERE chat_id = ? AND user_id = ?`
      ).bind(newHp, String(chatId), userId).run();
      text += `\n💚 自愈 ${healAmount} HP → ${newHp}/${char.hp_max}${profNote}`;
    }
  } else if (opts?.targetUserId) {
    // 攻击魔法 — PVP 对抗：双方各掷 d20 + 属性 + 种族
    const targetChar = await getCharacter(env, chatId, opts.targetUserId);
    if (targetChar) {
      const targetAttrs = parseAttributes(targetChar.attributes);

      // 防御方属性（取同属性）
      let defAttrMod = 0;
      if (m) {
        const k = attrKeyMap[m[1]] as keyof typeof attrs | undefined;
        if (k) defAttrMod = calcMod(targetAttrs[k]);
      }

      // 防御方种族加值
      let defRaceBonus = 0;
      try {
        const rb: Record<string, number> = JSON.parse(skill.race_bonus);
        if (rb[targetChar.race]) defRaceBonus = rb[targetChar.race];
      } catch {}

      let tProfs: string[] = [];
      try { tProfs = JSON.parse(targetChar.proficiencies); } catch {}
      const targetIsProficient = tProfs.includes(skill.skill_name);
      const defRoll = targetIsProficient ? rollD20() : rollD10();
      const defDieLabel = targetIsProficient ? 'd20' : 'd10';
      const defTotal = defRoll + defAttrMod + defRaceBonus;

      const hit = attackTotal > defTotal;

      text += `\n🎯 攻击方 ${escapeHtml(char.char_name)}：${dieLabel}(${attackRoll}) + 属性(${attrMod >= 0 ? '+' : ''}${attrMod})${attackerRaceBonus ? ' + 种族(+'+attackerRaceBonus+')' : ''} = <b>${attackTotal}</b>`;
      text += `\n🛡️ 防御方 ${escapeHtml(targetChar.char_name)}：${defDieLabel}(${defRoll}) + 属性(${defAttrMod >= 0 ? '+' : ''}${defAttrMod})${defRaceBonus ? ' + 种族(+'+defRaceBonus+')' : ''} = <b>${defTotal}</b>`;
      text += `\n⚔️ ${attackTotal} vs ${defTotal} → ${hit ? '✅ 命中！' : '❌ 未命中'}`;

      if (hit) {
        const newHp = Math.max(0, targetChar.hp_current - dmg.total);
        await env.DB.prepare(
          `UPDATE dnd_characters SET hp_current = ? WHERE chat_id = ? AND user_id = ?`
        ).bind(newHp, String(chatId), opts.targetUserId).run();
        text += `\n💥 伤害：${dmg.diceLabel} + 属性(${attrMod >= 0 ? '+' : ''}${attrMod}) = <b>${dmg.total}</b>`;
        text += `\n❤️ ${escapeHtml(targetChar.char_name)} HP: ${targetChar.hp_current} → ${newHp}`;
      }
    } else {
      text += `\n⚠️ 目标没有角色。`;
    }
  } else {
    text += `\n💥 伤害：${dmg.diceLabel} + 属性(${attrMod >= 0 ? '+' : ''}${attrMod})${attackerRaceBonus ? ' + 种族(+'+attackerRaceBonus+')' : ''} = <b>${dmg.total}</b>`;
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
