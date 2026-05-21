/**
 * @file src/lib/backup.ts
 * @description 消息备份与转发模块。
 *   核心功能：
 *   - recordUserLastActive: 记录用户最后活跃时间到 D1
 *   - recordMessageContent: 记录每条消息的文本/媒体内容到 message_history 表
 *   - handleBackup: 备份入口，判断是否需要删除原始消息后执行备份
 *   - backupMessage: 将消息转发到配置的目标群组/话题
 */

import { backupConfig, deleteUids } from './liveConfig';
import TgMessage, { ParsedUpdate, EnvLike } from './tgMessage';
 
// 备份配置类型定义（如果 liveConfig 中已有可不重复定义）
export type BackupTarget = { chat_id: number; threadId?: number };
export type BackupMapping = { from: { chat_id: number; threadId?: number }; to: BackupTarget[] };


export interface UserInfo {
  user_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

/**
 * 记录用户最后一次活跃时间
 */
async function recordUserLastActive(
  env: EnvLike & { DB: D1Database }, 
  parsed: ParsedUpdate
): Promise<void> {
  try {
    if (!env.DB) {
      log('未配置 D1 数据库，跳过记录用户活跃时间');
      return;
    }

    const msg = parsed.message || {};
    const from = parsed.from || msg.from || msg.sender_chat || null;
    
    if (!from || !from.id) {
      log('无法获取用户信息，跳过记录');
      return;
    }

    const userId = from.id;
    const username = from.username || undefined;
    const firstName = from.first_name || from.title || from.name || undefined;
    const lastName = from.last_name || undefined;
    const chatId = parsed.chatId;

    // 使用 UPSERT 更新或插入记录
    const now = new Date().toISOString();
    
    const result = await env.DB.prepare(`
      INSERT INTO user_last_active (user_id, username, first_name, last_name, chat_id, last_active_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        username = excluded.username,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        chat_id = excluded.chat_id,
        last_active_at = excluded.last_active_at
    `)
    .bind(
      userId,
      username || null,
      firstName || null,
      lastName || null,
      chatId,
      now,
      now
    )
    .run();

    log('用户活跃时间记录成功', { 
      userId, 
      username, 
      firstName,
      chatId,
      rowsAffected: result.meta.changes 
    });

  } catch (error) {
    log('记录用户活跃时间失败', error);
  }
} 


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

function buildSenderLabel(parsed: ParsedUpdate) {
  const msg = parsed.message || {};
  const from = parsed.from || msg.from || msg.sender_chat || null;
  let first = '';
  let last = '';
  if (from) {
    first = safeString(from.first_name || from.title || from.name || '');
    last = safeString(from.last_name || '');
  }
  const sender = `${first}${last ? ' ' + last : ''}`.trim() || '匿名';
  return sender;
}

function buildBackupText(parsed: ParsedUpdate) {
  const sender = buildSenderLabel(parsed);
  const msg = parsed.message;

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

  return `${sender} :\n    ${content}`;
}

// helper: 选择最大的 file_id（通常最后一个元素是最大尺寸）
function getLargestPhotoFileId(photoArr: any[]) {
  if (!Array.isArray(photoArr) || photoArr.length === 0) return null;
  const p = photoArr[photoArr.length - 1];
  return p.file_id || null;
}

async function sendSenderLabel(env: EnvLike, dest: BackupTarget, senderLabel: string) {
  const opts: any = { chat_id: dest.chat_id, text: `${senderLabel} :` };
  if (dest.threadId !== undefined) opts.message_thread_id = dest.threadId;
  try {
    log('发送原始发送者说明到目标', { dest, text: opts.text });
    const r = await TgMessage.send(env, 'sendMessage', opts);
    return r;
  } catch (e) {
    log('发送原始发送者说明失败', { dest, error: e });
    throw e;
  }
}

/**
 * 记录每条消息的文本内容、时间、房间(topic)等到 message_history 表
 */
async function recordMessageContent(
  env: EnvLike & { DB: D1Database },
  parsed: ParsedUpdate
): Promise<void> {
  try {
    if (!env.DB) {
      log('未配置 D1 数据库，跳过记录消息内容');
      return;
    }

    const msg = parsed.message || {};
    const from = parsed.from || msg.from || msg.sender_chat || null;
    if (!from) {
      log('无法获取发送者信息，跳过记录消息内容');
      return;
    }

    const userId = from.id || from.user_id || null;
    const username = from.username || null;
    const firstName = from.first_name || from.title || from.name || null;
    const lastName = from.last_name || null;
    const chatId = parsed.chatId || null;
    // threadId / topic：尽可能从不同位置提取（依据你的 parsed 结构）
    const threadId = parsed.threadId ?? msg.message_thread_id ?? null;
    // topic 名称可能不总是在 parsed 中；尝试常见字段名，最后回退为 null
    const topicName =
      (parsed as any).topicName ??
      (msg as any).topic_name ??
      (msg as any).forum_topic ??
      (msg as any).forum_topic_name ??
      null;

    // 文本优先：parsed.text -> caption -> textPreview -> null
    const textContent = parsed.text ?? msg.caption ?? (parsed as any).textPreview ?? null;
    const messageId = msg.message_id ?? null;
    const now = new Date().toISOString();

    await env.DB.prepare(`
      INSERT INTO message_history
        (user_id, username, first_name, last_name, chat_id, thread_id, topic_name, message_id, text_content, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      userId,
      username || null,
      firstName || null,
      lastName || null,
      chatId,
      threadId,
      topicName || null,
      messageId,
      textContent || null,
      now
    )
    .run();

    log('记录 message_history 成功', { userId, chatId, threadId, messageId });

  } catch (error) {
    log('记录消息内容失败', error);
  }
}


/**
 * 删除原始群组中的消息
 * @returns 是否成功删除
 */
async function deleteOriginalMessageIfNeeded(parsed: ParsedUpdate, env: EnvLike): Promise<boolean> {
  try {
    // 检查是否有需要删除的 UID 配置
    if (!deleteUids || deleteUids.length === 0) {
      return false;
    }

    // 获取发送者 UID
    const msg = parsed.message || {};
    const from = parsed.from || msg.from || msg.sender_chat || null;
    const userId = from?.id || from?.user_id;
    
    if (!userId) {
      return false;
    }

    // 检查是否在删除列表中
    if (!deleteUids.includes(userId)) {
      return false;
    }

    // 检查是否有权限删除消息（需要 bot 是管理员且有删除消息权限）
    const deleteOpts = {
      chat_id: parsed.chatId,
      message_id: parsed.message.message_id ,
    };

    log('检测到需要删除的用户消息', { userId, chatId: parsed.chatId, messageId: parsed.message.message_id });
    
    try {
      // 尝试删除原始群组的消息
      await TgMessage.send(env, 'deleteMessage', deleteOpts);
      log('成功删除原始群组消息', deleteOpts);
      return true;
    } catch (deleteError) {
      // 如果没有删除权限或其他错误
      log('删除原始消息失败，可能没有权限', deleteOpts, deleteError);
      return true; // 即使删除失败也返回 true，表示应该阻止备份
    }
  } catch (error) {
    log('删除消息检查过程中出错', error);
    return false;
  }
}

/**
 * handleBackup
 * - 先检查是否需要删除原始消息
 * - 如果需要删除，则不进行备份
 * - 否则继续原有的备份逻辑
 */
export async function handleBackup(parsed: ParsedUpdate, env: EnvLike & { DB: D1Database }) {
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

    // 检查是否需要删除消息
    const shouldDelete = await deleteOriginalMessageIfNeeded(parsed, env);
    if (shouldDelete) {
      log('消息已删除或需要删除，跳过备份');
      return null;
    }

    await recordUserLastActive(env, parsed);

     try {
      await recordMessageContent(env, parsed);
    } catch (e) {
      log('记录消息内容时发生异常（但不阻止备份）', e);
    }


    const srcChatId = parsed.chatId;
    const srcThreadId = parsed.threadId;
    const msg = parsed.message;

    // 找到所有匹配的 mapping（chatId 匹配，且当 mapping 指定 threadId 时需相等）
    const matched = (backupConfig as BackupMapping[]).filter(m => m.from.chat_id === srcChatId && (m.from.threadId === undefined || m.from.threadId === srcThreadId));

    if (!matched || matched.length === 0) {
      log('未找到备份配置，跳过');
      return null;
    }

    const senderLabel = buildSenderLabel(parsed);
    const text = buildBackupText(parsed);
    log('找到备份配置，准备发送备份', { srcChatId, srcThreadId, text, matchedCount: matched.length });

    const results: any[] = [];

    const isPhoto = Array.isArray(msg.photo) && msg.photo.length > 0;
    const isSticker = !!msg.sticker;
    const isVideo = !!msg.video;
    const isAudio = !!msg.audio;
    const isDocument = !!msg.document;
    const isVoice = !!msg.voice;
    const isAnimation = !!msg.animation;
    const isContact = !!msg.contact;
    const isLocation = !!msg.location;
    const isVenue = !!msg.venue;
    const isPoll = !!msg.poll;
    const isDice = !!msg.dice;

    for (const m of matched) {
      for (const dest of m.to) {
        try {
          // 对于非纯文本类型，先发送一条原始发送者说明
          const needPreLabel = !(parsed.text && !msg.photo && !msg.video && !msg.document && !msg.sticker && !msg.audio && !msg.voice && !msg.animation && !msg.contact && !msg.location && !msg.venue && !msg.poll && !msg.dice);

          if (isPhoto) {
            const fileId = getLargestPhotoFileId(msg.photo);
            if (fileId) {
              if (needPreLabel) await sendSenderLabel(env, dest, senderLabel);

              const media: any[] = [
                { type: 'photo', media: fileId, caption: (msg.caption || parsed.text) || undefined }
              ];
              const sendOpts: any = { chat_id: dest.chat_id, media };
              if (dest.threadId !== undefined) sendOpts.message_thread_id = dest.threadId;
              log('发送 media_group 到目标', { dest, sendOpts });
              const res = await TgMessage.send(env, 'sendMediaGroup', sendOpts);
              results.push({ dest, res });
              continue;
            }
          }

          if (isVideo) {
            const fileId = msg.video && msg.video.file_id;
            if (fileId) {
              if (needPreLabel) await sendSenderLabel(env, dest, senderLabel);
              const sendOpts: any = { chat_id: dest.chat_id, video: fileId, caption: (msg.caption || parsed.text) || undefined };
              if (dest.threadId !== undefined) sendOpts.message_thread_id = dest.threadId;
              log('发送 video 到目标', { dest, sendOpts });
              const res = await TgMessage.send(env, 'sendVideo', sendOpts);
              results.push({ dest, res });
              continue;
            }
          }

          if (isAudio) {
            const fileId = msg.audio && msg.audio.file_id;
            if (fileId) {
              if (needPreLabel) await sendSenderLabel(env, dest, senderLabel);
              const sendOpts: any = { chat_id: dest.chat_id, audio: fileId, caption: (msg.caption || parsed.text) || undefined };
              if (dest.threadId !== undefined) sendOpts.message_thread_id = dest.threadId;
              log('发送 audio 到目标', { dest, sendOpts });
              const res = await TgMessage.send(env, 'sendAudio', sendOpts);
              results.push({ dest, res });
              continue;
            }
          }

          if (isDocument) {
            const fileId = msg.document && msg.document.file_id;
            if (fileId) {
              if (needPreLabel) await sendSenderLabel(env, dest, senderLabel);
              const sendOpts: any = { chat_id: dest.chat_id, document: fileId, caption: (msg.caption || parsed.text) || undefined };
              if (dest.threadId !== undefined) sendOpts.message_thread_id = dest.threadId;
              log('发送 document 到目标', { dest, sendOpts });
              const res = await TgMessage.send(env, 'sendDocument', sendOpts);
              results.push({ dest, res });
              continue;
            }
          }

          if (isVoice) {
            const fileId = msg.voice && msg.voice.file_id;
            if (fileId) {
              if (needPreLabel) await sendSenderLabel(env, dest, senderLabel);
              const sendOpts: any = { chat_id: dest.chat_id, voice: fileId };
              if (dest.threadId !== undefined) sendOpts.message_thread_id = dest.threadId;
              log('发送 voice 到目标', { dest, sendOpts });
              const res = await TgMessage.send(env, 'sendVoice', sendOpts);
              results.push({ dest, res });
              continue;
            }
          }

          if (isAnimation) {
            const fileId = msg.animation && msg.animation.file_id;
            if (fileId) {
              if (needPreLabel) await sendSenderLabel(env, dest, senderLabel);
              const sendOpts: any = { chat_id: dest.chat_id, animation: fileId, caption: (msg.caption || parsed.text) || undefined };
              if (dest.threadId !== undefined) sendOpts.message_thread_id = dest.threadId;
              log('发送 animation 到目标', { dest, sendOpts });
              const res = await TgMessage.send(env, 'sendAnimation', sendOpts);
              results.push({ dest, res });
              continue;
            }
          }

          if (isSticker) {
            const sticker = msg.sticker;
            const stickerFileId = sticker && sticker.file_id;
            if (stickerFileId) {
              if (needPreLabel) await sendSenderLabel(env, dest, senderLabel);
              const sendStickerOpts: any = { chat_id: dest.chat_id, sticker: stickerFileId };
              if (dest.threadId !== undefined) sendStickerOpts.message_thread_id = dest.threadId;
              log('发送贴纸到目标', { dest, sendStickerOpts });
              const resSticker = await TgMessage.send(env, 'sendSticker', sendStickerOpts);
              results.push({ dest, resSticker });
              continue;
            }
          }

          if (isContact) {
            const c = msg.contact;
            if (c) {
              if (needPreLabel) await sendSenderLabel(env, dest, senderLabel);
              const infoText = `${senderLabel} : [contact ${safeString(c.first_name || '')}${c.last_name ? ' ' + c.last_name : ''}]`;
              const infoOpts: any = { chat_id: dest.chat_id, text: infoText };
              if (dest.threadId !== undefined) infoOpts.message_thread_id = dest.threadId;
              await TgMessage.send(env, 'sendMessage', infoOpts);

              const contactOpts: any = { chat_id: dest.chat_id, phone_number: c.phone_number, first_name: c.first_name };
              if (c.last_name) contactOpts.last_name = c.last_name;
              if (dest.threadId !== undefined) contactOpts.message_thread_id = dest.threadId;
              log('发送 contact 到目标', { dest, contactOpts });
              const res = await TgMessage.send(env, 'sendContact', contactOpts);
              results.push({ dest, res });
              continue;
            }
          }

          if (isVenue) {
            const v = msg.venue;
            if (v) {
              if (needPreLabel) await sendSenderLabel(env, dest, senderLabel);
              const textOpts: any = { chat_id: dest.chat_id, text: `${senderLabel} : [venue] ${safeString(v.title || '')} ${safeString(v.address || '')}` };
              if (dest.threadId !== undefined) textOpts.message_thread_id = dest.threadId;
              await TgMessage.send(env, 'sendMessage', textOpts);

              const venueOpts: any = { chat_id: dest.chat_id, latitude: v.location.latitude, longitude: v.location.longitude, title: v.title, address: v.address };
              if (dest.threadId !== undefined) venueOpts.message_thread_id = dest.threadId;
              log('发送 venue 到目标', { dest, venueOpts });
              const res = await TgMessage.send(env, 'sendVenue', venueOpts);
              results.push({ dest, res });
              continue;
            }
          }

          if (isLocation) {
            const l = msg.location;
            if (l) {
              if (needPreLabel) await sendSenderLabel(env, dest, senderLabel);
              const textOpts: any = { chat_id: dest.chat_id, text: `${senderLabel} : [location] ${l.latitude},${l.longitude}` };
              if (dest.threadId !== undefined) textOpts.message_thread_id = dest.threadId;
              await TgMessage.send(env, 'sendMessage', textOpts);

              const locOpts: any = { chat_id: dest.chat_id, latitude: l.latitude, longitude: l.longitude };
              if (dest.threadId !== undefined) locOpts.message_thread_id = dest.threadId;
              log('发送 location 到目标', { dest, locOpts });
              const res = await TgMessage.send(env, 'sendLocation', locOpts);
              results.push({ dest, res });
              continue;
            }
          }

          if (isDice) {
            if (needPreLabel) await sendSenderLabel(env, dest, senderLabel);
            const diceOptsText: any = { chat_id: dest.chat_id, text: `${senderLabel} : [dice]` };
            if (dest.threadId !== undefined) diceOptsText.message_thread_id = dest.threadId;
            await TgMessage.send(env, 'sendMessage', diceOptsText);
            const diceOpts: any = { chat_id: dest.chat_id };
            if (dest.threadId !== undefined) diceOpts.message_thread_id = dest.threadId;
            log('发送 dice 到目标', { dest, diceOpts });
            const res = await TgMessage.send(env, 'sendDice', diceOpts);
            results.push({ dest, res });
            continue;
          }

          if (isPoll) {
            if (needPreLabel) await sendSenderLabel(env, dest, senderLabel);
            const poll = msg.poll;
            const pollText = `${senderLabel} : [poll] ${safeString(poll.question || '')}`;
            const pollOpts: any = { chat_id: dest.chat_id, text: pollText };
            if (dest.threadId !== undefined) pollOpts.message_thread_id = dest.threadId;
            const res = await TgMessage.send(env, 'sendMessage', pollOpts);
            results.push({ dest, res });
            continue;
          }

          // 12) 纯文本消息（或回退）
          // 文本消息保持原有格式：Firstname Lastname : 内容
          if (parsed.text) {
            const sendOpts: any = { chat_id: dest.chat_id, text };
            if (dest.threadId !== undefined) sendOpts.message_thread_id = dest.threadId;
            log('发送文本备份到目标', { dest, sendOpts });
            const res = await TgMessage.send(env, 'sendMessage', sendOpts);
            results.push({ dest, res });
            continue;
          }

          // 最后回退：发送一条说明
          const fallbackOpts: any = { chat_id: dest.chat_id, text: `${senderLabel} :（原始发送）` };
          if (dest.threadId !== undefined) fallbackOpts.message_thread_id = dest.threadId;
          log('发送回退说明到目标', { dest, fallbackOpts });
          const res = await TgMessage.send(env, 'sendMessage', fallbackOpts);
          results.push({ dest, res });

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