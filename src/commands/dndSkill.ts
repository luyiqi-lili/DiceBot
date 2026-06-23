/**
 * @file src/commands/dndSkill.ts
 * @description /skill <技能名> 和 *技能名 — 进行技能检定。
 *   支持回复目标进行 PVP 对抗检定，bot 回复挂在目标消息上，原始 *skill 消息删除。
 */

import TgMessage, { ParsedUpdate } from '../lib/telegram';
import { escapeHtml, deleteMarkup } from '../lib/util';
import { callAIChat, hasAIChatProvider } from '../lib/aiClient';
import type { Env } from '../index';
import {
  getCharacter,
  parseAttributes,
  calcMod,
  rollD20,
  rollD10,
  attrNameToKey,
  getDC,
  type DndSkillRow,
  type DndCharacterRow,
} from '../lib/dndCore';

// ── 内部: 查询技能 ────────────────────────────────────────

async function findSkill(
  env: Env, chatId: number, skillName: string,
): Promise<DndSkillRow | null> {
  if (!env.DB) return null;
  return await env.DB.prepare(
    `SELECT * FROM dnd_skills WHERE chat_id = ? AND skill_name = ?`
  ).bind(String(chatId), skillName).first<DndSkillRow>() ?? null;
}

// ── 内部: AI RP 描述 ──────────────────────────────────────

async function generateFlavor(
  env: Env,
  skillName: string,
  skillDesc: string,
  charName: string,
  charRace: string,
  charClass: string,
  myResult: number,
  gap: number,
  success: boolean | null,
  oppName?: string,
): Promise<string> {
  if (!hasAIChatProvider(env)) return '';

  let gapDesc = '';
  if (gap > 10) gapDesc = `以巨大优势（超出${gap}点）碾压成功`;
  else if (gap > 5) gapDesc = `轻松取胜（超出${gap}点）`;
  else if (gap > 0) gapDesc = `险胜，仅差${gap}点，非常接近`;
  else if (gap === 0) gapDesc = `刚好持平，惊险万分`;
  else if (gap > -5) gapDesc = `惜败，只差${Math.abs(gap)}点，功亏一篑`;
  else gapDesc = `惨败，差距${Math.abs(gap)}点，完全被压制`;

  try {
    const text = await callAIChat(env, {
      messages: [{
        role: 'system',
        content: '你是跑团叙事主持人。攻击方主动施展技能，成功则对手中招，失败则攻击方自己失误或被闪避——永远不要描述成攻击方被对方反击。根据技能描述判断是物理还是魔法：物理技能用拳脚武器描写，魔法技能才用法术描写。角色的职业标签不影响技能性质。输出1-2句纯中文第三人称。\n\n✅ 正确样例：\n物理技-成功：「弓身一记扫腿，精准勾住对手脚踝将其撂倒」\n物理技-失败：「伸腿横扫却失了准头，只擦过对方护胫，反因惯性踉跄半步」\n魔法技-成功：「指尖绽开冰蓝符文，寒气如蛇缠上对手双腿」\n魔法技-失败：「咒文念到一半气息紊乱，指间的火花噗地熄灭了」\n\n❌ 错误样例：\n「被对手一记反手摔在地上」— 攻击方不能被反击\n「拉斐尔在魔法塔中挥动法杖」— 不要虚构环境\n「法师用魔力一拳打去」— 物理技能不要加魔法',
      },
      {
        role: 'user',
        content: `${charName}是攻击方，${oppName || '目标'}是防守方。\n\n技能「${skillName}」：${skillDesc}\n攻击方掷点${myResult}，${gapDesc}\n\n请写出攻击方${charName}施展${skillName}的动作，纯中文：`,
      }],
      maxTokens: 200,
      temperature: 0.8,
      timeoutMs: 30000,
    });
    return text.replace(/^(描述[：:]|情景[：:]|\d+[\.、])\s*/i, '').trim();
  } catch { return ''; }
}

// ── 内部: 计算角色对某技能的加成 ──────────────────────────

async function calcCharBonus(
  env: Env, chatId: number, char: DndCharacterRow, skill: DndSkillRow,
): Promise<{ attrMod: number; raceBonus: number; attrName: string }> {
  const attrs = parseAttributes(char.attributes);
  const attrKey = attrNameToKey(skill.linked_attr);
  const attrVal = attrKey ? attrs[attrKey] : 10;
  const attrMod = calcMod(attrVal);

  let raceBonus = 0;
  try {
    const rb: Record<string, number> = JSON.parse(skill.race_bonus);
    if (rb[char.race]) raceBonus = rb[char.race];
  } catch {}

  return { attrMod, raceBonus, attrName: skill.linked_attr };
}

// ── 公共检定函数 ──────────────────────────────────────────

