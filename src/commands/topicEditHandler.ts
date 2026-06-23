// commands/topicEditHandler.ts
import TgMessage, { ParsedUpdate } from '../lib/telegram';
import type { Env } from '../index';
import {escapeHtml}  from "../lib/util";

type TopicEnv = Env;

/**
 * 处理论坛话题标题编辑事件（forum_topic_edited）
 * - 接收 parsedMessage（ParsedUpdate）
 * - 直接使用 TgMessage 发送/删除消息与写入 KV
 *
 * 返回：Promise<Response|undefined>
 * - 为兼容原 index.ts 的调用习惯（index 会检查返回值），此函数在完成后通常返回 undefined。
 */
export async function handleTopicEdited(parsedMessage: ParsedUpdate, env: TopicEnv): Promise<Response | undefined> {
  try {
    console.log("[topicEdit] 收到 parsedMessage:", {
      type: parsedMessage.type,
      chatId: parsedMessage.chatId,
      threadId: parsedMessage.threadId,
      command: parsedMessage.command
    });


    const msg = parsedMessage.message;

    const editInfo = msg.forum_topic_edited ?? parsedMessage.message.forum_topic_edited;
    if (!editInfo) {
      console.log("[topicEdit] 无 forum_topic_edited，跳过");
      return;
    }

    const chatId: number = parsedMessage.chatId ?? msg.chat?.id;
    const threadId: number | undefined = parsedMessage.threadId ?? msg.message_thread_id;
    const newTitle: string | undefined = (editInfo && typeof editInfo.name === "string") ? editInfo.name : undefined;

    if (!chatId || !threadId) {
      console.log("[topicEdit] 无 chatId 或 threadId，跳过");
      return;
    }
    if (!newTitle) {
      console.log("[topicEdit] 标题未变更或非文本，跳过");
      return;
    }

    // --- 白名单：只监听指定群组与 threadId 列表 ---
    const whitelist: Record<number, number[]> = {
      // 在此处放置允许的 chatId -> threadId 列表
      [-1002742074355]: [
        184, 176, 33861, 205, 382, 88693, 168, 7571,
        211, 361, 244, 234072, 165, 258, 182, 194,
        141941, 251, 389, 409, 48
      ],
//      [-1002848481881]: [
//        69
//      ],
    };

    const allowedThreads = whitelist[chatId];
    if (!allowedThreads || !allowedThreads.includes(threadId)) {
      console.log(`[topicEdit] chat_id=${chatId} threadId=${threadId} 不在白名单，跳过`);
      return;
    }

    console.log(`[topicEdit] 话题标题更新：chat=${chatId} thread=${threadId} newTitle="${newTitle}"`);

    // --- 房间元数据（用于显示名称与链接） ---
    const roomMeta: Record<number, { name: string; link?: string }> = {
      184: { name: '音', link: 'https://t.me/c/2742074355/184' },
      176: { name: '花音', link: 'https://t.me/c/2742074355/176' },
      33861: { name: '琉璃', link: 'https://t.me/c/2742074355/33861' },
      205: { name: '柔柔', link: 'https://t.me/c/2742074355/205' },
      382: { name: '耀阳', link: 'https://t.me/c/2742074355/382' },
      88693: { name: '缘宝', link: 'https://t.me/c/2742074355/88693' },
      168: { name: '蘭蘭', link: 'https://t.me/c/2742074355/168' },
      7571: { name: '耶梦加得', link: 'https://t.me/c/2742074355/7571' },
      211: { name: '小小M', link: 'https://t.me/c/2742074355/211' },
      361: { name: '满月', link: 'https://t.me/c/2742074355/361' },
      244: { name: '閃閃', link: 'https://t.me/c/2742074355/244' },
      234072: { name: '落雪', link: 'https://t.me/c/2742074355/234072' },
      165: { name: '酥酥', link: 'https://t.me/c/2742074355/165' },
      258: { name: '汐汐', link: 'https://t.me/c/2742074355/258' },
      182: { name: '软软', link: 'https://t.me/c/2742074355/182' },
      194: { name: '娜娜', link: 'https://t.me/c/2742074355/194' },
      141941: { name: '出灰', link: 'https://t.me/c/2742074355/141941' },
      251: { name: '玉', link: 'https://t.me/c/2742074355/251' },
      389: { name: '审判庭', link: 'https://t.me/c/2742074355/389' },
      409: { name: '地下室', link: 'https://t.me/c/2742074355/409' },
      48: { name: '酒馆', link: 'https://t.me/c/2742074355/48' },
    };

    // --- KV key + 读取 ---
    const KV_KEY = 'topic_status:single';
    const kv = env.TOPIC_KV;
    if (!kv) {
      console.error("[topicEdit] 未绑定 TOPIC_KV，跳过");
      return;
    }

    let record: {
      message_id: number | null;
      titles: Record<string, string>;
    } | null = null;

    try {
      record = await kv.get(KV_KEY, "json") as any;
    } catch (err) {
      console.warn("[topicEdit] 读取 KV 时出错，继续以空记录初始化", err);
      record = null;
    }

    if (!record) {
      // 初始化
      record = { message_id: null, titles: {} };
      for (const [gid, threads] of Object.entries(whitelist)) {
        for (const tid of threads) {
          record.titles[tid.toString()] = '标题';
        }
      }
      try {
        await kv.put(KV_KEY, JSON.stringify(record));
        console.log("[topicEdit] KV 初始化完成");
      } catch (err) {
        console.error("[topicEdit] KV 初始化写入失败", err);
      }
    }

    const prevTitle = record.titles[threadId.toString()] ?? '等待初始化标题';
    record.titles[threadId.toString()] = newTitle;

    try {
      await kv.put(KV_KEY, JSON.stringify(record));
      console.log(`[topicEdit] 已更新 KV thread=${threadId} 标题: "${prevTitle}" -> "${newTitle}"`);
    } catch (err) {
      console.error("[topicEdit] 写入 KV 失败", err);
    }

    // 仅在变更前后任一项包含 ❤️ 时才发送提示
    const hasHeartBefore = prevTitle.includes('❤️');
    const hasHeartAfter = newTitle.includes('❤️');
    if (!hasHeartBefore && !hasHeartAfter) {
      console.log("[topicEdit] 前后均无 ❤️，仅更新内部记录，不发送提示");
      return;
    }

    // --- 目标提示位置（固定） ---
    const targetChatId = -1002742074355;
    const targetThreadId = 302677;
 
//    const targetChatId = -1002848481881;
//    const targetThreadId = 66;
    // 删除上一次提示（如果存在）
    if (record.message_id) {
      try {
        console.log(`[topicEdit] 删除上一次提示 message_id=${record.message_id}`);
        await TgMessage.deleteMessage(env, targetChatId, record.message_id);
        console.log("[topicEdit] 删除上次提示成功");
      } catch (err) {
        console.warn("[topicEdit] 删除上次提示失败（可能已被删除）", err);
      }
    }

    // --- 构造提示内容 ---
    let content = `<b>${escapeHtml(roomMeta[threadId]?.name ?? String(threadId))}</b> 状态从「${escapeHtml(prevTitle)}」变成了「${escapeHtml(newTitle)}」\n\n`;
    content += `<b>当前所有房间的状态：</b>\n`;

    const entries = Object.entries(record.titles);
    // 心心先显示
    const heartEntries = entries.filter(([_, title]) => title.includes('❤️'));
    const normalEntries = entries.filter(([_, title]) => !title.includes('❤️'));

    for (const [tid, title] of heartEntries) {
      const num = Number(tid);
      const meta = roomMeta[num];
      if (meta?.link) {
        content += `<a href="${meta.link}">${escapeHtml(meta.name)}正处于情欲高涨阶段，现在立刻马上想要涩涩</a>\n`;
      } else {
        content += `${escapeHtml(tid)}正处于情欲高涨阶段，现在立刻马上想要涩涩\n`;
      }
    }

    content += `<blockquote expandable>`;
    for (const [tid, title] of normalEntries) {
      const num = Number(tid);
      const meta = roomMeta[num];
      if (meta?.link) {
        content += `<a href="${meta.link}">${escapeHtml(meta.name)}: ${escapeHtml(title)}</a>\n`;
      } else {
        content += `${escapeHtml(tid)}: ${escapeHtml(title)}\n`;
      }
    }
    content += `</blockquote>\n`;

    // --- 发送新提示（使用 TgMessage） ---
    try {
      const sendRes = await TgMessage.send(env, 'sendMessage', {
        chat_id: targetChatId,
        message_thread_id: targetThreadId,
        text: content,
        parse_mode: "HTML"
      });

      if (sendRes && sendRes.ok && (sendRes.result as any)?.message_id) {
        const newMsgId = (sendRes.result as any).message_id as number;
        record.message_id = newMsgId;
        try {
          await kv.put(KV_KEY, JSON.stringify(record));
          console.log("[topicEdit] 保存最新提示 message_id 到 KV:", newMsgId);
        } catch (err) {
          console.error("[topicEdit] 将 message_id 写入 KV 失败", err);
        }
      } else {
        console.error("[topicEdit] 发送提示消息失败，Telegram 返回：", sendRes);
      }
    } catch (err) {
      console.error("[topicEdit] 发送提示消息异常", err);
    }

    return;
  } catch (err) {
    console.error("[topicEdit] 未捕获异常：", err);
    return;
  }
}

export default handleTopicEdited;
