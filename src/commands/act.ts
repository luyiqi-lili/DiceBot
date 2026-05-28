import TgMessage, { ParsedUpdate } from "../lib/tgMessage";
import { escapeHtml } from "../lib/util";

/**
 * act.ts
 * 支持：/act start, /act end, /act list, /act show <id> [page]
 */

import type { Env } from '../index';

function log(prefix: string, ...args: any[]) {
  console.log(`🔔 [act] ${prefix}`, ...args);
}

function genActId(date = new Date()) {
  // yymmddhhmm
  const y = String(date.getUTCFullYear()).slice(2); // e.g. '26'
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  return `${y}${mm}${dd}${hh}${mi}`;
}

function firstNameLabel(row: any) {
  return (row.first_name || row.username || `user_${row.user_id || "?"}`).trim();
}

function paginateText(text: string, pageSize = 3000) {
  const pages: string[] = [];
  for (let i = 0; i < text.length; i += pageSize) {
    pages.push(text.slice(i, i + pageSize));
  }
  return pages;
}

async function doStart(parsed: ParsedUpdate, env: Env) {
  if (!env.DB) { console.warn("[act] DB 不可用，跳过"); return; }
  const chatId = parsed.chatId || parsed.message?.chat?.id;
  const threadId = parsed.threadId ?? parsed.message?.message_thread_id ?? null;
  const msgId = parsed.message?.message_id ?? null;
  if (!chatId) {
    log("start 无 chatId，跳过");
    return;
  }

  try {
    // 检查是否已有 pending
    const sel = await env.DB!.prepare(
      `SELECT start_time FROM act_pending WHERE chat_id = ? AND thread_id IS ?`
    ).bind(chatId, threadId).all();

    if (sel && sel.results && sel.results.length > 0) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: "⚠️ 已存在未结束的 /act start，请先执行 /act end 后再开始新的会话。",
        message_thread_id: threadId
      });
      return;
    }

    const now = new Date().toISOString();
    await env.DB!.prepare(
      `INSERT INTO act_pending (chat_id, thread_id, start_message_id, start_time) VALUES (?, ?, ?, ?)`
    ).bind(chatId, threadId, msgId, now).run();

    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `✅ 已记录 /act start（start_time=${now}）。当讨论结束时执行 /act end 来生成记录。`,
      message_thread_id: threadId
    });
    log("start recorded", { chatId, threadId, msgId, now });
  } catch (e) {
    log("doStart 错误", e);
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `❌ /act start 失败 `,
      message_thread_id: threadId
    });
  }
}

