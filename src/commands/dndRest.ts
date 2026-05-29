/**
 * @file src/commands/dndRest.ts
 * @description /rest — 执行一次短休或长休（每日限制）。
 *   /rest short: 短休，恢复 hit_die + CON调整 HP，每日 2 次
 *   /rest long:  长休，恢复满 HP，每日 1 次
 */

import TgMessage, { ParsedUpdate } from '../lib/tgMessage';
import { escapeHtml, deleteMarkup } from '../lib/util';
import type { Env } from '../index';
import {
  getCharacter,
  getClassInfo,
  parseAttributes,
  calcMod,
  calcMaxHP,
} from '../lib/dndCore';

function todayYMD(): string {
  return new Date().toISOString().split('T')[0];
}

export async function handleDndRest(parsed: ParsedUpdate, env: Env): Promise<void> {
  const chatId = parsed.chatId!;
  const threadId = parsed.threadId;
  const userId = String(parsed.from?.id ?? '');
  const args = parsed.args ?? [];

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

  const today = todayYMD();

  // 每日重置
  if (char.rest_date !== today) {
    char.rest_short_used = 0;
    char.rest_long_used = 0;
    char.rest_date = today;
  }

  const subCmd = (args[0] ?? 'short').toLowerCase();

  if (subCmd === 'long') {
    // 长休
    if (char.rest_long_used >= 1) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: '⚠️ 今日长休次数已用完（每日 1 次）。',
        message_thread_id: threadId,
        reply_markup: deleteMarkup,
      });
      return;
    }

    char.hp_current = char.hp_max;
    char.rest_long_used++;
    // 重置法力
    char.mana_current = char.mana_max;
    await env.DB.prepare(
      `UPDATE dnd_characters SET hp_current = ?, rest_short_used = ?, rest_long_used = ?, rest_date = ?, mana_current = ?, updated_at = datetime('now')
       WHERE chat_id = ? AND user_id = ?`
    ).bind(char.hp_current, char.rest_short_used, char.rest_long_used, char.rest_date, char.mana_current, char.chat_id, char.user_id).run();

    const manaLine = char.mana_max > 0 ? `\n💎 MP 恢复至 ${char.mana_current}/${char.mana_max}` : '';
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `💤 <b>长休完成！</b>\n❤️ HP 恢复至 ${char.hp_current}/${char.hp_max}${manaLine}`,
      parse_mode: 'HTML',
      message_thread_id: threadId,
      reply_markup: deleteMarkup,
    });
    return;
  }

  // 短休（默认）
  if (char.rest_short_used >= 2) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: '⚠️ 今日短休次数已用完（每日 2 次）。',
      message_thread_id: threadId,
      reply_markup: deleteMarkup,
    });
    return;
  }

  const classInfo = await getClassInfo(env, chatId, char.class);
  const hitDie = classInfo?.hit_die ?? 6;
  const attrs = parseAttributes(char.attributes);
  const conMod = calcMod(attrs.con);
  const recover = Math.max(1, hitDie + conMod);

  char.hp_current = Math.min(char.hp_max, char.hp_current + recover);
  char.rest_short_used++;
  await updateCharAndRest(env, char);

  await TgMessage.sendText(env, {
    chat_id: chatId,
    text: `🛌 <b>短休完成！</b>\n❤️ 恢复 ${recover} HP → ${char.hp_current}/${char.hp_max}\n📅 今日短休: ${char.rest_short_used}/2`,
    parse_mode: 'HTML',
    message_thread_id: threadId,
    reply_markup: deleteMarkup,
  });
}

// ── 内部: 更新休息状态 ────────────────────────────────────

async function updateCharAndRest(
  env: Env,
  char: { chat_id: string; user_id: string; hp_current: number; rest_short_used: number; rest_long_used: number; rest_date: string },
): Promise<void> {
  if (!env.DB) return;
  await env.DB.prepare(
    `UPDATE dnd_characters
     SET hp_current = ?, rest_short_used = ?, rest_long_used = ?, rest_date = ?, updated_at = datetime('now')
     WHERE chat_id = ? AND user_id = ?`
  )
    .bind(char.hp_current, char.rest_short_used, char.rest_long_used, char.rest_date, char.chat_id, char.user_id)
    .run();
}
