import { backupConfig } from './liveConfig';
import TgMessage, { ParsedUpdate, EnvLike } from './tgMessage';

// 备份配置类型定义（如果 liveConfig 中已有可不重复定义）
export type BackupTarget = { chat_id: number; threadId?: number };
export type BackupMapping = { from: { chat_id: number; threadId?: number }; to: BackupTarget[] };

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

  return `${sender} : ${content}`;
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
 * handleBackup
 * - 尽量将各种类型的消息由 bot 重新发送到目标群组/话题
 * - 重新发送非纯文本消息前会先发送一条说明："Firstname Lastname :"，表示此消息的原始发送者
 * - 优先使用原始的 file_id（避免下载/上传），并尽量把原始发送者作为 caption/说明带上
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
