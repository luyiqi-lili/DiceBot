/**
 * @file src/lib/liveConfig.ts
 * @description 重新导出桶文件 — 所有配置与静态数据已按域拆分到 src/data/ 目录。
 *   导入路径不变：`import { ... } from '../lib/liveConfig'` 仍然有效。
 *   如需直接引用，可改为 `import { ... } from '../data/admin'` 等。
 */

// ── 管理员权限 ──
export {
	ADMIN_UIDS_CHECK,
	ADMIN_UIDS_TAKE,
	ADMIN_UIDS_CREATE,
	ADMIN_UIDS_REMOVE,
	LOTTERY_ADMIN_UIDS,
	TOP_ADMIN_UIDS,
} from '../data/admin';

// ── 群组配置 ──
export { ALLOWED_CHAT_IDS, deleteUids } from '../data/groups';

// ── 塔罗牌 ──
export { MAJOR_ARCANA } from '../data/tarot';

// ── 钓鱼 ──
export { fishList, getCastDesc } from '../data/fish';

// ── 文本模板 ──
export { likeTextMapFriend, attitudeResponses } from '../data/texts';
export type { LikeTextEntry } from '../data/texts';

// ── 付费配置 ──
export { payConfigs } from '../data/payment';
export type { PayConfig } from '../data/payment';

// ── 备份配置 ──
export { backupConfig } from '../data/backup';
export type { BackupTarget, BackupMapping } from '../data/backup';
