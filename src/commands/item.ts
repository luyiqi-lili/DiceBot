/**
 * @file src/commands/item.ts
 * @description /item — 按钮式背包查看、装备、使用、赠送。
 *   - /item → 查看背包（inline keyboard 按钮）
 *   - /item send <名> [数量] → 回复某人赠送
 *   - 回调 handleItemCallback 处理 装备/卸下/使用
 */

import TgMessage, { ParsedUpdate } from '../lib/tgMessage';
import { escapeHtml, deleteMarkup } from '../lib/util';
import type { Env } from '../index';
import {
  getUserInventory, getInventoryItem,
  equipItem, unequipItem, useConsumable, sendItem,
  getTemplate, addToInventory,
  SLOT_NAMES,
  type InventoryItem, type EquipSlot,
} from '../lib/itemCore';

// ── 回调类型（~25 字节）───────────────────────────────────

interface ItemCb {
  type: 'item_action';
  a: 'eq' | 'un' | 'use'; // equip / unequip / use
  id: number;
}

// ── 格式化 ────────────────────────────────────────────────

function fmtBonus(attrBonus: string): string {
  try {
    const b: Record<string, number> = JSON.parse(attrBonus);
    return Object.entries(b).map(([k, v]) => `${k}${v >= 0 ? '+' : ''}${v}`).join(',');
  } catch { return ''; }
}

function buildInventoryText(items: InventoryItem[]): string {
  const equipped = items.filter(i => i.equipped && i.item_type === '装备');
  const unequipped = items.filter(i => !i.equipped && i.item_type === '装备');
  const consumables = items.filter(i => i.item_type === '消耗品');

  let text = '🎒 <b>背包</b>\n\n';

  if (equipped.length > 0) {
    text += '🛡️ <b>已装备</b>\n';
    for (const e of equipped) {
      const bonus = fmtBonus(e.attr_bonus);
      const slotName = e.slot ? SLOT_NAMES[e.slot as EquipSlot] ?? e.slot : '';
      text += `  ${slotName}: <b>${escapeHtml(e.name)}</b>${bonus ? ` (${escapeHtml(bonus)})` : ''}\n`;
    }
    text += '\n';
  }

  if (consumables.length > 0) {
    text += '💊 <b>消耗品</b>\n';
    for (const c of consumables) {
      const uses = c.uses > 0 ? ` ×${c.quantity}` : ' ∞';
      text += `  ${escapeHtml(c.name)}${uses} — ${escapeHtml(c.description || '')}\n`;
    }
    text += '\n';
  }

  if (unequipped.length > 0) {
    text += '📦 <b>未装备</b>\n';
    for (const u of unequipped) {
      const bonus = fmtBonus(u.attr_bonus);
      text += `  ${escapeHtml(u.name)}${bonus ? ` (${escapeHtml(bonus)})` : ''}${u.quantity > 1 ? ` ×${u.quantity}` : ''}\n`;
    }
    text += '\n';
  }

  if (items.length === 0) {
    text += '  空空如也～\n';
  }

  return text;
}

function buildButtons(items: InventoryItem[]): any[][] {
  const rows: any[][] = [];

  // 已装备 → [卸下]
  for (const e of items.filter(i => i.equipped)) {
    rows.push([{ text: `🔓 卸下 ${e.name}`, callback_data: JSON.stringify({ type: 'item_action', a: 'un', id: e.id } as ItemCb) }]);
  }

  // 未装备装备 → [装备]
  for (const u of items.filter(i => !i.equipped && i.item_type === '装备')) {
    rows.push([{ text: `⚔️ 装备 ${u.name}`, callback_data: JSON.stringify({ type: 'item_action', a: 'eq', id: u.id } as ItemCb) }]);
  }

  // 消耗品 → [使用]
  for (const c of items.filter(i => i.item_type === '消耗品')) {
    const label = c.uses > 0 ? `🧪 使用 ${c.name} (${c.quantity})` : `🧪 使用 ${c.name} (∞)`;
    rows.push([{ text: label, callback_data: JSON.stringify({ type: 'item_action', a: 'use', id: c.id } as ItemCb) }]);
  }

  rows.push([{ text: '删除消息', callback_data: JSON.stringify({ type: 'delete_message' }) }]);
  return rows;
}

// ── /item 主入口 ──────────────────────────────────────────

