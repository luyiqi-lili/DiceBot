/**
 * @file src/commands/dndUpgrade.ts
 * @description /lvup — 升级系统：消耗 XP 升一级，获得一次属性+1/学技能选择权。
 */

import TgMessage, { ParsedUpdate } from '../lib/telegram';
import { escapeHtml, deleteMarkup } from '../lib/util';
import type { Env } from '../index';
import {
  getCharacter, parseAttributes, saveCharacter,
  getSkillsForClass, attrKeyToName, ALL_ATTR_KEYS,
  type DndCharAttributes,
} from '../lib/dndCore';
import { getUserInventory } from '../lib/itemCore';

// ── 回调类型 ──────────────────────────────────────────────

interface LvUpCb { type: 'lu'; a: 'menu' | 'stat_up' | 'skill_up' | 'wpn_up'; v?: string }

/** 升到下一级需要的 XP */
function nextLevelXP(level: number): number {
  return level * 100;
}

// ── /lvup ─────────────────────────────────────────────────

export async function handleDndLvUp(parsed: ParsedUpdate, env: Env): Promise<void> {
  const chatId = parsed.chatId!;
  const threadId = parsed.threadId;
  const userId = String(parsed.from?.id ?? '');

  if (!env.DB) {
    await TgMessage.sendText(env, { chat_id: chatId, text: '⚠️ D1 未配置', message_thread_id: threadId, reply_markup: deleteMarkup });
    return;
  }

  const char = await getCharacter(env, chatId, userId);
  if (!char) {
    await TgMessage.sendText(env, { chat_id: chatId, text: '⚠️ 你还没有角色。', message_thread_id: threadId, reply_markup: deleteMarkup });
    return;
  }

  const need = nextLevelXP(char.level);
  const canUp = char.xp >= need;
  let profs: string[] = [];
  try { profs = JSON.parse(char.proficiencies); } catch {}

  const text = `📊 <b>${escapeHtml(char.char_name)}</b> Lv.${char.level}\n⭐ XP: ${char.xp} / 下一级 ${need}\n🏹 已熟练: ${profs.length} 项` +
    (canUp ? `\n\n可升级！选择奖励：` : `\n\n⚠️ XP 不足，还需 ${need - char.xp}`);

  const buttons: any[] = [];

  if (canUp) {
    buttons.push([
      { text: '💪 属性 +1', callback_data: JSON.stringify({ type: 'lu', a: 'stat_up' } as LvUpCb) },
      { text: '🏹 学技能', callback_data: JSON.stringify({ type: 'lu', a: 'skill_up' } as LvUpCb) },
      { text: '⚔️ 武器熟练', callback_data: JSON.stringify({ type: 'lu', a: 'wpn_up' } as LvUpCb) },
    ]);
  }

  buttons.push([{ text: '🔙 关闭', callback_data: JSON.stringify({ type: 'delete_message' }) }]);

  await TgMessage.sendText(env, {
    chat_id: chatId, text, parse_mode: 'HTML', message_thread_id: threadId,
    reply_markup: { inline_keyboard: buttons },
  });
}

// ── /level ────────────────────────────────────────────────

export async function handleDndLevel(parsed: ParsedUpdate, env: Env): Promise<void> {
  const chatId = parsed.chatId!;
  const threadId = parsed.threadId;
  const userId = String(parsed.from?.id ?? '');

  if (!env.DB) {
    await TgMessage.sendText(env, { chat_id: chatId, text: '⚠️ D1 未配置', message_thread_id: threadId });
    return;
  }

  const char = await getCharacter(env, chatId, userId);
  if (!char) {
    await TgMessage.sendText(env, { chat_id: chatId, text: '⚠️ 你还没有角色。', message_thread_id: threadId });
    return;
  }

  let profs: string[] = [];
  try { profs = JSON.parse(char.proficiencies); } catch {}
  const need = nextLevelXP(char.level);
  const text = `📊 <b>${escapeHtml(char.char_name)}</b> Lv.${char.level}\n⭐ XP: ${char.xp} / 下一级 ${need}\n🏹 已熟练: ${profs.join(', ') || '无'}`;
  await TgMessage.sendText(env, { chat_id: chatId, text, parse_mode: 'HTML', message_thread_id: threadId, reply_markup: deleteMarkup });
}

