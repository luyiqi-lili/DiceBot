/**
 * @file src/commands/dndGm.ts
 * @description /gm — DND GM 命令全集。
 *   包含种族/职业/技能管理、DC 设置、XP 管理、GM 任命。
 *   超级管理员 (8080375150) 天然拥有所有 GM 权限。
 */

import TgMessage, { ParsedUpdate } from '../lib/tgMessage';
import { escapeHtml, deleteMarkup } from '../lib/util';
import type { Env } from '../index';
import {
  requireGM,
  isSuperAdmin,
  parseAttrBonus,
  fmtAttrBonuses,
  setDC,
  getAllRaces,
  getAllClasses,
  getAllSkills,
  getCharacter,
  SUPER_ADMIN_ID,
  type DndRaceRow,
  type DndClassRow,
  type DndSkillRow,
} from '../lib/dndCore';
import {
  createTemplate, getAllTemplates, deleteTemplate,
  getTemplate, addToInventory,
  EQUIP_SLOTS, SLOT_NAMES, type EquipSlot,
} from '../lib/itemCore';

// ── GM 命令子路由 ─────────────────────────────────────────

export async function handleDndGm(parsed: ParsedUpdate, env: Env): Promise<void> {
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

  if (args.length === 0) {
    await sendHelp(env, chatId, threadId);
    return;
  }

  const sub = args[0];
  const rest = args.slice(1);

  switch (sub) {
    case '种族':
      if (rest.length === 0 || rest[0] === '加值') {
        // /gm 种族 或 /gm 种族加值
        const bonusArgs = rest.length > 0 ? rest.slice(1) : [];
        await handleRaceSet(env, chatId, threadId, userId, bonusArgs);
      } else {
        // /gm 种族 → list
        await handleRaceList(env, chatId, threadId);
      }
      break;

    case '种族加值':
      await handleRaceSet(env, chatId, threadId, userId, rest);
      break;

    case '职业':
      if (rest.length >= 2) {
        await handleClassSet(env, chatId, threadId, userId, rest);
      } else {
        await handleClassList(env, chatId, threadId);
      }
      break;

    case '技能':
      if (rest.length >= 4) {
        await handleSkillSet(env, chatId, threadId, userId, rest);
      } else {
        await handleSkillList(env, chatId, threadId);
      }
      break;

    case 'dc':
      await handleDCSet(env, chatId, threadId, userId, rest, parsed);
      break;

    case 'addxp':
      await handleAddXp(env, parsed, chatId, threadId, userId, rest);
      break;

    case 'setgm':
      await handleSetGm(env, parsed, chatId, threadId, userId);
      break;

    case 'item':
      if (rest.length === 0 || rest[0] === 'list') {
        await handleItemList(env, chatId, threadId);
      } else if (rest[0] === 'create') {
        await handleItemCreate(env, chatId, threadId, userId, rest.slice(1));
      } else if (rest[0] === 'delete') {
        await handleItemDelete(env, chatId, threadId, userId, rest.slice(1));
      } else if (rest[0] === 'give') {
        await handleItemGive(env, parsed, chatId, threadId, userId, rest.slice(1));
      } else {
        await TgMessage.sendText(env, {
          chat_id: chatId, message_thread_id: threadId,
          text: '⚠️ 未知 item 子命令。可用：create / list / delete / give',
          reply_markup: deleteMarkup,
        });
      }
      break;

    default:
      await sendHelp(env, chatId, threadId);
      break;
  }
}

// ── 帮助 ──────────────────────────────────────────────────