export async function performSkillCheck(
  env: Env,
  chatId: number,
  threadId: number | undefined,
  userId: string,
  skillName: string,
  opts?: {
    replyToMessageId?: number;       // bot 消息回复挂载
    targetUserId?: string;           // 被回复的目标用户 ID
    targetName?: string;             // 目标显示名
    deleteMsgId?: number;            // 删除原始 *skill 消息
  },
): Promise<void> {
  if (!skillName) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: '⚠️ 用法：<code>/skill 技能名</code> 或 <code>*技能名</code>\n示例：<code>*扑倒</code>',
      parse_mode: 'HTML', message_thread_id: threadId, reply_markup: deleteMarkup,
    });
    return;
  }

  if (!env.DB) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: '⚠️ DND 系统需要 D1 数据库支持，当前环境未配置。',
      message_thread_id: threadId, reply_markup: deleteMarkup,
    });
    return;
  }

  const char = await getCharacter(env, chatId, userId);
  if (!char) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: '⚠️ 你还没有角色。使用 <code>/new 种族 职业 角色名</code> 创建。',
      parse_mode: 'HTML', message_thread_id: threadId, reply_markup: deleteMarkup,
    });
    return;
  }

  const skill = await findSkill(env, chatId, skillName);
  if (!skill) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `⚠️ 技能「${escapeHtml(skillName)}」不存在。使用 /skills 查看可用技能。`,
      parse_mode: 'HTML', message_thread_id: threadId, reply_markup: deleteMarkup,
    });
    return;
  }

  // 发起者加成
  const my = await calcCharBonus(env, chatId, char, skill);
  // 判断熟练（proficiencies 列表）
  let profs: string[] = [];
  try { profs = JSON.parse(char.proficiencies); } catch {}
  const isProficient = profs.includes(skill.skill_name);
  const baseRoll = isProficient ? rollD20() : rollD10();
  const dieLabel = isProficient ? 'd20' : 'd10';
  const myTotal = baseRoll + my.attrMod + my.raceBonus;

  // 对手检定（如果有目标）—— 对抗掷骰
  let oppLine = '';
  let oppValue: number | null = null;
  let oppName = '';
  let targetChar: DndCharacterRow | null = null;

  if (opts?.targetUserId) {
    targetChar = await getCharacter(env, chatId, opts.targetUserId);
    if (targetChar) {
      const opp = await calcCharBonus(env, chatId, targetChar, skill);
      const oppRoll = rollD20();
      oppValue = oppRoll + opp.attrMod + opp.raceBonus;
      oppName = opts.targetName || targetChar.char_name;

      const oppParts: string[] = [];
      oppParts.push(`${escapeHtml(opp.attrName)}(${opp.attrMod >= 0 ? '+' : ''}${opp.attrMod})`);
      if (opp.raceBonus) oppParts.push(`种族(+${opp.raceBonus})`);
      oppLine = `\n🛡️ <b>${escapeHtml(oppName)}</b>：d20(${oppRoll}) + ${oppParts.join(' + ')} = <b>${oppValue}</b>`;
    }
  }

  // DC / 胜负判断
  let dcLine = '';
  let success: boolean | null = null;
  let dcInfo: { dc_value: number; description: string } | null = null;

  if (oppValue !== null) {
    success = myTotal > oppValue;
    dcLine = `\n⚔️ ${myTotal} vs ${oppValue} → ${success ? '✅ 成功！' : '❌ 失败'}`;
  } else {
    dcInfo = await getDC(env, chatId);
    if (dcInfo && dcInfo.dc_value > 0) {
      success = myTotal >= dcInfo.dc_value;
      dcLine = `\n📌 当前 DC：${dcInfo.dc_value} → ${success ? '✅ 成功！' : '❌ 失败'}`;
      if (dcInfo.description) dcLine += ` — ${escapeHtml(dcInfo.description)}`;
    }
  }

  // RP 描述
  let flavorLine = '';
  if (hasAIChatProvider(env)) {
    const gap = oppValue !== null ? myTotal - oppValue
      : (dcInfo?.dc_value ?? 0) > 0 ? myTotal - (dcInfo?.dc_value ?? 0)
      : 0;
    const flavor = await generateFlavor(env, skillName, skill.description || '', char.char_name, char.race, char.class, myTotal, gap, success, oppName || undefined);
    if (flavor) flavorLine = `\n📝 ${escapeHtml(flavor)}`;
  }

  // 组装发起者检定行
  const myParts: string[] = [];
  if (isProficient) myParts.push(`熟练(+${my.attrMod >= 0 ? '+' : ''}${my.attrMod})`);
  else myParts.push(`${escapeHtml(my.attrName)}(${my.attrMod >= 0 ? '+' : ''}${my.attrMod})`);
  if (my.raceBonus) myParts.push(`种族(+${my.raceBonus})`);
  const formulaStr = myParts.length > 0 ? ` + ${myParts.join(' + ')}` : '';

  const text =
    `🎲 <b>${escapeHtml(skillName)}</b>检定：${dieLabel}(${baseRoll})${formulaStr} = <b>${myTotal}</b>` +
    oppLine +
    dcLine +
    flavorLine;

  // 发送
  const sendOpts: any = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    message_thread_id: threadId,
    reply_markup: deleteMarkup,
  };
  if (opts?.replyToMessageId) {
    sendOpts.reply_to_message_id = opts.replyToMessageId;
  }
  await TgMessage.sendText(env, sendOpts);

  // 删除原始 *skill 消息
  if (opts?.deleteMsgId) {
    try { await TgMessage.deleteMessage(env, chatId, opts.deleteMsgId); } catch {}
  }
}

// ── /skill 命令入口 ────────────────────────────────────────

export async function handleDndSkill(parsed: ParsedUpdate, env: Env): Promise<void> {
  const chatId = parsed.chatId!;
  const threadId = parsed.threadId;
  const userId = String(parsed.from?.id ?? '');
  const args = parsed.args ?? [];
  const skillName = args.join(' ').trim();

  const opts: NonNullable<Parameters<typeof performSkillCheck>[5]> = {};

  if (parsed.isReply && parsed.replyToMessage?.from && !parsed.replyToMessage.from.is_bot) {
    opts.replyToMessageId = parsed.replyToMessage.message_id;
    opts.targetUserId = String(parsed.replyToMessage.from.id);
    opts.targetName = parsed.replyToMessage.from.first_name || opts.targetUserId;
  }

  await performSkillCheck(env, chatId, threadId, userId, skillName, opts);
}