// ── 回调总入口 ────────────────────────────────────────────

export async function handleLvUpCallback(cq: any, cd: any, env: Env): Promise<void> {
  if (!cd || cd.type !== 'lu') return;
  const userId = String(cq.from?.id);
  const chatId = cq.message?.chat?.id;
  if (!env.DB || !chatId) return;

  if (cd.a === 'stat_up') await doStatUp(env, cq, chatId, userId, cd.v);
  else if (cd.a === 'skill_up') await doSkillUp(env, cq, chatId, userId, cd.v);
  else if (cd.a === 'wpn_up') await doWpnUp(env, cq, chatId, userId, cd.v);
  else if (cd.a === 'menu') await refreshMenu(env, cq, chatId, userId);
}

// ── 升级 + 属性 +1 ────────────────────────────────────────

async function doStatUp(env: Env, cq: any, chatId: number, userId: string, preselect?: string) {
  const char = await getCharacter(env, chatId, userId);
  if (!char) return;

  if (preselect) {
    await confirmStatUp(env, cq, chatId, userId, preselect);
    return;
  }

  const need = nextLevelXP(char.level);
  if (char.xp < need) {
    await TgMessage.answerCallbackQuery(env, cq.id, { text: `XP 不足！需要 ${need}`, show_alert: true });
    return;
  }

  // 展示属性列表供选择
  const attrs = parseAttributes(char.attributes);
  const buttons: any[] = [];
  for (const k of ALL_ATTR_KEYS) {
    const val = attrs[k];
    if (val >= 18) continue;
    buttons.push([{
      text: `${attrKeyToName(k)} ${val} → ${val + 1}`,
      callback_data: JSON.stringify({ type: 'lu', a: 'stat_up', v: k } as LvUpCb),
    }]);
  }

  if (buttons.length === 0) {
    buttons.push([{ text: '🚫 全属性已达上限', callback_data: JSON.stringify({ type: 'lu', a: 'menu' } as LvUpCb) }]);
  }
  buttons.push([{ text: '🔙 取消', callback_data: JSON.stringify({ type: 'lu', a: 'menu' } as LvUpCb) }]);

  await TgMessage.editMessageText(env, {
    chat_id: chatId, message_id: cq.message.message_id,
    text: `💪 <b>选择要提升的属性</b>\n⭐ 升级后将消耗 ${need} XP`,
    parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons },
  });
  await TgMessage.answerCallbackQuery(env, cq.id);
}

// ── 确认属性升级（v 有效时）────────────────────────────────

async function confirmStatUp(env: Env, cq: any, chatId: number, userId: string, attrKey: string) {
  const char = await getCharacter(env, chatId, userId);
  if (!char) return;

  const need = nextLevelXP(char.level);
  if (char.xp < need) {
    await TgMessage.answerCallbackQuery(env, cq.id, { text: `XP 不足！`, show_alert: true });
    return;
  }

  const attrs = parseAttributes(char.attributes);
  const k = attrKey as keyof DndCharAttributes;
  const old = attrs[k];
  if (!old || old >= 18) return;

  attrs[k] = old + 1;
  await saveCharacter(env, {
    chat_id: String(chatId), user_id: userId,
    char_name: char.char_name, race: char.race, class: char.class,
    hp_max: char.hp_max, hp_current: char.hp_current,
    attributes: attrs, proficiencies: JSON.parse(char.proficiencies || '[]'),
    level: char.level + 1, xp: char.xp - need,
  });

  await refreshMenu(env, cq, chatId, userId);
  await TgMessage.answerCallbackQuery(env, cq.id, { text: `${attrKeyToName(k)} ${old}→${old+1}！升级至 Lv.${char.level+1}` });
}