async function sendHelp(env: Env, chatId: number, threadId?: number) {
  await TgMessage.sendText(env, {
    chat_id: chatId,
    text: `⚙️ <b>DND GM 命令</b>\n\n` +
      `<b>🧬 种族管理</b>\n` +
      `<code>/gm 种族</code> — 列出\n` +
      `<code>/gm 种族加值 种族 +1属性 描述</code>\n` +
      `  例: <code>/gm 种族加值 精灵 +2敏捷,+1智力 精灵身手矫健又博学</code>\n\n` +
      `<b>⚔️ 职业管理</b>\n` +
      `<code>/gm 职业</code> — 列出\n` +
      `<code>/gm 职业 职业名 主属性 [生命骰] 描述</code>\n` +
      `  例: <code>/gm 职业 战士 力量 10 战士依靠力量使用武器</code>\n\n` +
      `<b>🏹 技能管理</b>\n` +
      `<code>/gm 技能</code> — 列出\n` +
      `<code>/gm 技能 技能名 种族+N 职业 属性 描述</code>\n` +
      `  例: <code>/gm 技能 扑倒 精灵+1 战士 敏捷 扑倒后什么都方便</code>\n` +
      `  例: <code>/gm 技能 火球术 人类+1 法师 智力 凝聚火焰掷向敌人</code>\n\n` +
      `<b>📦 物品管理</b>\n` +
      `<code>/gm item list</code> — 列出模板\n` +
      `<code>/gm item create 名称 装备/消耗品 [部位] [+N属性] [伤害骰] [次数] 描述</code>\n` +
      `  武器: <code>/gm item create 长剑 装备 weapon +2力量 d8力量 锋利的长剑</code>\n` +
      `  防具: <code>/gm item create 布甲 装备 body +1敏捷 轻便的布甲</code>\n` +
      `  消耗: <code>/gm item create 治疗药水 消耗品 3 恢复体力</code>\n` +
      `<code>/gm item delete 名称</code> — 删除模板\n` +
      `<code>/gm item give 名称 [数量]</code> — 回复某人发放\n\n` +
      `<b>📌 场景与 XP</b>\n` +
      `<code>/gm dc 数值 描述</code> — 设置场景 DC\n` +
      `  例: <code>/gm dc 12 地面湿滑难以下脚</code>\n` +
      `<code>/gm addxp 数值</code> — 回复某人添加 XP\n` +
      `  例: 回复某人 <code>/gm addxp 50</code>\n\n` +
      `<b>🛡️ 管理</b>\n` +
      `<code>/gm setgm</code> — 回复某人设为 GM（仅超管）\n` +
      `<code>/gm 种族</code> <code>/gm 职业</code> <code>/gm 技能</code> <code>/gm item list</code> — 查看当前配置`,
    parse_mode: 'HTML',
    message_thread_id: threadId,
    reply_markup: deleteMarkup,
  });
}

// ── 种族 ──────────────────────────────────────────────────

async function handleRaceList(env: Env, chatId: number, threadId?: number) {
  const races = await getAllRaces(env, chatId);
  if (races.length === 0) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: '暂无种族。使用 /gm 种族加值 添加。',
      message_thread_id: threadId,
    });
    return;
  }

  let text = '🧬 <b>种族列表</b>\n\n';
  for (const r of races) {
    let bonuses: Record<string, number> = {};
    try { bonuses = JSON.parse(r.attr_bonuses); } catch {}
    text += `• <b>${escapeHtml(r.race_name)}</b>: ${fmtAttrBonuses(bonuses)} — ${escapeHtml(r.description)}\n`;
  }
  await TgMessage.sendText(env, {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    message_thread_id: threadId,
  });
}

async function handleRaceSet(
  env: Env,
  chatId: number,
  threadId: number | undefined,
  userId: string,
  args: string[],
) {
  // 权限检查
  const gmErr = await requireGM(env, chatId, userId);
  if (gmErr) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: gmErr,
      message_thread_id: threadId,
      reply_markup: deleteMarkup,
    });
    return;
  }

  if (args.length < 2) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: '⚠️ 格式：<code>/gm 种族加值 种族 +1属性 描述</code>',
      parse_mode: 'HTML',
      message_thread_id: threadId,
    });
    return;
  }

  const raceName = args[0];
  const bonusText = args[1];
  const description = args.slice(2).join(' ');

  const newBonuses = parseAttrBonus(bonusText);
  if (Object.keys(newBonuses).length === 0) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `⚠️ 无法解析属性加值「${escapeHtml(bonusText)}」。格式：+1力量 或 +2敏捷,+1智力`,
      parse_mode: 'HTML',
      message_thread_id: threadId,
    });
    return;
  }

  // 幂等: 合并已有 bonus
  const existing = await env.DB!.prepare(
    `SELECT attr_bonuses FROM dnd_races WHERE chat_id = ? AND race_name = ?`
  )
    .bind(String(chatId), raceName)
    .first<{ attr_bonuses: string }>();

  let merged: Record<string, number> = {};
  if (existing) {
    try { merged = JSON.parse(existing.attr_bonuses); } catch {}
  }
  // 合并：新值覆盖旧值
  Object.assign(merged, newBonuses);

  // 去掉值为 0 的条目
  for (const k of Object.keys(merged)) {
    if (merged[k] === 0) delete merged[k];
  }

  if (existing) {
    await env.DB!.prepare(
      `UPDATE dnd_races SET attr_bonuses = ?, description = ?, updated_at = datetime('now')
       WHERE chat_id = ? AND race_name = ?`
    )
      .bind(JSON.stringify(merged), description, String(chatId), raceName)
      .run();
  } else {
    await env.DB!.prepare(
      `INSERT INTO dnd_races (chat_id, race_name, attr_bonuses, description)
       VALUES (?, ?, ?, ?)`
    )
      .bind(String(chatId), raceName, JSON.stringify(merged), description)
      .run();
  }

  await TgMessage.sendText(env, {
    chat_id: chatId,
    text: `✅ 种族「${escapeHtml(raceName)}」已更新：${fmtAttrBonuses(merged)} — ${escapeHtml(description)}`,
    parse_mode: 'HTML',
    message_thread_id: threadId,
  });
}