async function doEnd(parsed: ParsedUpdate, env: Env) {
  const chatId = parsed.chatId || parsed.message?.chat?.id;
  const threadId = parsed.threadId ?? parsed.message?.message_thread_id ?? null;
  const endMsgId = parsed.message?.message_id ?? null;
  if (!chatId) {
    log("end 无 chatId，跳过");
    return;
  }

  try {
    // 1) 查询 pending
    const pendRes: any = await env.DB!.prepare(
      `SELECT start_message_id, start_time FROM act_pending WHERE chat_id = ? AND thread_id IS ?`
    ).bind(chatId, threadId).all();

    const pendRow = (pendRes && pendRes.results && pendRes.results[0]) || null;
    if (!pendRow) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: "ℹ️ 未找到未结束的 /act start（请先执行 /act start）。",
        message_thread_id: threadId
      });
      return;
    }

    const startMsgId = pendRow.start_message_id ?? null;
    const startTime = pendRow.start_time ?? null;
    const endTime = new Date().toISOString();

    // 2) 从 message_history 中查询这段时间的消息（优先 message_id，如果不可用使用时间段）
    let rowsRes: any = null;
    const limit = 2000; // 安全上限
    if (startMsgId && endMsgId) {
      rowsRes = await env.DB!.prepare(
        `SELECT user_id, username, first_name, last_name, text_content, message_id, created_at
         FROM message_history
         WHERE chat_id = ? AND thread_id IS ?
           AND message_id > ? AND message_id <= ?
           AND text_content IS NOT NULL
         ORDER BY message_id ASC
         LIMIT ?`
      ).bind(chatId, threadId, startMsgId, endMsgId, limit).all();
    } else if (startTime) {
      rowsRes = await env.DB!.prepare(
        `SELECT user_id, username, first_name, last_name, text_content, message_id, created_at
         FROM message_history
         WHERE chat_id = ? AND thread_id IS ?
           AND created_at >= ? AND created_at <= ?
           AND text_content IS NOT NULL
         ORDER BY created_at ASC
         LIMIT ?`
      ).bind(chatId, threadId, startTime, endTime, limit).all();
    } else {
      // 全体时间范围回退（非常少见）
      rowsRes = await env.DB!.prepare(
        `SELECT user_id, username, first_name, last_name, text_content, message_id, created_at
         FROM message_history
         WHERE chat_id = ? AND thread_id IS ?
           AND text_content IS NOT NULL
         ORDER BY created_at ASC
         LIMIT ?`
      ).bind(chatId, threadId, limit).all();
    }

    const rows: any[] = (rowsRes && rowsRes.results) || rowsRes || [];
    if (!rows || rows.length === 0) {
      // 仍然写入 act_sessions（空内容）并清理 pending
      const id = genActId(new Date());
      await env.DB!.prepare(
        `INSERT INTO act_sessions
         (id, chat_id, thread_id, topic_name, start_message_id, start_time, end_message_id, end_time, content, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, chatId, threadId, null, startMsgId, startTime, endMsgId, endTime, "", new Date().toISOString()).run();

      await env.DB!.prepare(`DELETE FROM act_pending WHERE chat_id = ? AND thread_id IS ?`).bind(chatId, threadId).run();

      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `✅ /act end 已记录（id=${id}），但未找到可用的文本消息用于汇总。`,
        message_thread_id: threadId
      });
      log("end recorded empty", { id, chatId, threadId });
      return;
    }

    // 3) 合并消息为 "Firstname：内容" 格式；合并连续同人发言（可选）
    const lines: string[] = [];
    let lastAuthor = null;
    for (const r of rows) {
      const who = firstNameLabel(r);
      const txt = (r.text_content || "").replace(/\s+/g, " ").trim();
      if (!txt) continue;
      if (who === lastAuthor) {
        // 合并到上一行（上一行末尾添加空格 + 内容）
        const idx = lines.length - 1;
        lines[idx] = lines[idx] + " " + txt;
      } else {
        lines.push(`${who}：${txt}`);
        lastAuthor = who;
      }
    }

    const joined = lines.join("\n");
    const id = genActId(new Date());
    const createdAt = new Date().toISOString();

    // 4) 插入 act_sessions
    await env.DB!.prepare(
      `INSERT INTO act_sessions
       (id, chat_id, thread_id, topic_name, start_message_id, start_time, end_message_id, end_time, content, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, chatId, threadId, null, startMsgId, startTime, endMsgId, endTime, joined, createdAt).run();

    // 5) 清理 pending
    await env.DB!.prepare(`DELETE FROM act_pending WHERE chat_id = ? AND thread_id IS ?`).bind(chatId, threadId).run();

    // 6) 回复用户并给出查看方式
    const snippet = joined.length > 400 ? joined.slice(0, 400) + "…[truncated]" : joined;
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `✅ /act 已结束并保存为 id=${id}\n预览：\n${escapeHtml(snippet)}\n\n使用 /act show ${id} 查看完整内容，或 /act list 查看最近记录。`,
      parse_mode: "HTML",
      message_thread_id: threadId
    });

    log("act end saved", { id, chatId, threadId, rows: rows.length });
  } catch (e) {
    log("doEnd 错误", e);
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `❌ /act end 失败： `,
      message_thread_id: threadId
    });
  }
}

async function doList(parsed: ParsedUpdate, env: Env) {
  const chatId = parsed.chatId || parsed.message?.chat?.id;
  const threadId = parsed.threadId ?? parsed.message?.message_thread_id ?? null;
  if (!chatId) {
    log("list 无 chatId，跳过");
    return;
  }

  try {
    const q = await env.DB!.prepare(
      `SELECT id, start_time, end_time, substr(content,1,200) as snippet
       FROM act_sessions
       WHERE chat_id = ? AND thread_id IS ?
       ORDER BY created_at DESC
       LIMIT 50`
    ).bind(chatId, threadId).all();

    const rows: any[] = (q && q.results) || q || [];
    if (!rows || rows.length === 0) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: "ℹ️ 当前话题/会话暂无 act 记录（过去没有保存的 /act）。",
        message_thread_id: threadId
      });
      return;
    }

    let out = "📚 最近的 act 记录（按时间降序）：\n";
    for (const r of rows) {
      const st = r.start_time ? new Date(r.start_time).toLocaleString() : "-";
      const et = r.end_time ? new Date(r.end_time).toLocaleString() : "-";
      out += `\n• ${r.id}  (${st} → ${et})\n  摘要：${(r.snippet || "").replace(/\n/g, " ")}\n`;
    }
    out += `\n使用 /act show <id> 查看完整内容。`;

    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: out,
      message_thread_id: threadId
    });
  } catch (e) {
    log("doList 错误", e);
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `❌ /act list 失败： }`,
      message_thread_id: threadId
    });
  }
}

