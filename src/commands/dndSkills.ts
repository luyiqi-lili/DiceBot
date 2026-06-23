/**
 * @file src/commands/dndSkills.ts
 * @description /skills — 列出本群所有可用技能及当前角色的调整值，熟练项带 ✔ 标记。
 */

import TgMessage, { ParsedUpdate } from '../lib/telegram';
import { escapeHtml, deleteMarkup } from '../lib/util';
import type { Env } from '../index';
import {
  getCharacter,
  parseAttributes,
  calcMod,
  attrNameToKey,
  getAllSkills,
  type DndSkillRow,
} from '../lib/dndCore';

export async function handleDndSkills(parsed: ParsedUpdate, env: Env): Promise<void> {
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

  // 查询角色（可能没有）
  const char = await getCharacter(env, chatId, userId);
  const attrs = char ? parseAttributes(char.attributes) : null;
  let profs: string[] = [];
  if (char) {
    try { profs = JSON.parse(char.proficiencies); } catch {}
  }

  const skills = await getAllSkills(env, chatId);

  if (skills.length === 0) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: '⚠️ 当前群组暂无技能。请 GM 使用 /gm 技能 添加。',
      message_thread_id: threadId,
      reply_markup: deleteMarkup,
    });
    return;
  }

  let text = '🏹 <b>技能列表</b>\n\n';

  if (char) {
    text += `<i>角色: ${escapeHtml(char.char_name)} (${escapeHtml(char.race)} ${escapeHtml(char.class)})</i>\n\n`;
  }

  for (const skill of skills) {
    const isProf = profs.includes(skill.skill_name);
    const marker = isProf ? '✔' : '  ';

    // 计算调整值
    let adj = 0;
    if (attrs) {
      const attrKey = attrNameToKey(skill.linked_attr);
      if (attrKey) adj = calcMod(attrs[attrKey]);
    }
    // 种族加值
    try {
      const rb: Record<string, number> = JSON.parse(skill.race_bonus);
      if (char && rb[char.race]) adj += rb[char.race];
    } catch {}

    const adjStr = adj >= 0 ? `+${adj}` : `${adj}`;

    text += `${marker} <b>${escapeHtml(skill.skill_name)}</b> (${escapeHtml(skill.linked_attr)}) ${adjStr}`;
    if (skill.description) text += ` — ${escapeHtml(skill.description)}`;
    text += '\n';
  }

  const reply_markup = {
    inline_keyboard: [
      [
        { text: '🎲 检定 /skill', switch_inline_query_current_chat: '/skill ' },
        { text: '📋 /char', switch_inline_query_current_chat: '/char' },
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