// ── 职业 ──────────────────────────────────────────────────

async function handleClassList(env: Env, chatId: number, threadId?: number) {
  const classes = await getAllClasses(env, chatId);
  if (classes.length === 0) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: '暂无职业。使用 /gm 职业 添加。',
      message_thread_id: threadId,
    });
    return;
  }

  let text = '⚔️ <b>职业列表</b>\n\n';
  for (const c of classes) {
    text += `• <b>${escapeHtml(c.class_name)}</b> — 主属性: ${escapeHtml(c.primary_attr)} | d${c.hit_die} — ${escapeHtml(c.description)}\n`;
  }
  await TgMessage.sendText(env, {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    message_thread_id: threadId,
  });
}

async function handleClassSet(
  env: Env,
  chatId: number,
  threadId: number | undefined,
  userId: string,
  args: string[],
) {
  const gmErr = await requireGM(env, chatId, userId);
  if (gmErr) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: gmErr,
      message_thread_id: threadId,
    });
    return;
  }

  if (args.length < 2) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: '⚠️ 格式：<code>/gm 职业 职业名 主属性 [生命骰] 描述</code>\n示例：<code>/gm 职业 战士 力量 10 战士们锻炼通过力量使用各种武器</code>',
      parse_mode: 'HTML',
      message_thread_id: threadId,
    });
    return;
  }

  const className = args[0];
  const primaryAttr = args[1];

  const validAttrs = ['力量', '敏捷', '体质', '智力', '感知', '魅力'];
  if (!validAttrs.includes(primaryAttr)) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `⚠️ 无效主属性「${escapeHtml(primaryAttr)}」。有效值：${validAttrs.join('/')}`,
      parse_mode: 'HTML',
      message_thread_id: threadId,
    });
    return;
  }

  // args[2] 可选生命骰面数（纯数字），否则归入描述
  let hitDie = 8;
  let descStart = 2;
  if (args.length > 2 && /^\d+$/.test(args[2])) {
    const parsed = parseInt(args[2], 10);
    if (parsed >= 2 && parsed <= 20) { hitDie = parsed; descStart = 3; }
  }
  const description = args.slice(descStart).join(' ');
  if (!args[2] || !/^\d+$/.test(args[2])) {
    // 未指定生命骰时按职业名推算
    hitDie = 8;
    if (['法师', '术士', '巫师'].includes(className)) hitDie = 6;
    if (['战士', '野蛮人', '圣武士'].includes(className)) hitDie = 10;
  }

  const existing = await env.DB!.prepare(
    `SELECT 1 FROM dnd_classes WHERE chat_id = ? AND class_name = ?`
  )
    .bind(String(chatId), className)
    .first();

  if (existing) {
    await env.DB!.prepare(
      `UPDATE dnd_classes SET primary_attr = ?, hit_die = ?, description = ?, updated_at = datetime('now')
       WHERE chat_id = ? AND class_name = ?`
    )
      .bind(primaryAttr, hitDie, description, String(chatId), className)
      .run();
  } else {
    await env.DB!.prepare(
      `INSERT INTO dnd_classes (chat_id, class_name, primary_attr, hit_die, description)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(String(chatId), className, primaryAttr, hitDie, description)
      .run();
  }

  await TgMessage.sendText(env, {
    chat_id: chatId,
    text: `✅ 职业「${escapeHtml(className)}」已更新：主属性 ${escapeHtml(primaryAttr)} | d${hitDie} — ${escapeHtml(description)}`,
    parse_mode: 'HTML',
    message_thread_id: threadId,
  });
}

// ── 技能 ──────────────────────────────────────────────────

async function handleSkillList(env: Env, chatId: number, threadId?: number) {
  const skills = await getAllSkills(env, chatId);
  if (skills.length === 0) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: '暂无技能。使用 /gm 技能 添加。',
      message_thread_id: threadId,
    });
    return;
  }

  let text = '🏹 <b>技能列表</b>\n\n';
  for (const s of skills) {
    let rb: Record<string, number> = {};
    try { rb = JSON.parse(s.race_bonus); } catch {}
    const raceStr = Object.entries(rb).map(([k, v]) => `${k}${v >= 0 ? '+' : ''}${v}`).join(', ') || '无';
    text += `• <b>${escapeHtml(s.skill_name)}</b> (${escapeHtml(s.linked_attr)}) — ${escapeHtml(s.class_name)} | 种族: ${escapeHtml(raceStr)} — ${escapeHtml(s.description)}\n`;
  }
  await TgMessage.sendText(env, {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    message_thread_id: threadId,
  });
}

async function handleSkillSet(
  env: Env,
  chatId: number,
  threadId: number | undefined,
  userId: string,
  args: string[],
) {
  const gmErr = await requireGM(env, chatId, userId);
  if (gmErr) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: gmErr,
      message_thread_id: threadId,
    });
    return;
  }

  if (args.length < 4) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: '⚠️ 格式：<code>/gm 技能 技能名 种族+N 职业 属性 [法力] [伤害骰] [等级] 描述</code>\n' +
        '物理技能：<code>/gm 技能 扑倒 精灵+1 战士 敏捷 扑到目标</code>\n' +
        '魔法技能：<code>/gm 技能 火球术 人类+1 法师 智力 3 2d6 1 凝聚火焰掷向敌人</code>',
      parse_mode: 'HTML',
      message_thread_id: threadId,
    });
    return;
  }

  const skillName = args[0];
  const raceBonusText = args[1];
  const className = args[2];
  const linkedAttr = args[3];

  // 解析可选参数: [法力消耗] [伤害骰] [法术等级]
  let manaCost = 0;
  let damage = '';
  let spellLevel = 1;
  let descIdx = 4;
  if (args.length > descIdx && /^\d+$/.test(args[descIdx])) {
    manaCost = parseInt(args[descIdx], 10);
    descIdx++;
  }
  if (args.length > descIdx && /^(\d*d\d+|\d+d\d+|d\d+)/.test(args[descIdx])) {
    damage = args[descIdx];
    descIdx++;
  } else if (args.length > descIdx && args[descIdx] === 'heal' && args.length > descIdx + 1 && /^(\d*d\d+)/.test(args[descIdx + 1])) {
    damage = args[descIdx + 1] + ' heal';
    descIdx += 2;
  }
  if (args.length > descIdx && /^\d+$/.test(args[descIdx])) {
    spellLevel = parseInt(args[descIdx], 10);
    descIdx++;
  }
  const description = args.slice(descIdx).join(' ');

  // 解析种族加值 "精灵+1" 或 "人类+1"
  const raceBonus = parseSkillRaceBonus(raceBonusText);

  const validAttrs = ['力量', '敏捷', '体质', '智力', '感知', '魅力'];
  if (!validAttrs.includes(linkedAttr)) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `⚠️ 无效属性「${escapeHtml(linkedAttr)}」。有效值：${validAttrs.join('/')}`,
      parse_mode: 'HTML',
      message_thread_id: threadId,
    });
    return;
  }

  const existing = await env.DB!.prepare(
    `SELECT 1 FROM dnd_skills WHERE chat_id = ? AND skill_name = ?`
  )
    .bind(String(chatId), skillName)
    .first();

  if (existing) {
    await env.DB!.prepare(
      `UPDATE dnd_skills SET linked_attr = ?, class_name = ?, race_bonus = ?, damage = ?, mana_cost = ?, spell_level = ?, description = ?, updated_at = datetime('now')
       WHERE chat_id = ? AND skill_name = ?`
    )
      .bind(linkedAttr, className, JSON.stringify(raceBonus), damage, manaCost, spellLevel, description, String(chatId), skillName)
      .run();
  } else {
    await env.DB!.prepare(
      `INSERT INTO dnd_skills (chat_id, skill_name, linked_attr, class_name, race_bonus, damage, mana_cost, spell_level, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(String(chatId), skillName, linkedAttr, className, JSON.stringify(raceBonus), damage, manaCost, spellLevel, description)
      .run();
  }

  const raceStr = Object.entries(raceBonus).map(([k, v]) => `${k}${v >= 0 ? '+' : ''}${v}`).join(', ') || '无';
  const dmgStr = damage ? ` | 伤害 ${damage}` : '';
  const manaStr = manaCost ? ` | 消耗 ${manaCost} MP` : '';

  await TgMessage.sendText(env, {
    chat_id: chatId,
    text: `✅ 技能「${escapeHtml(skillName)}」已更新：${escapeHtml(linkedAttr)} | ${escapeHtml(className)} | 种族: ${escapeHtml(raceStr)}${dmgStr}${manaStr} | Lv.${spellLevel} — ${escapeHtml(description)}`,
    parse_mode: 'HTML',
    message_thread_id: threadId,
  });
}

/** 解析技能种族加值 "精灵+1" → {精灵: 1}, "人类+2,精灵+1" → {人类:2,精灵:1} */
function parseSkillRaceBonus(text: string): Record<string, number> {
  const result: Record<string, number> = {};
  if (!text || text === '无') return result;

  const parts = text.split(/[,，]/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    // "精灵+1" 或 "人类+2"
    let m = trimmed.match(/^(.+?)\s*([+-]\d+)$/);
    if (m) {
      result[m[1].trim()] = parseInt(m[2], 10);
      continue;
    }
    m = trimmed.match(/^([+-]?\d+)\s*(.+)$/);
    if (m) {
      result[m[2].trim()] = parseInt(m[1], 10);
    }
  }
  return result;
}

// ── DC 设置 ───────────────────────────────────────────────

async function handleDCSet(
  env: Env,
  chatId: number,
  threadId: number | undefined,
  userId: string,
  args: string[],
  parsed: ParsedUpdate,
) {
  const gmErr = await requireGM(env, chatId, userId);
  if (gmErr) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: gmErr,
      message_thread_id: threadId,
    });
    return;
  }

  if (args.length < 1) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: '⚠️ 格式：<code>/gm dc 数值 描述</code>\n示例：<code>/gm dc 12 地面湿滑</code>',
      parse_mode: 'HTML',
      message_thread_id: threadId,
    });
    return;
  }

  const dcValue = parseInt(args[0], 10);
  if (isNaN(dcValue) || dcValue < 1) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `⚠️ 「${escapeHtml(args[0])}」不是有效的 DC 数值。`,
      parse_mode: 'HTML',
      message_thread_id: threadId,
    });
    return;
  }

  const description = args.slice(1).join(' ');
  await setDC(env, chatId, dcValue, description, userId);

  await TgMessage.sendText(env, {
    chat_id: chatId,
    text: `✅ DC 已设置为 <b>${dcValue}</b>${description ? ` — ${escapeHtml(description)}` : ''}`,
    parse_mode: 'HTML',
    message_thread_id: threadId,
  });
}

