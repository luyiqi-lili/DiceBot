import { backupConfig } from './liveConfig';
import TgMessage, { ParsedUpdate, EnvLike } from './tgMessage';

// 备份配置类型定义


// 统一日志
function log(prefix: string, ...args: any[]) {
  console.log(`🔔 [backup] ${prefix}`, ...args);
}

function safeString(v: any) {
  if (v === undefined || v === null) return '';
  return String(v);
}

function detectMessageType(msg: any) {
  if (!msg || typeof msg !== 'object') return 'unknown';
  const map: Array<[string, string]> = [
    ['photo', 'photo'],
    ['video', 'video'],
    ['audio', 'audio'],
    ['document', 'document'],
    ['sticker', 'sticker'],
    ['voice', 'voice'],
    ['animation', 'animation'],
    ['contact', 'contact'],
    ['poll', 'poll'],
    ['venue', 'venue'],
    ['location', 'location'],
    ['dice', 'dice']
  ];
  for (const [k, name] of map) {
    if (msg[k]) return name;
  }
  // fallback: has caption but no other type -> treat as text
  if (msg.caption && !msg.text) return 'caption';
  if (msg.text) return 'text';
  return 'unknown';
}

/**
 * buildBackupText
 * - 根据 parsed.message 构造要发送的文本，格式为：
 *   Firstname Lastname : 消息内容
 * - 如果没有文本内容，会用媒体类型或 caption 做替代
 */
function buildBackupText(parsed: ParsedUpdate) {
  const msg = parsed.message;
  const from = parsed.from || msg.from || msg.sender_chat || null;
  let first = '';
  let last = '';
  if (from) {
    first = safeString(from.first_name || from.title || from.name || '');
    last = safeString(from.last_name || '');
  }
  const sender = `${first}${last ? ' ' + last : ''}`.trim() || '匿名';

  // 优先取 text -> caption -> 短预览 -> 媒体类型标签
  let content = '';
  if (parsed.text) {
    content = parsed.text;
  } else if (msg && msg.caption) {
    content = msg.caption;
  } else if (parsed.textPreview) {
    content = parsed.textPreview;
  } else {
    const t = detectMessageType(msg);
    content = `[${t}]`;
  }

  return `${sender} : ${content}`;
}

/**
 * handleBackup
 * - 在收到普通消息（非命令）时调用
 * - 根据 backupConfig 匹配来源（chat_id + 可选 threadId），匹配到则把构造好的文本消息发送到对应目标
 * - 支持把图片（若存在 photo）以 media_group 的形式发送，使用原始 file_id（尽量保留原图）
 * - 注意：Telegram webhook 会把同一 media group 的每张图片作为独立的 message 发送（共享 media_group_id），
 *   若需要完整重组整个 media_group（多张图一次性发送），建议在外部做短时缓冲并按 media_group_id 聚合；
 *   这里实现为：当单条消息包含 photo 时，使用该 message 的最大尺寸 file_id 发送一个包含单张图片的 media_group。
 *
 * 返回值：
 * - 若找到匹配并执行发送，返回每次 send 的 API 响应数组（包含成功或失败信息）
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
    if (parsed.isCommand) {
      log('消息为命令，跳过备份', { command: parsed.command });
      return null;
    }

    const srcChatId = parsed.chatId;
    const srcThreadId = parsed.threadId;
    const msg = parsed.message;

    // 找到所有匹配的 mapping（chatId 匹配，且当 mapping 指定 threadId 时需相等）
    const matched = backupConfig.filter(m => m.from.chat_id === srcChatId && (m.from.threadId === undefined || m.from.threadId === srcThreadId));

    if (!matched || matched.length === 0) {
      log('未找到备份配置，跳过');
      return null;
    }

    const text = buildBackupText(parsed);
    log('找到备份配置，准备发送备份', { srcChatId, srcThreadId, text, matchedCount: matched.length });

    const results: any[] = [];

    // 如果消息包含 photo，尝试使用原始 file_id 发送为 media group（至少单张图片）
    const isPhoto = Array.isArray(msg.photo) && msg.photo.length > 0;

    // helper: 选择最大的 file_id（通常最后一个元素是最大尺寸）
    function getLargestPhotoFileId(photoArr: any[]) {
      if (!Array.isArray(photoArr) || photoArr.length === 0) return null;
      const p = photoArr[photoArr.length - 1];
      return p.file_id || null;
    }

    for (const m of matched) {
      for (const dest of m.to) {
        try {
          if (isPhoto) {
            const fileId = getLargestPhotoFileId(msg.photo);
            if (fileId) {
              const media: any[] = [
                {
                  type: 'photo',
                  media: fileId,
                  // 仅在第一张图片上保留文字/说明
                  caption: text ||parsed.text || msg.caption || undefined
                }
              ];

              const sendOpts: any = {
                chat_id: dest.chat_id,
                media
              };
              if (dest.threadId !== undefined) sendOpts.message_thread_id = dest.threadId;

              log('发送 media_group 到目标', { dest, sendOpts });
              const res = await TgMessage.send(env, 'sendMediaGroup', sendOpts);
              results.push({ dest, res });
              log('发送 media_group 结果', { dest, res });
              continue; // 已处理该目标，继续下一个目标
            }
          }

          // 如果不是 photo，或无法获取 file_id，则回退到发送纯文本备份
          const sendOpts: any = {
            chat_id: dest.chat_id,
            text
          };
          if (dest.threadId !== undefined) sendOpts.message_thread_id = dest.threadId;

          log('发送备份到目标（文本回退）', { dest, sendOpts });
          const res = await TgMessage.send(env, 'sendMessage', sendOpts);
          results.push({ dest, res });
          log('发送结果', { dest, res });
        } catch (e) {
          log('发送异常', { dest, error: e });
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
