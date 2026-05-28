/**
 * @file src/commands/dndNew.ts
 * @description /new — DND 角色创建，预览即写入 DB。
 *   1. /new → 校验、掷属性、写入 dnd_characters、显示预览 + [确认] [重骰]
 *   2. 确认 → 编辑消息去掉按钮
 *   3. 重骰 → 重新掷属性、UPDATE DB、更新预览
 *
 *   callback_data 极小化（~15字节），避免超 64 字节限制。
 */

import TgMessage, { ParsedUpdate } from '../lib/tgMessage';
import { escapeHtml, deleteMarkup } from '../lib/util';
import type { Env } from '../index';
import {
  roll6x4d6k3,
  shuffle,
  calcMod,
  calcMaxHP,
  fmtMod,
  attrKeyToName,
  attrNameToKey,
  ALL_ATTR_KEYS,
  saveCharacter,
  getRaceBonuses,
  getClassInfo,
  getSkillsForClass,
  initPresetsToDB,
  getCharacter,
  type DndCharAttributes,
} from '../lib/dndCore';

// ── 回调类型（极小化，控制在 64 字节内）───────────────────
// {"type":"dnd_confirm"}  ~25字节
// {"type":"dnd_reroll"}   ~23字节

// ── 格式化 ────────────────────────────────────────────────

function fmtAttrsBlock(attrs: DndCharAttributes): string {
  return ALL_ATTR_KEYS.map(k => {
    const val = attrs[k];
    const mod = fmtMod(val);
    const modStr = mod === '0' ? '±0' : mod;
    return `${escapeHtml(attrKeyToName(k))} <b>${val}</b> (${modStr})`;
  }).join(' | ');
}

function fmtCharSheet(
  charName: string, raceName: string, className: string,
  hpMax: number, attrs: DndCharAttributes, proficiencies: string[],
): string {
  return (
    `📜 <b>${escapeHtml(charName)}</b>\n` +
    `🎭 ${escapeHtml(raceName)} | ${escapeHtml(className)} Lv.1\n` +
    `❤️ HP: ${hpMax}/${hpMax}\n` +
    `⭐ XP: 0\n\n` +
    `<b>📊 属性</b>\n` +
    fmtAttrsBlock(attrs) + '\n\n' +
    `<b>🏹 技能熟练</b>: ${proficiencies.length > 0 ? proficiencies.map(s => escapeHtml(s)).join('、') : '无'}`
  );
}

// ── 内部: 生成属性 + 计算 ─────────────────────────────────

async function rollAttrs(
  env: Env, chatId: number, raceName: string, className: string,
): Promise<{ attrs: DndCharAttributes; hpMax: number; proficiencies: string[] } | null> {
  const rolls = roll6x4d6k3();
  const shuffledKeys = shuffle([...ALL_ATTR_KEYS]);
  const attrs: DndCharAttributes = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  for (let i = 0; i < 6; i++) {
    attrs[shuffledKeys[i]] = rolls[i];
  }

  const raceBonuses = await getRaceBonuses(env, chatId, raceName);
  if (raceBonuses) {
    for (const [name, val] of Object.entries(raceBonuses)) {
      const key = attrNameToKey(name);
      if (key) attrs[key] = (attrs[key] ?? 10) + val;
    }
  }

  const classInfo = await getClassInfo(env, chatId, className);
  const hitDie = classInfo?.hit_die ?? 6;
  const hpMax = calcMaxHP(hitDie, calcMod(attrs.con));

  const skills = await getSkillsForClass(env, chatId, className);
  const proficiencies = skills.map(s => s.skill_name);

  return { attrs, hpMax, proficiencies };
}

// ── /new 主入口 ────────────────────────────────────────────

