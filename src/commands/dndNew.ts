/**
 * @file src/commands/dndNew.ts
 * @description /new — DND 角色创建，预览即写入 DB。
 *   1. /new → 校验、掷属性、写入 dnd_characters、显示预览 + [确认] [重骰]
 *   2. 确认 → 编辑消息显示"创建成功"
 *   3. 重骰 → 重新掷属性、UPDATE DB、更新预览
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
  getCharacter,
  saveCharacter,
  getRaceBonuses,
  getClassInfo,
  getSkillsForClass,
  initPresetsToDB,
  type DndCharAttributes,
} from '../lib/dndCore';

// ── 回调类型 ──────────────────────────────────────────────

interface DndActionCb {
  type: 'dnd_confirm' | 'dnd_reroll';
  c: string;  // chatId
  u: string;  // userId
  r: string;  // raceName
  cl: string; // className
  n: string;  // charName
}

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

  if (await getCharacter(env, chatId, userId)) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `⚠️ 你已有角色，每个用户只能创建一个角色。`,
      parse_mode: 'HTML',
      message_thread_id: threadId,
      reply_markup: deleteMarkup,
    });
    return;
  }

  // 掷属性 → 写入 DB
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

  // 预览消息
  const confirmCb: DndActionCb = { type: 'dnd_confirm', c: String(chatId), u: userId, r: raceName, cl: className, n: charName };
  const rerollCb: DndActionCb = { ...confirmCb, type: 'dnd_reroll' };

  await TgMessage.sendText(env, {
    chat_id: chatId,
    text: `📋 <b>角色预览</b>\n\n${fmtCharSheet(charName, raceName, className, rolled.hpMax, rolled.attrs, rolled.proficiencies)}`,
    parse_mode: 'HTML',
    message_thread_id: threadId,
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ 确认创建', callback_data: JSON.stringify(confirmCb) },
          { text: '🔄 重骰属性', callback_data: JSON.stringify(rerollCb) },
        ],
      ],
    },
  });
}

// ── 确认创建回调 ──────────────────────────────────────────

export async function handleDndConfirmCallback(callbackQuery: any, callbackData: any, env: Env): Promise<void> {
  const cq = callbackQuery;
  const cd = callbackData as DndActionCb;
  if (!cd || cd.type !== 'dnd_confirm') return;

  if (String(cq.from?.id) !== cd.u) {
    await TgMessage.answerCallbackQuery(env, cq.id, { text: '只有角色创建者才能确认。', show_alert: true });
    return;
  }

  // 角色已在预览时写入 DB，编辑消息去掉按钮
  const msgId = cq.message?.message_id;
  if (msgId) {
    await TgMessage.send(env, 'editMessageReplyMarkup', {
      chat_id: parseInt(cd.c, 10), message_id: msgId,
      reply_markup: { inline_keyboard: [[{ text: '删除消息', callback_data: JSON.stringify({ type: 'delete_message' }) }]] },
    });
  }

  await TgMessage.answerCallbackQuery(env, cq.id, { text: '角色创建成功！🎉' });
}

// ── 重骰属性回调 ──────────────────────────────────────────

export async function handleDndRerollCallback(callbackQuery: any, callbackData: any, env: Env): Promise<void> {
  const cq = callbackQuery;
  const cd = callbackData as DndActionCb;
  if (!cd || cd.type !== 'dnd_reroll') return;

  if (String(cq.from?.id) !== cd.u) {
    await TgMessage.answerCallbackQuery(env, cq.id, { text: '只有角色创建者才能重骰。', show_alert: true });
    return;
  }

  if (!env.DB) return;

  const chatId = parseInt(cd.c, 10);

  // 重新掷属性
  const rolled = await rollAttrs(env, chatId, cd.r, cd.cl);
  if (!rolled) return;

  // 更新 DB
  await saveCharacter(env, {
    chat_id: String(chatId), user_id: cd.u,
    char_name: cd.n, race: cd.r, class: cd.cl,
    hp_max: rolled.hpMax, hp_current: rolled.hpMax,
    attributes: rolled.attrs, proficiencies: rolled.proficiencies,
  });

  // 更新消息
  const msgId = cq.message?.message_id;
  if (msgId) {
    const confirmCb: DndActionCb = { type: 'dnd_confirm', c: cd.c, u: cd.u, r: cd.r, cl: cd.cl, n: cd.n };
    const rerollCb: DndActionCb = { ...confirmCb, type: 'dnd_reroll' };

    await TgMessage.editMessageText(env, {
      chat_id: chatId, message_id: msgId,
      text: `🔄 已重骰属性！\n\n${fmtCharSheet(cd.n, cd.r, cd.cl, rolled.hpMax, rolled.attrs, rolled.proficiencies)}`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ 确认创建', callback_data: JSON.stringify(confirmCb) },
            { text: '🔄 重骰属性', callback_data: JSON.stringify(rerollCb) },
          ],
        ],
      },
    });
  }

  await TgMessage.answerCallbackQuery(env, cq.id, { text: '已重骰属性！' });
}
