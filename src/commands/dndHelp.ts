/**
 * @file src/commands/dndHelp.ts
 * @description /dnd — DND 跑团帮助命令。
 */

import TgMessage, { ParsedUpdate } from '../lib/tgMessage';
import { escapeHtml } from '../lib/util';
import type { Env } from '../index';
import {
  getAllRaces, getAllClasses, getAllSkills, initPresetsToDB, fmtAttrBonuses,
} from '../lib/dndCore';

export async function handleDndHelp(parsed: ParsedUpdate, env: Env): Promise<void> {
  const chatId = parsed.chatId!;
  const threadId = parsed.threadId;

  if (!env.DB) {
    await TgMessage.sendText(env, {
      chat_id: chatId, text: '⚠️ DND 系统需要 D1 数据库支持，当前环境未配置。', message_thread_id: threadId,
    });
    return;
  }

  await initPresetsToDB(env, chatId);
  const [races, classes, skills] = await Promise.all([
    getAllRaces(env, chatId), getAllClasses(env, chatId), getAllSkills(env, chatId),
  ]);

  let raceText = '';
  for (const r of races) {
    let bonuses: Record<string, number> = {};
    try { bonuses = JSON.parse(r.attr_bonuses); } catch {}
    raceText += ` <b>${escapeHtml(r.race_name)}</b> — ${fmtAttrBonuses(bonuses)} — ${escapeHtml(r.description)}\n`;
  }

  let classText = '';
  for (const c of classes) {
    classText += ` <b>${escapeHtml(c.class_name)}</b> — 主属性 ${escapeHtml(c.primary_attr)} | d${c.hit_die} — ${escapeHtml(c.description)}\n`;
  }

  let skillText = '';
  for (const s of skills) {
    skillText += ` <b>${escapeHtml(s.skill_name)}</b> (${escapeHtml(s.linked_attr)}) — ${escapeHtml(s.class_name)}`;
    if (s.damage) skillText += ` | 伤害 ${s.damage}`;
    if (s.mana_cost) skillText += ` | 消耗 ${s.mana_cost} MP`;
    if (s.description) skillText += ` — ${escapeHtml(s.description)}`;
    skillText += '\n';
  }

  const text = `🎲 <b>DND 跑团系统</b>\n\n` +
    `<b>🧬 种族</b>\n` + (raceText || '  （暂无，GM 用 /gm 种族加值 添加）\n') + '\n' +
    `<b>⚔️ 职业</b>\n` + (classText || '  （暂无，GM 用 /gm 职业 添加）\n') + '\n' +
    `<b>🏹 技能</b>\n` + (skillText || '  （暂无，GM 用 /gm 技能 添加）\n') + '\n' +
    `<blockquote expandable><b>📜 玩家命令</b>\n` +
    ` <code>/new 种族 职业 名字</code> — 创建角色\n` +
    ` <code>/char</code> — 查看角色卡\n` +
    ` <code>/skill 技能名</code> — 技能检定\n` +
    ` <code>*技能名</code> — 同上\n` +
    ` <code>/skills</code> — 技能列表 + 调整值\n` +
    ` <code>/attack 武器名</code> / <code>/atk</code> — 武器攻击\n` +
    ` <code>*武器名</code> / <code>*攻击</code> — 同上\n` +
    ` <code>/cast 魔法名</code> — 施放魔法\n` +
    ` <code>*魔法名</code> — 同上\n` +
    ` <code>/rest short</code> / <code>long</code> — 休息\n` +
    ` <code>/item</code> — 按钮背包\n\n` +
    `<b>⚙️ GM 命令</b>\n` +
    ` <code>/gm</code> — 显示 GM 帮助\n` +
    ` <code>/gm 种族/职业/技能</code> — 查看配置\n` +
    ` <code>/gm dc 数值 描述</code> — 设置场景 DC\n` +
    ` <code>/gm addxp 数值</code> — 回复添加 XP\n` +
    ` <code>/gm setgm</code> — 任命 GM\n` +
    ` <code>/gm item create/list/delete/give</code> — 物品管理\n` +
    `</blockquote>`;

  const reply_markup = {
    inline_keyboard: [
      [{ text: '📜 创建角色', switch_inline_query_current_chat: '/new 人类 战士 ' },
       { text: '🧝 精灵法师', switch_inline_query_current_chat: '/new 精灵 法师 ' }],
      [{ text: '📋 /char', switch_inline_query_current_chat: '/char' },
       { text: '🏹 /skills', switch_inline_query_current_chat: '/skills' },
       { text: '⚔️ /atk', switch_inline_query_current_chat: '/atk' }],
      [{ text: '🔮 /cast', switch_inline_query_current_chat: '/cast ' },
       { text: '💤 /rest', switch_inline_query_current_chat: '/rest' },
       { text: '📦 /item', switch_inline_query_current_chat: '/item' }],
      [{ text: '⚙️ /gm', switch_inline_query_current_chat: '/gm' },
       { text: '删除消息', callback_data: JSON.stringify({ type: 'delete_message' }) }],
    ],
  };

  await TgMessage.sendText(env, {
    chat_id: chatId, text, parse_mode: 'HTML', reply_markup, message_thread_id: threadId,
  });
}