export async function handleItem(parsed: ParsedUpdate, env: Env): Promise<void> {
  const chatId = parsed.chatId!;
  const threadId = parsed.threadId;
  const userId = String(parsed.from?.id ?? '');
  const args = parsed.args ?? [];
  const sub = args[0] ?? '';

  if (!env.DB) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: '⚠️ 物品系统需要 D1 数据库支持，当前环境未配置。',
      message_thread_id: threadId, reply_markup: deleteMarkup,
    });
    return;
  }

  // /item send <名> [数量] → 回复某人赠送
  if (sub === 'send') {
    await handleSend(parsed, env, args.slice(1));
    return;
  }

  // 默认：查看背包
  const items = await getUserInventory(env, String(chatId), userId);
  const text = buildInventoryText(items);
  const buttons = buildButtons(items);

  await TgMessage.sendText(env, {
    chat_id: chatId, text, parse_mode: 'HTML',
    message_thread_id: threadId,
    reply_markup: { inline_keyboard: buttons },
  });
}

// ── 赠送 ──────────────────────────────────────────────────

async function handleSend(parsed: ParsedUpdate, env: Env, rest: string[]): Promise<void> {
  const chatId = parsed.chatId!;
  const threadId = parsed.threadId;
  const userId = String(parsed.from?.id ?? '');
  const fromName = parsed.from?.first_name || userId;

  if (!parsed.isReply || !parsed.replyToMessage?.from) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: '⚠️ 请回复目标用户的消息来赠送物品。\n用法：<code>/item send 物品名 [数量]</code>',
      parse_mode: 'HTML', message_thread_id: threadId, reply_markup: deleteMarkup,
    });
    return;
  }

  const targetId = String(parsed.replyToMessage.from.id);
  const targetName = parsed.replyToMessage.from.first_name || targetId;
  if (targetId === userId) {
    await TgMessage.sendText(env, {
      chat_id: chatId, text: '⚠️ 不能送给自己。',
      message_thread_id: threadId, reply_markup: deleteMarkup,
    });
    return;
  }

  const itemName = rest.join(' ').replace(/\s+\d+$/, '').trim();
  const qtyMatch = rest.join(' ').match(/(\d+)$/);
  const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

  if (!itemName) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: '⚠️ 请指定物品名称。\n用法：<code>/item send 物品名 [数量]</code>',
      parse_mode: 'HTML', message_thread_id: threadId, reply_markup: deleteMarkup,
    });
    return;
  }

  const items = await getUserInventory(env, String(chatId), userId);
  const match = items.find(i => i.name === itemName && !i.equipped);
  if (!match) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `⚠️ 你没有名为「${escapeHtml(itemName)}」的可赠送物品。`,
      parse_mode: 'HTML', message_thread_id: threadId, reply_markup: deleteMarkup,
    });
    return;
  }

  const err = await sendItem(env, String(chatId), userId, targetId, match.id, qty);
  if (err) {
    await TgMessage.sendText(env, { chat_id: chatId, text: `⚠️ ${err}`, message_thread_id: threadId });
    return;
  }

  await TgMessage.sendText(env, {
    chat_id: chatId,
    text: `🎁 ${escapeHtml(fromName)} 将 ${escapeHtml(itemName)} ×${qty} 赠送给了 ${escapeHtml(targetName)}`,
    parse_mode: 'HTML', message_thread_id: threadId, reply_markup: deleteMarkup,
  });
}

// ── 按钮回调 ──────────────────────────────────────────────

export async function handleItemCallback(callbackQuery: any, callbackData: any, env: Env): Promise<void> {
  const cd = callbackData as ItemCb;
  if (!cd || cd.type !== 'item_action') return;

  const cq = callbackQuery;
  const chatId = cq.message?.chat?.id;
  const userId = String(cq.from?.id);
  const msgId = cq.message?.message_id;

  if (!env.DB || !chatId) return;

  let actionText = '';

  if (cd.a === 'eq') {
    const err = await equipItem(env, String(chatId), userId, cd.id);
    actionText = err ?? '已装备';
  } else if (cd.a === 'un') {
    const err = await unequipItem(env, String(chatId), cd.id);
    actionText = err ?? '已卸下';
  } else if (cd.a === 'use') {
    const err = await useConsumable(env, String(chatId), cd.id);
    actionText = err ?? '已使用';
  }

  await TgMessage.answerCallbackQuery(env, cq.id, { text: actionText });

  // 刷新背包视图
  if (msgId) {
    const items = await getUserInventory(env, String(chatId), userId);
    await TgMessage.editMessageText(env, {
      chat_id: chatId, message_id: msgId,
      text: buildInventoryText(items), parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buildButtons(items) },
    });
  }
}