// ── 添加 XP ───────────────────────────────────────────────

async function handleAddXp(
  env: Env,
  parsed: ParsedUpdate,
  chatId: number,
  threadId: number | undefined,
  userId: string,
  args: string[],
) {
  const gmErr = await requireGM(env, chatId, userId);
  if (gmErr) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: gmErr,
      message_thread_id: threadId,
    });
    return;
  }

  const xpAmount = parseInt(args[0], 10);
  if (isNaN(xpAmount) || xpAmount <= 0) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `⚠️ 「${escapeHtml(args[0] || '')}」不是有效的 XP 数值。`,
      parse_mode: 'HTML',
      message_thread_id: threadId,
    });
    return;
  }

  // 必须回复某人
  if (!parsed.isReply || !parsed.replyToMessage?.from) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: '⚠️ 请回复某人的消息来为该用户添加 XP。',
      message_thread_id: threadId,
    });
    return;
  }

  const targetId = String(parsed.replyToMessage.from.id);
  const char = await getCharacter(env, chatId, targetId);
  if (!char) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `⚠️ 该用户还没有角色。`,
      message_thread_id: threadId,
    });
    return;
  }

  const newXp = char.xp + xpAmount;
  await env.DB!.prepare(
    `UPDATE dnd_characters SET xp = ?, updated_at = datetime('now') WHERE chat_id = ? AND user_id = ?`
  )
    .bind(newXp, String(chatId), targetId)
    .run();

  const targetName = escapeHtml(parsed.replyToMessage.from.first_name || targetId);

  await TgMessage.sendText(env, {
    chat_id: chatId,
    text: `✅ ${targetName}<b> +${xpAmount} XP</b>\n📊 ${escapeHtml(char.char_name)} 当前 XP: ${newXp}`,
    parse_mode: 'HTML',
    message_thread_id: threadId,
  });
}

