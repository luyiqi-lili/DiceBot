/**
 * @file src/data/groups.ts
 * @description 群组白名单与删除配置。
 */


export const ALLOWED_CHAT_IDS = new Set([
  -1002742074355,
  -1002848481881,
  -1002661676227,
  -1002796780505,
  -1002970430696,
  -1003580231284,
  0
]);

export const deleteUids: number[] = [
  //  8080375150, // 需要删除消息的用户 ID 1
  //  6839700093, 小皮
  //  987654321, // 需要删除消息的用户 ID 2
  // 添加更多 UID
];