// ── 升级 + 学技能 ─────────────────────────────────────────

async function doSkillUp(env: Env, cq: any, chatId: number, userId: string, preselect?: string) {
  const char = await getCharacter(env, chatId, userId);
  if (!char) return;

  // 如果携带有 v（具体技能名），直接执行升级
  if (preselect) {
    await confirmSkillUp(env, cq, chatId, userId, preselect);
    return;
  }

  const need = nextLevelXP(char.level);
  if (char.xp < need) {
    await TgMessage.answerCallbackQuery(env, cq.id, { text: `XP 不足！需要 ${need}`, show_alert: true });
    return;
  }

  let profs: string[] = [];
  try { profs = JSON.parse(char.proficiencies); } catch {}

  const skills = await getSkillsForClass(env, chatId, char.class);
  const buttons: any[] = [];

  for (const s of skills) {
    if (profs.includes(s.skill_name)) continue;
    buttons.push([{
      text: `${s.skill_name} (${s.linked_attr})`,
      callback_data: JSON.stringify({ type: 'lu', a: 'skill_up', v: s.skill_name } as LvUpCb),
    }]);
  }

  if (buttons.length === 0) {
    buttons.push([{ text: '✅ 已全部掌握！', callback_data: JSON.stringify({ type: 'lu', a: 'menu' } as LvUpCb) }]);
  }
  buttons.push([{ text: '🔙 取消', callback_data: JSON.stringify({ type: 'lu', a: 'menu' } as LvUpCb) }]);

  await TgMessage.editMessageText(env, {
    chat_id: chatId, message_id: cq.message.message_id,
    text: `🏹 <b>选择要学习的技能</b>\n⭐ 升级后将消耗 ${need} XP\n\n本职业（${escapeHtml(char.class)}）可选技能：`,
    parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons },
  });
  await TgMessage.answerCallbackQuery(env, cq.id);
}

// ── 确认技能 — 消耗 XP 升级 ───────────────────────────────

async function confirmSkillUp(env: Env, cq: any, chatId: number, userId: string, skillName: string) {
  const char = await getCharacter(env, chatId, userId);
  if (!char) return;

  const need = nextLevelXP(char.level);
  if (char.xp < need) {
    await TgMessage.answerCallbackQuery(env, cq.id, { text: `XP 不足！`, show_alert: true });
    return;
  }

  let profs: string[] = [];
  try { profs = JSON.parse(char.proficiencies); } catch {}
  if (profs.includes(skillName)) {
    await TgMessage.answerCallbackQuery(env, cq.id, { text: '已学会此技能', show_alert: true });
    return;
  }

  profs.push(skillName);
  await saveCharacter(env, {
    chat_id: String(chatId), user_id: userId,
    char_name: char.char_name, race: char.race, class: char.class,
    hp_max: char.hp_max, hp_current: char.hp_current,
    attributes: parseAttributes(char.attributes), proficiencies: profs,
    level: char.level + 1, xp: char.xp - need,
  });

  await refreshMenu(env, cq, chatId, userId);
  await TgMessage.answerCallbackQuery(env, cq.id, { text: `学会 ${skillName}！升级至 Lv.${char.level+1}` });
}

// ── 武器熟练 ─────────────────────────────────────────────