// ── 设置 GM ───────────────────────────────────────────────

async function handleSetGm(
  env: Env,
  parsed: ParsedUpdate,
  chatId: number,
  threadId: number | undefined,
  userId: string,
) {
  // 仅超级管理员
  if (!isSuperAdmin(userId)) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: '⛔ 仅超级管理员可任命 GM。',
      message_thread_id: threadId,
    });
    return;
  }

  if (!parsed.isReply || !parsed.replyToMessage?.from) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: '⚠️ 请回复某人的消息来将其设为 GM。',
      message_thread_id: threadId,
    });
    return;
  }

  const targetId = String(parsed.replyToMessage.from.id);
  const targetName = escapeHtml(parsed.replyToMessage.from.first_name || targetId);

  // 幂等写入
  await env.DB!.prepare(
    `INSERT OR IGNORE INTO dnd_gm (chat_id, user_id, set_by) VALUES (?, ?, ?)`
  )
    .bind(String(chatId), targetId, userId)
    .run();

  await TgMessage.sendText(env, {
    chat_id: chatId,
    text: `✅ ${targetName} 已被任命为本群 GM。`,
    parse_mode: 'HTML',
    message_thread_id: threadId,
  });
}

// ── 物品管理 ──────────────────────────────────────────────

async function handleItemList(env: Env, chatId: number, threadId?: number) {
  const items = await getAllTemplates(env, String(chatId));
  if (items.length === 0) {
    await TgMessage.sendText(env, {
      chat_id: chatId, text: '暂无物品模板。使用 /gm item create 创建。',
      message_thread_id: threadId,
    });
    return;
  }
  let text = '📦 <b>物品模板</b>\n\n';
  for (const item of items) {
    const typeLabel = item.item_type === '装备' ? '⚔️' : '💊';
    const slotLabel = item.slot ? ` [${item.slot}]` : '';
    text += `${typeLabel} <b>${escapeHtml(item.name)}</b>${slotLabel} — ${escapeHtml(item.description || '')}\n`;
  }
  await TgMessage.sendText(env, {
    chat_id: chatId, text, parse_mode: 'HTML', message_thread_id: threadId,
  });
}

