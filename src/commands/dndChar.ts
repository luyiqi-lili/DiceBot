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
  fmtMod,
  attrKeyToName,
  ALL_ATTR_KEYS,
  type DndCharacterRow,
} from '../lib/dndCore';

function fmtRaceBonusesText(bonuses: Record<string, number>): string {
  if (!bonuses || Object.keys(bonuses).length === 0) return '';
  return Object.entries(bonuses).map(([k, v]) => `${k}${v >= 0 ? '+' : ''}${v}`).join(', ');
}

function fmtCharSheetFull(
  char: DndCharacterRow,
  raceBonuses: Record<string, number>,
  classPrimaryAttr: string,
  classHitDie: number,
): string {
  const attrs = parseAttributes(char.attributes);
  let profs: string[] = [];
  let equip: string[] = [];
  try { profs = JSON.parse(char.proficiencies); } catch {}
  try { equip = JSON.parse(char.equipment); } catch {}

  const attrLines = ALL_ATTR_KEYS.map(k => {
    const val = attrs[k];
    const mod = fmtMod(val);
    const modStr = mod === '0' ? '±0' : mod;
    return `  ${escapeHtml(attrKeyToName(k))}  <b>${val}</b>  (${modStr})`;
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

  // 查询种族加值和职业信息
  const [raceBonuses, classInfo] = await Promise.all([
    getRaceBonuses(env, chatId, char.race),
    getClassInfo(env, chatId, char.class),
  ]);

  await TgMessage.sendText(env, {
    chat_id: chatId,
    text: fmtCharSheetFull(char, raceBonuses ?? {}, classInfo?.primary_attr ?? '?', classInfo?.hit_die ?? 0),
    parse_mode: 'HTML',
    message_thread_id: threadId,
    reply_markup: deleteMarkup,
  });
}