async function doWpnUp(env: Env, cq: any, chatId: number, userId: string, preselect?: string) {
  const char = await getCharacter(env, chatId, userId);
  if (!char) return;

  if (preselect) {
    await confirmWpnUp(env, cq, chatId, userId, preselect);
    return;
  }

  const need = nextLevelXP(char.level);
  if (char.xp < need) {
    await TgMessage.answerCallbackQuery(env, cq.id, { text: `XP 不足！需要 ${need}`, show_alert: true });
    return;
  }

  let profs: string[] = [];
  try { profs = JSON.parse(char.proficiencies); } catch {}

  // 从背包查 weapon 部位的物品
  const inventory = await getUserInventory(env, String(chatId), userId);
  const weapons = inventory.filter(i => i.slot === 'weapon' && !profs.includes(i.name));

  const buttons: any[] = [];
  for (const w of weapons) {
    buttons.push([{
      text: `${w.name}`,
      callback_data: JSON.stringify({ type: 'lu', a: 'wpn_up', v: w.name } as LvUpCb),
    }]);
  }

  if (buttons.length === 0) {
    buttons.push([{ text: '✅ 没有未熟练的武器', callback_data: JSON.stringify({ type: 'lu', a: 'menu' } as LvUpCb) }]);
  }
  buttons.push([{ text: '🔙 取消', callback_data: JSON.stringify({ type: 'lu', a: 'menu' } as LvUpCb) }]);

  await TgMessage.editMessageText(env, {
    chat_id: chatId, message_id: cq.message.message_id,
    text: `⚔️ <b>选择要熟练的武器</b>\n⭐ 升级后将消耗 ${need} XP\n\n背包中 weapon 部位物品：`,
    parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons },
  });
  await TgMessage.answerCallbackQuery(env, cq.id);
}

async function confirmWpnUp(env: Env, cq: any, chatId: number, userId: string, wpnName: string) {
  const char = await getCharacter(env, chatId, userId);
  if (!char) return;

  const need = nextLevelXP(char.level);
  if (char.xp < need) {
    await TgMessage.answerCallbackQuery(env, cq.id, { text: `XP 不足！`, show_alert: true });
    return;
  }

  let profs: string[] = [];
  try { profs = JSON.parse(char.proficiencies); } catch {}
  if (profs.includes(wpnName)) {
    await TgMessage.answerCallbackQuery(env, cq.id, { text: '已熟练此武器', show_alert: true });
    return;
  }

  profs.push(wpnName);
  await saveCharacter(env, {
    chat_id: String(chatId), user_id: userId,
    char_name: char.char_name, race: char.race, class: char.class,
    hp_max: char.hp_max, hp_current: char.hp_current,
    attributes: parseAttributes(char.attributes), proficiencies: profs,
    level: char.level + 1, xp: char.xp - need,
  });

  await refreshMenu(env, cq, chatId, userId);
  await TgMessage.answerCallbackQuery(env, cq.id, { text: `熟练 ${wpnName}！升级至 Lv.${char.level+1}` });
}

// ── 刷新主菜单 ────────────────────────────────────────────

async function refreshMenu(env: Env, cq: any, chatId: number, userId: string) {
  const char = await getCharacter(env, chatId, userId);
  if (!char) return;

  const need = nextLevelXP(char.level);
  const canUp = char.xp >= need;
  let profs: string[] = [];
  try { profs = JSON.parse(char.proficiencies); } catch {}

  const text = `📊 <b>${escapeHtml(char.char_name)}</b> Lv.${char.level}\n⭐ XP: ${char.xp} / 下一级 ${need}\n🏹 已熟练: ${profs.length} 项` +
    (canUp ? `\n\n可升级！选择奖励：` : `\n\n⚠️ XP 不足，还需 ${need - char.xp}`);

  const buttons: any[] = [];
  if (canUp) {
    buttons.push([
      { text: '💪 属性 +1', callback_data: JSON.stringify({ type: 'lu', a: 'stat_up' } as LvUpCb) },
      { text: '🏹 学技能', callback_data: JSON.stringify({ type: 'lu', a: 'skill_up' } as LvUpCb) },
      { text: '⚔️ 武器熟练', callback_data: JSON.stringify({ type: 'lu', a: 'wpn_up' } as LvUpCb) },
    ]);
  }
  buttons.push([{ text: '🔙 关闭', callback_data: JSON.stringify({ type: 'delete_message' }) }]);

  await TgMessage.editMessageText(env, {
    chat_id: chatId, message_id: cq.message.message_id,
    text, parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons },
  });
  await TgMessage.answerCallbackQuery(env, cq.id);
}
