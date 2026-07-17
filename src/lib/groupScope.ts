/**
 * @file src/lib/groupScope.ts
 * @description 群组隔离（per Telegram chat_id）的统一工具。
 *   所有涉及存储的功能都按 chat_id 隔离；历史（未隔离）数据一律归属于
 *   LEGACY_CHAT_ID 对应的群组，由一次性迁移脚本回填。
 */

/** 历史全局数据回填归属的群组 id。 */
export const LEGACY_CHAT_ID = -1002970430696;

/**
 * 将一个原始账户/记录 key 按 chatId 作用域化。
 * - 房间募捐箱等已含 "||" 的 key 本身已带 chat 上下文，保持原样不再加前缀。
 * - 其余（用户 id、__treasury__、coin_pray: 等）统一加 `${chatId}:` 前缀。
 */
export function scopeKey(chatId: string | number, key: string): string {
  if (key.includes('||')) return key;
  return `${chatId}:${key}`;
}