async function handleItemCreate(
  env: Env, chatId: number, threadId: number | undefined, userId: string, args: string[],
) {
  const gmErr = await requireGM(env, chatId, userId);
  if (gmErr) { await TgMessage.sendText(env, { chat_id: chatId, text: gmErr, message_thread_id: threadId }); return; }

  if (args.length < 3) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: '⚠️ 格式：<code>/gm item create 名称 装备/消耗品 [部位] [+N属性] [伤害骰] [次数] 描述</code>\n' +
        '示例：<code>/gm item create 铁头盔 装备 head +1体质 坚固</code>\n' +
        '示例：<code>/gm item create 长剑 装备 weapon +2力量 d8力量 锋利的长剑</code>\n' +
        '示例：<code>/gm item create 治疗药水 消耗品 3 恢复体力</code>',
      parse_mode: 'HTML', message_thread_id: threadId,
    });
    return;
  }

  const name = args[0];
  const itemType = args[1] as '装备' | '消耗品';
  if (itemType !== '装备' && itemType !== '消耗品') {
    await TgMessage.sendText(env, {
      chat_id: chatId, text: '⚠️ 类型必须是「装备」或「消耗品」。', message_thread_id: threadId,
    });
    return;
  }

  let slot = '';
  let attrBonus: Record<string, number> = {};
  let damage = '';
  let uses = 0;
  let descStart = 2;

  if (itemType === '装备') {
    if (EQUIP_SLOTS.includes(args[2] as any)) {
      slot = args[2];
      descStart = 3;
    }
    if (args.length > descStart && /^[+-]\d/.test(args[descStart])) {
      attrBonus = parseAttrBonus(args[descStart]);
      descStart++;
    }
    // 伤害骰: d8力量 / 2d6敏捷 / d4
    if (args.length > descStart && /^(\d*d\d+|\d+d\d+|d\d+)/.test(args[descStart])) {
      damage = args[descStart];
      descStart++;
    }
  } else {
    if (/^\d+$/.test(args[2])) {
      uses = parseInt(args[2], 10);
      descStart = 3;
    }
  }

  const description = args.slice(descStart).join(' ');

  await createTemplate(env, String(chatId), name, itemType, slot, attrBonus, damage, uses, description);

  const bonusStr = Object.keys(attrBonus).length > 0
    ? ` | ${fmtAttrBonuses(attrBonus)}`
    : '';
  const dmgStr = damage ? ` | 伤害 ${damage}` : '';
  const usesStr = itemType === '消耗品' ? ` | ×${uses || '∞'}` : '';

  await TgMessage.sendText(env, {
    chat_id: chatId,
    text: `✅ 物品「${escapeHtml(name)}」已创建：${itemType}${slot ? ' [' + slot + ']' : ''}${bonusStr}${dmgStr}${usesStr} — ${escapeHtml(description)}`,
    parse_mode: 'HTML', message_thread_id: threadId,
  });
}

