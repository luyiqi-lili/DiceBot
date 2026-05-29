/**
 * @file src/commands/dndUpgrade.ts
 * @description /lvup — XP 消费升级（属性/技能熟练）。
 *   按钮交互：选择路径 → 展示可选项 → 确认购买。
 */

import TgMessage, { ParsedUpdate } from '../lib/tgMessage';
import { escapeHtml, deleteMarkup } from '../lib/util';
import type { Env } from '../index';
import {
  getCharacter, parseAttributes, saveCharacter,
  getSkillsForClass, attrKeyToName, ALL_ATTR_KEYS, fmtMod,
  type DndCharAttributes, type DndCharacterRow,
} from '../lib/dndCore';

// ── 回调类型（极小化）─────────────────────────────────────

interface LvUpCb { t: 'lu'; a: 'menu' | 'stats' | 'skills' | 'stat_buy' | 'skill_buy'; v?: string }

const ATTR_COST_BASE = 50;
const SKILL_COST_BASE = 100;
const SKILL_COST_PER = 50;

function statCost(currentVal: number): number {
  return Math.max(ATTR_COST_BASE, (currentVal - 8) * ATTR_COST_BASE);
}
function skillCost(alreadyLearned: number): number {
  return SKILL_COST_BASE + alreadyLearned * SKILL_COST_PER;
}

// ── /lvup 主菜单 ──────────────────────────────────────────

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

  let profs: string[] = [];
  try { profs = JSON.parse(char.proficiencies); } catch {}

  const text = `📊 <b>${escapeHtml(char.char_name)}</b> Lv.${char.level}\n⭐ XP: ${char.xp}\n🏹 已熟练: ${profs.length} 项\n\n请选择升级方向：`;

  const cb = (a: string): LvUpCb => ({ t: 'lu', a: a as any });
  await TgMessage.sendText(env, {
    chat_id: chatId, text, parse_mode: 'HTML', message_thread_id: threadId,
    reply_markup: {
      inline_keyboard: [
        [{ text: '💪 属性提升', callback_data: JSON.stringify(cb('stats')) },
         { text: '🏹 学习技能', callback_data: JSON.stringify(cb('skills')) }],
        [{ text: '🔙 关闭', callback_data: JSON.stringify({ type: 'delete_message' }) }],
      ],
    },
  });
}

// ── /level 查看 ───────────────────────────────────────────

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

  const text = `📊 <b>${escapeHtml(char.char_name)}</b> Lv.${char.level}\n⭐ XP: ${char.xp}\n🏹 已熟练: ${profs.join(', ') || '无'}`;
  await TgMessage.sendText(env, { chat_id: chatId, text, parse_mode: 'HTML', message_thread_id: threadId, reply_markup: deleteMarkup });
}

// ── 回调总入口 ────────────────────────────────────────────

export async function handleLvUpCallback(cq: any, cd: any, env: Env): Promise<void> {
  if (!cd || cd.t !== 'lu') return;
  const userId = String(cq.from?.id);
  const chatId = cq.message?.chat?.id;
  if (!env.DB || !chatId) return;

  if (cd.a === 'stats') await showStats(env, cq, chatId, userId);
  else if (cd.a === 'skills') await showSkills(env, cq, chatId, userId);
  else if (cd.a === 'stat_buy') await buyStat(env, cq, chatId, userId, cd.v);
  else if (cd.a === 'skill_buy') await buySkill(env, cq, chatId, userId, cd.v);
  else await showMenu(env, cq, chatId, userId);
}

// ── 属性列表 ──────────────────────────────────────────────

async function showStats(env: Env, cq: any, chatId: number, userId: string) {
  const char = await getCharacter(env, chatId, userId);
  if (!char) return;
  const attrs = parseAttributes(char.attributes);

  const buttons: any[] = [];
  for (const k of ALL_ATTR_KEYS) {
    const val = attrs[k];
    if (val >= 18) continue;
    const cost = statCost(val);
    const disabled = char.xp < cost;
    const label = `${attrKeyToName(k)} ${val}→${val + 1} [${cost}XP]${disabled ? ' ❌' : ''}`;
    buttons.push([{ text: label, callback_data: JSON.stringify({ t: 'lu', a: 'stat_buy', v: k } as LvUpCb) }]);
  }

  buttons.push([{ text: '🔙 返回', callback_data: JSON.stringify({ t: 'lu', a: 'menu' } as LvUpCb) }]);

  const text = `💪 <b>属性提升</b>\n⭐ 可用 XP: ${char.xp}\n\n选择要提升的属性（上限 18）：`;

  await TgMessage.editMessageText(env, {
    chat_id: chatId, message_id: cq.message.message_id,
    text, parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons },
  });
  await TgMessage.answerCallbackQuery(env, cq.id);
}

// ── 购买属性 ──────────────────────────────────────────────

