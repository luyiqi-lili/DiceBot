/**
 * @file src/commands/dndNew.ts
 * @description /new — DND 角色创建命令 + dnd_reroll 回调处理。
 *   解析 /new <种族> <职业> <角色名>，校验、掷属性、写入 DB，返回角色卡。
 */

import TgMessage, { ParsedUpdate } from '../lib/tgMessage';
import { escapeHtml, deleteMarkup } from '../lib/util';
import type { Env } from '../index';
import {
  roll6x4d6k3,
  shuffle,
  parseAttributes,
  parseAttrBonus,
  calcMod,
  calcMaxHP,
  fmtMod,
  fmtAttrBonuses,
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
  type DndCharacterRow,
} from '../lib/dndCore';

// ── 回调类型 ──────────────────────────────────────────────

interface DndRerollCb {
  type: 'dnd_reroll';
  c: string;  // chatId
  u: string;  // userId
  r: string;  // raceName
  cl: string; // className
  n: string;  // charName
}

// ── 格式化角色卡 ──────────────────────────────────────────

function fmtCharSheet(char: DndCharacterRow): string {
  const attrs = parseAttributes(char.attributes);
  let profs: string[] = [];
  try { profs = JSON.parse(char.proficiencies); } catch {}

  const attrLines = ALL_ATTR_KEYS.map(k => {
    const val = attrs[k];
    const mod = fmtMod(val);
    const modStr = mod === '0' ? '±0' : mod;
    return `${escapeHtml(attrKeyToName(k))} <b>${val}</b> (${modStr})`;
  });

  return (
    `📜 <b>${escapeHtml(char.char_name)}</b>\n` +
    `🎭 ${escapeHtml(char.race)} | ${escapeHtml(char.class)} Lv.${char.level}\n` +
    `❤️ HP: ${char.hp_current}/${char.hp_max}\n` +
    `⭐ XP: ${char.xp}\n\n` +
    `<b>📊 属性</b>\n` +
    attrLines.join(' | ') + '\n\n' +
    `<b>🏹 技能熟练</b>: ${profs.length > 0 ? profs.map(s => escapeHtml(s)).join('、') : '无'}`
  );
}

// ── /new 主处理 ───────────────────────────────────────────

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

  // 1. 校验种族
  const raceBonuses = await getRaceBonuses(env, chatId, raceName);
  if (!raceBonuses) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `⚠️ 种族「${escapeHtml(raceName)}」不存在。请使用 /dnd 查看可用种族。`,
      parse_mode: 'HTML',
      message_thread_id: threadId,
      reply_markup: deleteMarkup,
    });
    return;
  }

  // 2. 校验职业
  const classInfo = await getClassInfo(env, chatId, className);
  if (!classInfo) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `⚠️ 职业「${escapeHtml(className)}」不存在。请使用 /dnd 查看可用职业。`,
      parse_mode: 'HTML',
      message_thread_id: threadId,
      reply_markup: deleteMarkup,
    });
    return;
  }

  // 3. 检查已有角色
  const existingChar = await getCharacter(env, chatId, userId);
  if (existingChar) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `⚠️ 角色名「${escapeHtml(existingChar.char_name)}」已存在，每个用户只能创建一个角色。`,
      parse_mode: 'HTML',
      message_thread_id: threadId,
      reply_markup: deleteMarkup,
    });
    return;
  }

  // 4. 掷属性 + 种族加值 + 写入
  const savedChar = await createAndSaveCharacter(env, chatId, userId, charName, raceName, className);

  await sendCharSheet(env, chatId, threadId, savedChar, '角色创建成功！');
}

// ── 内部: 创建角色并写入 DB ───────────────────────────────