async function doShow(parsed: ParsedUpdate, env: Env, idArg?: string, pageArg?: string) {
  const chatId = parsed.chatId || parsed.message?.chat?.id;
  const threadId = parsed.threadId ?? parsed.message?.message_thread_id ?? null;
  if (!chatId) {
    log("show 无 chatId，跳过");
    return;
  }
  if (!idArg) {
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: "用法：`/act show <id> [page]`，例如 `/act show 2601191539`。",
      parse_mode: "Markdown",
      message_thread_id: threadId
    });
    return;
  }

  try {
    const q = await env.DB!.prepare(
      `SELECT id, content FROM act_sessions WHERE id = ? AND chat_id = ? AND thread_id IS ?`
    ).bind(idArg, chatId, threadId).all();

    const row = (q && q.results && q.results[0]) || null;
    if (!row) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `未找到 id=${idArg} 的记录（在当前 chat/thread 中）。`,
        message_thread_id: threadId
      });
      return;
    }

    const content: string = row.content || "";
    if (!content) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `id=${idArg} 的记录为空。`,
        message_thread_id: threadId
      });
      return;
    }

    // 分页
    const pageSize = 3000;
    const pages = paginateText(content, pageSize);
    const pageIndex = Math.max(0, Math.min(pages.length - 1, Number(pageArg || "1") - 1 || 0));
    // 如果用户请求具体页，直接发送那页；否则发送全部（分多条）
    if (pageArg) {
      const total = pages.length;
      const body = pages[pageIndex];
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `📄 Act ${idArg} （第 ${pageIndex + 1}/${total} 页）\n\n${escapeHtml(body)}`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    } else {
      // 逐页发送（如果页数很多，限制上限）
      const maxPages = 10;
      if (pages.length > maxPages) {
        // 发送前 N 页并提示
        for (let i = 0; i < Math.min(pages.length, maxPages); i++) {
          await TgMessage.sendText(env, {
            chat_id: chatId,
            text: `📄 Act ${idArg} （第 ${i + 1}/${pages.length} 页）\n\n${escapeHtml(pages[i])}`,
            parse_mode: "HTML",
            message_thread_id: threadId
          });
        }
        await TgMessage.sendText(env, {
          chat_id: chatId,
          text: `内容过长，共 ${pages.length} 页。请使用 /act show ${idArg} <page> 查看指定页（例：/act show ${idArg} 2）。`,
          message_thread_id: threadId
        });
        return;
      } else {
        for (let i = 0; i < pages.length; i++) {
          await TgMessage.sendText(env, {
            chat_id: chatId,
            text: `📄 Act ${idArg} （第 ${i + 1}/${pages.length} 页）\n\n${escapeHtml(pages[i])}`,
            parse_mode: "HTML",
            message_thread_id: threadId
          });
        }
        return;
      }
    }
  } catch (e) {
    log("doShow 错误", e);
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `❌ /act show 失败： `,
      message_thread_id: threadId
    });
  }
}

/**
 * 主入口：解析 subcommand 并分发
 * 命令形式：
 *  /act start
 *  /act end
 *  /act list
 *  /act show <id> [page]
 */
export async function handleAct(parsed: ParsedUpdate, env: Env) {
  log("incoming act command", { text: parsed.text, chatId: parsed.chatId });
  if (!env.DB) { log("DB 不可用，跳过"); return; }

  const originalText = parsed.text || parsed.message?.text || "";
  const botUsername = (env as any).BOT_USERNAME || "";
  const mentionRegex = botUsername ? new RegExp(`^@${botUsername}\\s*`, "i") : /^@?\w+\s*/i;
  const cmdText = originalText.replace(mentionRegex, "").trim();

  const m = cmdText.match(/^\/act(?:@\w+)?(?:\s+(.+))?/i);
  const tail = m && m[1] ? m[1].trim() : "";

  if (!tail) {
    // 直接回复帮助
    await TgMessage.sendText(env, {
      chat_id: parsed.chatId,
      text:
        "Act 命令用法：\n" +
        "/act start — 开始记录\n" +
        "/act end — 结束记录并保存\n" +
        "/act list — 列出当前话题的记录\n" +
        "/act show <id> [page] — 查看记录（可分页）",
      message_thread_id: parsed.threadId
    });
    return;
  }

  const parts = tail.split(/\s+/);
  const sub = parts[0].toLowerCase();

  if (sub === "start") {
    await doStart(parsed, env);
    return;
  }

  if (sub === "end") {
    await doEnd(parsed, env);
    return;
  }

  if (sub === "list") {
    await doList(parsed, env);
    return;
  }

  if (sub === "show") {
    const idArg = parts[1];
    const pageArg = parts[2];
    await doShow(parsed, env, idArg, pageArg);
    return;
  }

  // 未识别
  await TgMessage.sendText(env, {
    chat_id: parsed.chatId,
    text: `未知子命令：${escapeHtml(sub)}\n用法：/act start | /act end | /act list | /act show <id> [page]`,
    message_thread_id: parsed.threadId
  });
}

export default handleAct;
