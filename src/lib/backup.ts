import { backupConfig } from './liveConfig';
import TgMessage, { ParsedUpdate, EnvLike } from './tgMessage';

// 备份配置类型定义


// 统一日志
function log(prefix: string, ...args: any[]) {
  console.log(`🔔 [backup] ${prefix}`, ...args);
}

/**
 * handleBackup
 * - 在收到普通消息（非命令）时调用
 * - 根据 backupConfig 匹配来源（chat_id + 可选 threadId），匹配到则把原始消息 forward 到对应目标
 * - 使用 Telegram API 的 forwardMessage 方法，尽量保留原始发送者信息
 *
 * 返回值：
 * - 若找到匹配并执行转发，返回每次转发的 API 响应数组（可能包含成功或失败信息）
 * - 若未匹配到任何配置或参数不完整，返回 null
 */
export async function handleBackup(parsed: ParsedUpdate, env: EnvLike) {
  try {
    if (!parsed) {
      log('未提供 parsed 参数，跳过备份');
      return null;
    }

    if (!parsed.message || !parsed.chatId) {
      log('parsed 不包含 message 或 chatId，跳过备份', { chatId: parsed.chatId });
      return null;
    }

    // 只对非命令消息进行备份（调用处应已判断 parsed.isCommand 为 false）
    // 但这里再做一次保护性判断
    if (parsed.isCommand) {
      log('消息为命令，跳过备份', { command: parsed.command });
      return null;
    }

    const srcChatId = parsed.chatId;
    const srcThreadId = parsed.threadId;
    const msgId = parsed.message.message_id;

    if (typeof msgId !== 'number') {
      log('消息缺少 message_id，无法转发', parsed.message);
      return null;
    }

    // 找到所有匹配的 mapping（chatId 匹配，且当 mapping 指定 threadId 时需相等）
    const matched = backupConfig.filter(m => m.from.chat_id === srcChatId && (m.from.threadId === undefined || m.from.threadId === srcThreadId));

    if (!matched || matched.length === 0) {
      log('未找到备份配置，跳过');
      return null;
    }

    log('找到备份配置，开始转发', { srcChatId, srcThreadId, msgId, matchedCount: matched.length });

    const results: any[] = [];

    for (const m of matched) {
      for (const dest of m.to) {
        const payload: any = {
          chat_id: dest.chat_id,
          from_chat_id: srcChatId,
          message_id: msgId
        };
        // 如果目标需要写入到特定 topic/thread，设置 message_thread_id
        if (dest.threadId !== undefined) payload.message_thread_id = dest.threadId;

        try {
          log('转发消息到目标', { payload });
          const res = await TgMessage.send(env, 'forwardMessage', payload);
          results.push({ dest, res });
          log('转发结果', { dest, res });
        } catch (e) {
          log('转发异常', { dest, error: e });
          results.push({ dest, error: e });
        }
      }
    }

    return results;
  } catch (err) {
    log('handleBackup 异常', err);
    return null;
  }
}
