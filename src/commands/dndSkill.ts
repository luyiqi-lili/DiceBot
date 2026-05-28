/**
 * @file src/commands/dndSkill.ts
 * @description /skill <技能名> 和 *技能名 — 进行技能检定。
 *   自动附加属性调整与熟练加值（若该技能熟练），对比场景 DC，
 *   并调用 Cloudflare AI 生成 RP 描述。
 *
 *   导出 performSkillCheck() 供 index.ts 在检测到 *技能名 时直接调用。
 */

import TgMessage, { ParsedUpdate } from '../lib/tgMessage';
import { escapeHtml, deleteMarkup } from '../lib/util';
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
} from '../lib/dndCore';

// ── 内部: 查询技能 ────────────────────────────────────────

async function findSkill(
  env: Env,
  chatId: number,
  skillName: string,
): Promise<DndSkillRow | null> {
  if (!env.DB) return null;
  return await env.DB.prepare(
    `SELECT * FROM dnd_skills WHERE chat_id = ? AND skill_name = ?`
  )
    .bind(String(chatId), skillName)
    .first<DndSkillRow>() ?? null;
}

// ── 内部: 调用 AI 生成 RP 描述 ────────────────────────────

async function generateFlavor(
  env: Env,
  skillName: string,
  result: number,
  success: boolean | null,
  dcInfo: { dc_value: number; description: string } | null,
): Promise<string> {
  if (!env.AI) return '';

  const dcText = dcInfo
    ? `DC=${dcInfo.dc_value}, ${dcInfo.description}`
    : '无特定DC';

  const outcome = success === null ? '无DC比较' : success ? '成功' : '失败';
  const prompt = `你是跑团主持人。为以下技能检定写一句简短生动的RP描述（15字以内，骰娘风格）：
技能：${skillName}
检定结果：${result}
${dcText}
结果：${outcome}

只输出中文描述，不要前缀。`;

  try {
    const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 60,
    });
    const text = (response as any)?.response ?? (response as any)?.choices?.[0]?.message?.content ?? '';
    return text.trim();
  } catch {
    return '';
  }
}

// ── 公共检定函数（/skill 命令 和 *技能名 共用）─────────────

export async function performSkillCheck(
  env: Env,
  chatId: number,
  threadId: number | undefined,
  userId: string,
  skillName: string,
): Promise<void> {
  if (!skillName) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: '⚠️ 用法：<code>/skill 技能名</code> 或 <code>*技能名</code>\n示例：<code>*扑倒</code>',
      parse_mode: 'HTML',
      message_thread_id: threadId,
      reply_markup: deleteMarkup,
    });
    return;
  }

  if (!env.DB) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: '⚠️ DND 系统需要 D1 数据库支持，当前环境未配置。',
      message_thread_id: threadId,
      reply_markup: deleteMarkup,
    });
    return;
  }

  const char = await getCharacter(env, chatId, userId);
  if (!char) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: '⚠️ 你还没有角色。使用 <code>/new 种族 职业 角色名</code> 创建。\n创建后执行 <code>/skill 技能名</code> 或 <code>*技能名</code> 进行检定。',
      parse_mode: 'HTML',
      message_thread_id: threadId,
      reply_markup: deleteMarkup,
    });
    return;
  }

  const skill = await findSkill(env, chatId, skillName);
  if (!skill) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `⚠️ 技能「${escapeHtml(skillName)}」不存在。使用 /skills 查看可用技能。`,
      parse_mode: 'HTML',
      message_thread_id: threadId,
      reply_markup: deleteMarkup,
    });
    return;
  }

  const attrs = parseAttributes(char.attributes);

  // 判断熟练
  const isProficient = char.class === skill.class_name;
  const baseRoll = isProficient ? rollD20() : rollD10();
  const dieLabel = isProficient ? 'd20' : 'd10';

  // 属性调整值
  const attrKey = attrNameToKey(skill.linked_attr);
  const attrVal = attrKey ? attrs[attrKey] : 10;
  const attrMod = calcMod(attrVal);

  // 种族加值
  let raceBonus = 0;
  try {
    const rb: Record<string, number> = JSON.parse(skill.race_bonus);
    if (rb[char.race]) raceBonus = rb[char.race];
  } catch {}

  const total = baseRoll + attrMod + raceBonus;

  // DC 比较
  const dcInfo = await getDC(env, chatId);
  let dcLine = '';
  let success: boolean | null = null;
  if (dcInfo && dcInfo.dc_value > 0) {
    success = total >= dcInfo.dc_value;
    dcLine = `\n📌 当前 DC：${dcInfo.dc_value} → ${success ? '✅ 成功！' : '❌ 失败'}`;
    if (dcInfo.description) dcLine += ` — ${escapeHtml(dcInfo.description)}`;
  }

  // RP 描述（AI）
  let flavorLine = '';
  if (env.AI) {
    const flavor = await generateFlavor(env, skillName, total, success, dcInfo);
    if (flavor) flavorLine = `\n📝 ${escapeHtml(flavor)}`;
  }

  // 组装输出
  const parts: string[] = [];
  if (isProficient) parts.push(`熟练(+${attrMod >= 0 ? '+' : ''}${attrMod})`);
  else parts.push(`${escapeHtml(skill.linked_attr)}(${attrMod >= 0 ? '+' : ''}${attrMod})`);
  if (raceBonus) parts.push(`种族(+${raceBonus})`);

  const formulaStr = parts.length > 0 ? ` + ${parts.join(' + ')}` : '';

  const text =
    `🎲 <b>${escapeHtml(skillName)}</b>检定：${dieLabel}(${baseRoll})${formulaStr} = <b>${total}</b>` +
    dcLine +
    flavorLine;

  await TgMessage.sendText(env, {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    message_thread_id: threadId,
    reply_markup: deleteMarkup,
  });
}

// ── /skill 命令入口 ────────────────────────────────────────

export async function handleDndSkill(parsed: ParsedUpdate, env: Env): Promise<void> {
  const chatId = parsed.chatId!;
  const threadId = parsed.threadId;
  const userId = String(parsed.from?.id ?? '');
  const args = parsed.args ?? [];

  await performSkillCheck(env, chatId, threadId, userId, args.join(' ').trim());
}
