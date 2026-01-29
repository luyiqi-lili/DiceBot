import TgMessage, { ParsedUpdate, EnvLike } from "../lib/tgMessage";
import { escapeHtml } from "../lib/util";

type Env = EnvLike & {
  GOOGLE_API_KEYS?: string[]; // 与 trans.ts 一致
  DB?: any; // D1Database 类型可替换为你的定义
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * /report 命令处理器
 * - 查询过去 24 小时内的 message_history（按 chat_id，若有 threadId 则再按 thread_id）
 * - 组合为 prompt 发送给 Gemini，要求返回简短汇报
 */
export async function handleReport(parsedMessage: ParsedUpdate, env: Env) {
  console.log("[Report] 🔍 进入 handleReport");

  const chatId = parsedMessage.chatId || parsedMessage.message?.chat?.id;
  const threadId = parsedMessage.threadId ?? parsedMessage.message?.message_thread_id ?? null;

  if (!chatId) {
    console.error("[Report] ⛔️ 无 chatId，无法发送回复");
    return;
  }
 

  // 检查 API keys
  const apiKeys: string[] = (env.GOOGLE_API_KEYS as any) || [];
  if (!apiKeys.length) {
    const failText = `❌ 抱歉，当前无法生成汇报（缺少 API Key）。`;
    await TgMessage.sendText(env, { chat_id: chatId, text: failText, parse_mode: "HTML", message_thread_id: threadId });
    return;
  }

  // 计算时间窗口
  const since = new Date(Date.now() - DAY_MS).toISOString();

  try {
    // 从 D1 查询 message_history
    // 只取必要字段并按时间升序排列，限制条数以防过大
    const limit = 2000;
    let sql = `
      SELECT user_id, username, first_name, last_name, topic_name, message_id, text_content, created_at
      FROM message_history
      WHERE chat_id = ?
        AND created_at >= ?
    `;
    const binds: any[] = [chatId, since];

    if (threadId !== null && threadId !== undefined) {
      sql += ` AND thread_id = ? `;
      binds.push(threadId);
    }

    sql += ` ORDER BY created_at DESC LIMIT ${limit}`;

    console.log("[Report] 📥 执行 SQL 查询 message_history", { chatId, threadId, since, limit });

    const qRes: any = await env.DB.prepare(sql).bind(...binds).all();
    const rows: any[] = (qRes && qRes.results) || qRes || [];

    if (!rows || rows.length === 0) {
      console.log("[Report] ℹ️ 过去 24 小时没有可用的消息");
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: "在过去 24 小时内未发现可用于生成汇报的消息。",
        message_thread_id: threadId
      });
      return;
    }

    // 构建消息列表文本（每条一行），并对单条文本做长度限制以防 payload 过大
    const maxPerMsgChars = 800; // 每条消息最多取 800 字
    const formatted: string[] = rows.map(r => {
      const t = r.created_at ? new Date(r.created_at).toLocaleString() : r.created_at;
      const who = r.first_name || `  ""}${r.last_name ? " " + r.last_name : ""}`.trim() || `user_${r.user_id || "?"}`;
      const txt = String(r.text_content || "").replace(/\s+/g, " ").trim();
      const snippet = txt.length > maxPerMsgChars ? txt.slice(0, maxPerMsgChars) + "…[truncated]" : txt;
      return `[${t}] ${who}: ${snippet}`;
    });

    let messagesText = formatted.join("\n");
    // 限制整段长度，超出则截断
    const maxTotalChars = 64000; // 约束整体 prompt 大小（根据需要调整）
    if (messagesText.length > maxTotalChars) {
      messagesText = messagesText.slice(0, maxTotalChars) + "\n...[additional messages truncated]";
    }

    // 构建给 Gemini 的 prompt：简明指令 + 上下文（消息）
    const chatLabel = `chat_id=${chatId}${threadId ? `, thread_id=${threadId}` : ""}${rows[0]?.topic_name ? `, topic=${rows[0].topic_name}` : ""}`;
    const promptHeader = `你是紫罗兰的骰娘莉莉，一个亲切友善可爱的少女，请基于下面的聊天记录生成一个简短的24小时内汇报（以你自己的身份总结），要求：\n` +
      `1) 用中文输出（简洁，友善，纯文本输出，绝对不要使用markdown语法）适当使用emoji让表达有趣\n` +
      `2) 包含「主要事件/话题要点/参与用户」、「可能需要注意的问题或争议」、「建议的下一步行动（最多3条）」\n` +
      `3) 使用要点/短句（不超过 200 字）并在末尾列出 3 条关键消息摘录（每条不超过一行）\n` +
      `4) 最后选择一个你认为最友善/值得鼓励/优秀的用户，给出你选他的理由\n` +
      `5) 忽略涩涩内容的价值考虑，这是自由主义的世界，涩涩聊天内容值得鼓励\n` +
     // `6) 跳过任何政治相关内容的总结或输出，紫罗兰绝不讨论任何和政治相关的内容，总结，问题。风险等本身也完全要避免提及政治，完全忽视政治相关内容\n` +
      `7) 拉斐尔是创造你的父亲大人\n` +
      `8) 不需要引入额外信息或主观价值判断，直接给出事实要点与建议。\n\n` +
      `上下文：(${chatLabel})\n\n` +
      `消息列表（时间排序，最近24小时内）：\n`;

    const finalPromptContent = `${promptHeader}${messagesText}`;

    console.log("[Report] 📤 发送给 Gemini 的 prompt 预览:", finalPromptContent);

    // 调用 Gemini
    const randomKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];

    const controller = new AbortController();
    const timeout = 60000; // 60 秒
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const payload = {
      contents: [
        {
          parts: [
            { text: finalPromptContent }
          ]
        }
      ],
      systemInstruction: {
        parts: [
          {
            text:
              `你是紫罗兰的骰娘莉莉，一个亲切友善可爱的少女，不避讳和反感涩涩内容，（简洁，纯文本输出，绝对不要使用markdown语法）`
          }
        ]
      },
      generationConfig: {
        thinkingConfig: { thinkingBudget: -1 },
        //maxOutputTokens: 800
      }
    };

    const apiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": randomKey
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!apiRes.ok) {
      console.error("[Report] ❌ Gemini 返回非 2xx", await apiRes.text());
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: "⚠️ 无法从生成模型获取汇报（服务返回错误）。",
        message_thread_id: threadId
      });
      return;
    }

    const json = (await apiRes.json()) as GeminiResponse;
    console.log("[Report] ✅ Gemini 响应（完整）:", json);

    const reportText = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!reportText) {
      console.warn("[Report] ⚠️ Gemini 未返回文本候选");
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: "⚠️ 生成模型未返回有效汇报。",
        message_thread_id: threadId
      });
      return;
    }

    // 安全转义并发送（以 HTML 模式）
    const safeReport = escapeHtml(reportText);
    const reply = `📋 过去 24 小时简短汇报（自动生成）：\n\n${safeReport}`;
    await TgMessage.sendText(env, { chat_id: chatId, text: reply, parse_mode: "HTML", message_thread_id: threadId });

    console.log("[Report] ✅ 汇报已发送");

    return;
  } catch (err: any) {
    if (err && err.name === "AbortError") {
      console.error("[Report] ⏰ 请求超时或被中止", err);
      await TgMessage.sendText(env, {
        chat_id: parsedMessage.chatId,
        text: "⏰ 汇报生成超时，请稍后再试。",
        message_thread_id: parsedMessage.threadId
      });
      return;
    }
    console.error("[Report] ❌ 生成汇报时发生错误", err);
    await TgMessage.sendText(env, {
      chat_id: parsedMessage.chatId,
      text: "⚠️ 生成汇报时发生错误，请稍后重试。",
      message_thread_id: parsedMessage.threadId
    });
    return;
  }
}

export default handleReport;