async function handleItemDelete(
  env: Env, chatId: number, threadId: number | undefined, userId: string, args: string[],
) {
  const gmErr = await requireGM(env, chatId, userId);
  if (gmErr) { await TgMessage.sendText(env, { chat_id: chatId, text: gmErr, message_thread_id: threadId }); return; }

  const name = args.join(' ').trim();
  if (!name) {
    await TgMessage.sendText(env, { chat_id: chatId, text: '⚠️ 请指定物品名称。', message_thread_id: threadId });
    return;
  }

  const ok = await deleteTemplate(env, String(chatId), name);
  await TgMessage.sendText(env, {
    chat_id: chatId,
    text: ok ? `✅ 物品模板「${escapeHtml(name)}」已删除。` : `⚠️ 物品「${escapeHtml(name)}」不存在。`,
    parse_mode: 'HTML', message_thread_id: threadId,
  });
}

async function handleItemGive(
  env: Env, parsed: ParsedUpdate, chatId: number, threadId: number | undefined,
  userId: string, args: string[],
) {
  const gmErr = await requireGM(env, chatId, userId);
  if (gmErr) { await TgMessage.sendText(env, { chat_id: chatId, text: gmErr, message_thread_id: threadId }); return; }

  if (!parsed.isReply || !parsed.replyToMessage?.from) {
    await TgMessage.sendText(env, {
      chat_id: chatId, text: '⚠️ 请回复目标用户的消息来发放物品。', message_thread_id: threadId,
    });
    return;
  }

  const targetId = String(parsed.replyToMessage.from.id);
  const targetName = parsed.replyToMessage.from.first_name || targetId;

  const itemName = args.join(' ').replace(/\s+\d+$/, '').trim();
  const qtyMatch = args.join(' ').match(/(\d+)$/);
  const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

  if (!itemName) {
    await TgMessage.sendText(env, {
      chat_id: chatId, text: '⚠️ 用法：<code>/gm item give 名称 [数量]</code>', parse_mode: 'HTML', message_thread_id: threadId,
    });
    return;
  }

  const tpl = await getTemplate(env, String(chatId), itemName);
  if (!tpl) {
    await TgMessage.sendText(env, {
      chat_id: chatId, text: `⚠️ 物品模板「${escapeHtml(itemName)}」不存在。`, parse_mode: 'HTML', message_thread_id: threadId,
    });
    return;
  }

  await addToInventory(env, String(chatId), targetId, tpl.id, qty);

  await TgMessage.sendText(env, {
    chat_id: chatId,
    text: `✅ 已向 ${escapeHtml(targetName)} 发放 ${escapeHtml(itemName)} ×${qty}`,
    parse_mode: 'HTML', message_thread_id: threadId, reply_markup: deleteMarkup,
  });
}