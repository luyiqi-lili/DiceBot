/**
 * @file src/data/admin.ts
 * @description 管理员权限白名单。
 */

/* ------------------------- 管理员用户 ID 白名单 ------------------------- */

/** /coin check, /coin list 权限 */
export const ADMIN_UIDS_CHECK: number[] = [8080375150, 5621587953, 7804622477, 7476641553, 1019896885, 6367789964, 1039189463];
/** /coin take 权限 */
export const ADMIN_UIDS_TAKE: number[] = [8080375150, 5621587953, 7804622477];
/** /coin create 权限 */
export const ADMIN_UIDS_CREATE: number[] = [8080375150, 5621587953];
/** /coin remove 权限 */
export const ADMIN_UIDS_REMOVE: number[] = [8080375150, 5621587953, 7476641553, 1019896885];
/** /lottery 管理命令权限 */
export const LOTTERY_ADMIN_UIDS: number[] = [8080375150, 5621587953, 7804622477, 7476641553, 1019896885];
/** /top 主题消息排行权限 */
export const TOP_ADMIN_UIDS: number[] = [8080375150, 5621587953, 7804622477, 7476641553, 1019896885, 6367789964, 1039189463];
