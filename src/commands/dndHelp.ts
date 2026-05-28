/**
 * @file src/commands/dndHelp.ts
 * @description /dnd — DND 跑团帮助命令。
 *   列出本群所有可用种族、职业、技能，并提供快捷创建按钮。
 */

import TgMessage, { ParsedUpdate } from '../lib/tgMessage';
import { escapeHtml } from '../lib/util';
import type { Env } from '../index';
import {
  getAllRaces,
  getAllClasses,
  getAllSkills,
  initPresetsToDB,
  fmtAttrBonuses,
} from '../lib/dndCore';

export async function handleDndHelp(parsed: ParsedUpdate, env: Env): Promise<void> {
  const chatId = parsed.chatId!;
  const threadId = parsed.threadId;

  if (!env.DB) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: '⚠️ DND 系统需要 D1 数据库支持，当前环境未配置。',
      message_thread_id: threadId,
    });
    return;
  }

  // 首次访问时初始化预设数据
  await initPresetsToDB(env, chatId);

  // 查询数据
  const [races, classes, skills] = await Promise.all([
    getAllRaces(env, chatId),
    getAllClasses(env, chatId),
    getAllSkills(env, chatId),
  ]);

  // 构造帮助文本
  let text = '🎲 <b>DND 跑团系统</b>\n\n';

  // 种族
  text += '<b>🧬 可用种族</b>\n';
  if (races.length > 0) {
    for (const r of races) {
      let bonuses: Record<string, number> = {};
      try { bonuses = JSON.parse(r.attr_bonuses); } catch {}
      text += `  • <b>${escapeHtml(r.race_name)}</b> — ${fmtAttrBonuses(bonuses)}`;
      if (r.description) text += ` — ${escapeHtml(r.description)}`;
      text += '\n';
    }
  } else {
    text += '  （暂无，请 GM 使用 /gm 种族加值 添加）\n';
  }

  // 职业
  text += '\n<b>⚔️ 可用职业</b>\n';
  if (classes.length > 0) {
    for (const c of classes) {
      text += `  • <b>${escapeHtml(c.class_name)}</b> — 主属性: ${escapeHtml(c.primary_attr)} | d${c.hit_die}`;
      if (c.description) text += ` — ${escapeHtml(c.description)}`;
      text += '\n';
    }
  } else {
    text += '  （暂无，请 GM 使用 /gm 职业 添加）\n';
  }

  // 技能
  text += '\n<b>🏹 可用技能</b>\n';
  if (skills.length > 0) {
    for (const s of skills) {
      text += `  • <b>${escapeHtml(s.skill_name)}</b> (${escapeHtml(s.linked_attr)}) — ${escapeHtml(s.class_name)}`;
      if (s.description) text += ` — ${escapeHtml(s.description)}`;
      text += '\n';
    }
  } else {
    text += '  （暂无，请 GM 使用 /gm 技能 添加）\n';
  }

  // 创建角色说明
  text += '\n<b>📜 创建角色</b>\n';
  text += '  <code>/new 种族 职业 角色名</code>\n';
  text += '  示例: <code>/new 精灵 法师 拉斐尔</code>\n\n';
  text += '<b>⚡ 快捷命令</b>\n';
  text += '  <code>/char</code> 查看角色卡 | <code>/skills</code> 技能列表\n';
  text += '  <code>/skill 技能名</code> 检定 | <code>/rest</code> 休息\n';

  const reply_markup = {
    inline_keyboard: [
      [
        { text: '📜 创建角色', switch_inline_query_current_chat: '/new 人类 战士 ' },
        { text: '🧝 精灵法师', switch_inline_query_current_chat: '/new 精灵 法师 ' },
      ],
      [
        { text: '📋 角色卡 /char', switch_inline_query_current_chat: '/char' },
        { text: '🏹 技能 /skills', switch_inline_query_current_chat: '/skills' },
        { text: '💤 休息 /rest', switch_inline_query_current_chat: '/rest' },
      ],
      [
        { text: '删除消息', callback_data: JSON.stringify({ type: 'delete_message' }) },
      ],
    ],
  };

  await TgMessage.sendText(env, {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup,
    message_thread_id: threadId,
  });
}