async function createAndSaveCharacter(
  env: Env,
  chatId: number,
  userId: string,
  charName: string,
  raceName: string,
  className: string,
): Promise<DndCharacterRow> {
  // 掷 6 组 4d6k3 并随机分配
  const rolls = roll6x4d6k3();
  const shuffledKeys = shuffle([...ALL_ATTR_KEYS]);
  const attrs: DndCharAttributes = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  for (let i = 0; i < 6; i++) {
    attrs[shuffledKeys[i]] = rolls[i];
  }

  // 种族加值（中文属性名 → 数值，需转 key）
  const raceBonuses = await getRaceBonuses(env, chatId, raceName);
  if (raceBonuses) {
    for (const [name, val] of Object.entries(raceBonuses)) {
      const key = attrNameToKey(name);
      if (key) attrs[key] = (attrs[key] ?? 10) + val;
    }
  }

  // 职业信息
  const classInfo = await getClassInfo(env, chatId, className);
  const hitDie = classInfo?.hit_die ?? 6;
  const conMod = calcMod(attrs.con);
  const hpMax = calcMaxHP(hitDie, conMod);

  // 职业熟练技能
  const skills = await getSkillsForClass(env, chatId, className);
  const proficiencies = skills.map(s => s.skill_name);

  // 写入 DB
  await saveCharacter(env, {
    chat_id: String(chatId),
    user_id: userId,
    char_name: charName,
    race: raceName,
    class: className,
    hp_max: hpMax,
    hp_current: hpMax,
    attributes: attrs,
    proficiencies,
  });

  // 返回角色对象（不需要再查，直接构造）
  return {
    id: 0,
    chat_id: String(chatId),
    user_id: userId,
    char_name: charName,
    race: raceName,
    class: className,
    level: 1,
    xp: 0,
    hp_max: hpMax,
    hp_current: hpMax,
    attributes: JSON.stringify(attrs),
    proficiencies: JSON.stringify(proficiencies),
    equipment: '[]',
    rest_short_used: 0,
    rest_long_used: 0,
    rest_date: '',
  };
}

// ── 内部: 发送角色卡消息 ──────────────────────────────────

async function sendCharSheet(
  env: Env,
  chatId: number,
  threadId: number | undefined,
  char: DndCharacterRow,
  prefix: string,
): Promise<void> {
  const cb: DndRerollCb = {
    type: 'dnd_reroll',
    c: String(chatId),
    u: char.user_id,
    r: char.race,
    cl: char.class,
    n: char.char_name,
  };

  const text = `${escapeHtml(prefix)}\n\n${fmtCharSheet(char)}`;

  await TgMessage.sendText(env, {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    message_thread_id: threadId,
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🔄 重骰属性', callback_data: JSON.stringify(cb) },
          { text: '删除消息', callback_data: JSON.stringify({ type: 'delete_message' }) },
        ],
      ],
    },
  });
}

// ── dnd_reroll 回调 ───────────────────────────────────────

export async function handleDndRerollCallback(
  callbackQuery: any,
  callbackData: any,
  env: Env,
): Promise<void> {
  const cq = callbackQuery;
  const cd = callbackData as DndRerollCb;

  if (!cd || cd.type !== 'dnd_reroll') return;

  const chatId = parseInt(cd.c, 10);
  const userId = String(cd.u);
  const callerId = String(cq.from?.id);

  // 仅本人可重骰
  if (callerId !== userId) {
    await TgMessage.answerCallbackQuery(env, cq.id, {
      text: '只有角色创建者才能重骰属性。',
      show_alert: true,
    });
    return;
  }

  if (!env.DB) return;

  // 重新创建角色（覆盖）
  const savedChar = await createAndSaveCharacter(env, chatId, userId, cd.n, cd.r, cd.cl);

  // 编辑原消息
  const msgId = cq.message?.message_id;
  if (msgId) {
    await TgMessage.editMessageText(env, {
      chat_id: chatId,
      message_id: msgId,
      text: `🔄 已重骰属性！\n\n${fmtCharSheet(savedChar)}`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 重骰属性', callback_data: JSON.stringify(cd) },
            { text: '删除消息', callback_data: JSON.stringify({ type: 'delete_message' }) },
          ],
        ],
      },
    });
  }

  await TgMessage.answerCallbackQuery(env, cq.id, { text: '已重骰属性！' });
}