async function buyStat(env: Env, cq: any, chatId: number, userId: string, attrKey: string) {
  const char = await getCharacter(env, chatId, userId);
  if (!char) return;
  const attrs = parseAttributes(char.attributes);
  const k = attrKey as keyof DndCharAttributes;
  const val = attrs[k];
  if (!val || val >= 18) return;
  const cost = statCost(val);
  if (char.xp < cost) {
    await TgMessage.answerCallbackQuery(env, cq.id, { text: `XP 不足！需要 ${cost}，当前 ${char.xp}`, show_alert: true });
    return;
  }

  attrs[k] = val + 1;
  await saveCharacter(env, {
    chat_id: String(chatId), user_id: userId,
    char_name: char.char_name, race: char.race, class: char.class,
    hp_max: char.hp_max, hp_current: char.hp_current,
    attributes: attrs, proficiencies: JSON.parse(char.proficiencies || '[]'),
    level: char.level, xp: char.xp - cost,
  });

  await showStats(env, cq, chatId, userId);
  await TgMessage.answerCallbackQuery(env, cq.id, { text: `${attrKeyToName(k)} ${val}→${val+1}！消耗 ${cost} XP` });
}

// ── 技能列表 ──────────────────────────────────────────────

async function showSkills(env: Env, cq: any, chatId: number, userId: string) {
  const char = await getCharacter(env, chatId, userId);
  if (!char) return;
  let profs: string[] = [];
  try { profs = JSON.parse(char.proficiencies); } catch {}

  const skills = await getSkillsForClass(env, chatId, char.class);
  const buttons: any[] = [];

  for (const s of skills) {
    if (profs.includes(s.skill_name)) continue;
    const cost = skillCost(profs.length);
    const disabled = char.xp < cost;
    const label = `${s.skill_name} (${s.linked_attr}) [${cost}XP]${disabled ? ' ❌' : ''}`;
    buttons.push([{ text: label, callback_data: JSON.stringify({ t: 'lu', a: 'skill_buy', v: s.skill_name } as LvUpCb) }]);
  }

  if (buttons.length === 0) {
    buttons.push([{ text: '✅ 已全部掌握！', callback_data: JSON.stringify({ t: 'lu', a: 'menu' } as LvUpCb) }]);
  }
  buttons.push([{ text: '🔙 返回', callback_data: JSON.stringify({ t: 'lu', a: 'menu' } as LvUpCb) }]);

  const text = `🏹 <b>学习技能</b>\n⭐ 可用 XP: ${char.xp}\n\n只能学习本职业（${escapeHtml(char.class)}）技能：`;

  await TgMessage.editMessageText(env, {
    chat_id: chatId, message_id: cq.message.message_id,
    text, parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons },
  });
  await TgMessage.answerCallbackQuery(env, cq.id);
}

// ── 购买技能 ──────────────────────────────────────────────

async function buySkill(env: Env, cq: any, chatId: number, userId: string, skillName: string) {
  const char = await getCharacter(env, chatId, userId);
  if (!char) return;
  let profs: string[] = [];
  try { profs = JSON.parse(char.proficiencies); } catch {}
  if (profs.includes(skillName)) {
    await TgMessage.answerCallbackQuery(env, cq.id, { text: '已学会此技能', show_alert: true });
    return;
  }

  const cost = skillCost(profs.length);
  if (char.xp < cost) {
    await TgMessage.answerCallbackQuery(env, cq.id, { text: `XP 不足！需要 ${cost}，当前 ${char.xp}`, show_alert: true });
    return;
  }

  profs.push(skillName);
  await saveCharacter(env, {
    chat_id: String(chatId), user_id: userId,
    char_name: char.char_name, race: char.race, class: char.class,
    hp_max: char.hp_max, hp_current: char.hp_current,
    attributes: parseAttributes(char.attributes), proficiencies: profs,
    level: char.level, xp: char.xp - cost,
  });

  await showSkills(env, cq, chatId, userId);
  await TgMessage.answerCallbackQuery(env, cq.id, { text: `学会 ${skillName}！消耗 ${cost} XP` });
}

// ── 返回主菜单 ────────────────────────────────────────────

async function showMenu(env: Env, cq: any, chatId: number, userId: string) {
  const char = await getCharacter(env, chatId, userId);
  if (!char) return;
  let profs: string[] = [];
  try { profs = JSON.parse(char.proficiencies); } catch {}

  const text = `📊 <b>${escapeHtml(char.char_name)}</b> Lv.${char.level}\n⭐ XP: ${char.xp}\n🏹 已熟练: ${profs.length} 项\n\n请选择升级方向：`;

  const cb = (a: string): LvUpCb => ({ t: 'lu', a: a as any });
  await TgMessage.editMessageText(env, {
    chat_id: chatId, message_id: cq.message.message_id,
    text, parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '💪 属性提升', callback_data: JSON.stringify(cb('stats')) },
         { text: '🏹 学习技能', callback_data: JSON.stringify(cb('skills')) }],
        [{ text: '🔙 关闭', callback_data: JSON.stringify({ type: 'delete_message' }) }],
      ],
    },
  });
  await TgMessage.answerCallbackQuery(env, cq.id);
}