export async function handleDndNew(parsed: ParsedUpdate, env: Env): Promise<void> {
  const chatId = parsed.chatId!;
  const threadId = parsed.threadId;
  const userId = String(parsed.from?.id ?? '');
  const args = parsed.args ?? [];

  if (!env.DB) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: '⚠️ DND 系统需要 D1 数据库支持，当前环境未配置。',
      message_thread_id: threadId,
      reply_markup: deleteMarkup,
    });
    return;
  }

  await initPresetsToDB(env, chatId);

  if (args.length < 3) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: '⚠️ 格式：<code>/new 种族 职业 角色名</code>\n示例：<code>/new 精灵 法师 拉斐尔</code>',
      parse_mode: 'HTML',
      message_thread_id: threadId,
      reply_markup: deleteMarkup,
    });
    return;
  }

  const raceName = args[0];
  const className = args[1];
  const charName = args.slice(2).join(' ').trim();

  if (!charName) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: '⚠️ 角色名不能为空。',
      message_thread_id: threadId,
      reply_markup: deleteMarkup,
    });
    return;
  }

  if (!(await getRaceBonuses(env, chatId, raceName))) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `⚠️ 种族「${escapeHtml(raceName)}」不存在。请使用 /dnd 查看可用种族。`,
      parse_mode: 'HTML',
      message_thread_id: threadId,
      reply_markup: deleteMarkup,
    });
    return;
  }

  if (!(await getClassInfo(env, chatId, className))) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `⚠️ 职业「${escapeHtml(className)}」不存在。请使用 /dnd 查看可用职业。`,
      parse_mode: 'HTML',
      message_thread_id: threadId,
      reply_markup: deleteMarkup,
    });
    return;
  }

  // 掷属性 → 写入 DB（已有角色则覆盖）
  const rolled = await rollAttrs(env, chatId, raceName, className);
  if (!rolled) {
    await TgMessage.sendText(env, { chat_id: chatId, text: '⚠️ 生成角色失败，请重试。', message_thread_id: threadId });
    return;
  }

  await saveCharacter(env, {
    chat_id: String(chatId), user_id: userId,
    char_name: charName, race: raceName, class: className,
    hp_max: rolled.hpMax, hp_current: rolled.hpMax,
    attributes: rolled.attrs, proficiencies: rolled.proficiencies,
  });

  // 预览消息 — callback 只含 type（~15 字节）
  await TgMessage.sendText(env, {
    chat_id: chatId,
    text: `📋 <b>角色预览</b>\n\n${fmtCharSheet(charName, raceName, className, rolled.hpMax, rolled.attrs, rolled.proficiencies)}`,
    parse_mode: 'HTML',
    message_thread_id: threadId,
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ 确认创建', callback_data: JSON.stringify({ type: 'dnd_confirm' }) },
          { text: '🔄 重骰属性', callback_data: JSON.stringify({ type: 'dnd_reroll' }) },
        ],
      ],
    },
  });
}

// ── 确认创建回调 ──────────────────────────────────────────

export async function handleDndConfirmCallback(callbackQuery: any, callbackData: any, env: Env): Promise<void> {
  if (!callbackData || callbackData.type !== 'dnd_confirm') return;

  const cq = callbackQuery;
  const msgId = cq.message?.message_id;
  const chatId = cq.message?.chat?.id;

  if (msgId && chatId) {
    await TgMessage.send(env, 'editMessageReplyMarkup', {
      chat_id: chatId, message_id: msgId,
      reply_markup: { inline_keyboard: [[{ text: '删除消息', callback_data: JSON.stringify({ type: 'delete_message' }) }]] },
    });
  }

  await TgMessage.answerCallbackQuery(env, cq.id, { text: '角色创建成功！🎉' });
}

// ── 重骰属性回调 ──────────────────────────────────────────

export async function handleDndRerollCallback(callbackQuery: any, callbackData: any, env: Env): Promise<void> {
  if (!callbackData || callbackData.type !== 'dnd_reroll') return;

  const cq = callbackQuery;
  const chatId = cq.message?.chat?.id;
  const userId = String(cq.from?.id);
  const msgId = cq.message?.message_id;

  if (!env.DB || !chatId) return;

  const char = await getCharacter(env, chatId, userId);
  if (!char) {
    await TgMessage.answerCallbackQuery(env, cq.id, { text: '角色数据丢失，请重新 /new。', show_alert: true });
    return;
  }

  // 重新掷属性
  const rolled = await rollAttrs(env, chatId, char.race, char.class);
  if (!rolled) return;

  // 更新 DB
  await saveCharacter(env, {
    chat_id: String(chatId), user_id: userId,
    char_name: char.char_name, race: char.race, class: char.class,
    hp_max: rolled.hpMax, hp_current: rolled.hpMax,
    attributes: rolled.attrs, proficiencies: rolled.proficiencies,
  });

  // 更新消息
  if (msgId) {
    await TgMessage.editMessageText(env, {
      chat_id: chatId, message_id: msgId,
      text: `🔄 已重骰属性！\n\n${fmtCharSheet(char.char_name, char.race, char.class, rolled.hpMax, rolled.attrs, rolled.proficiencies)}`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ 确认创建', callback_data: JSON.stringify({ type: 'dnd_confirm' }) },
            { text: '🔄 重骰属性', callback_data: JSON.stringify({ type: 'dnd_reroll' }) },
          ],
        ],
      },
    });
  }

  await TgMessage.answerCallbackQuery(env, cq.id, { text: '已重骰属性！' });
}
