import TgMessage, { ParsedUpdate } from "../lib/tgMessage";
import type { Env } from '../index';

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

/**
 * 处理 inline_query，提供 AI 辅助聊天建议
 * 1. 根据用户ID查询其最近发送消息的 chat_id 和 thread_id
 * 2. 获取该话题的最近聊天记录作为上下文
 * 3. 调用 Gemini 生成 3-5 条回复建议
 * 4. 返回 Inline 结果
 */
export async function handleInlineAI(parsedMessage: ParsedUpdate, env: Env) {
  console.log("[AI Assist] 🔍 进入 handleInlineAI");
  
  const userId = parsedMessage.from?.id;
  const userQuery = parsedMessage.text || ""; // 用户输入的查询内容
  const inlineQueryId = parsedMessage.inlineQueryId || "";
  
  if (!userId) {
    console.error("[AI Assist] ⛔️ 无法获取用户ID");
    return;
  }
  
  if (!userQuery.trim()) {
    // 如果用户没有输入查询内容，可以返回一些默认建议
    await answerWithDefaultSuggestions(env, inlineQueryId, userId);
    return;
  }
  
  // 检查 API keys
  const apiKeys: string[] = env.GOOGLE_API_KEYS ? JSON.parse(env.GOOGLE_API_KEYS) : [];
  if (!apiKeys.length) {
    console.error("[AI Assist] ⛔️ 缺少 Gemini API Keys");
    await answerWithError(env, inlineQueryId, "抱歉，AI 服务暂时不可用。");
    return;
  }
  
  try {
    // 1. 查询用户最近发送消息的 chat_id 和 thread_id
    const recentContext = await getRecentUserContext(env, userId);
    
    if (!recentContext) {
      console.log("[AI Assist] ℹ️ 未找到用户最近的聊天记录");
      await answerWithDefaultSuggestions(env, inlineQueryId, userId);
      return;
    }
    
    const { chatId, threadId, topicName } = recentContext;
    
    // 2. 获取该话题的最近聊天记录（限制条数，避免上下文过长）
    const recentMessages = await getRecentChatHistory(env, chatId, threadId, 20); // 获取最近20条
    
    // 3. 构建 AI 提示词
    const prompt = buildAIPrompt(userQuery, recentMessages, topicName);
    
    // 4. 调用 Gemini 生成回复建议
    const aiSuggestions = await generateAISuggestions(env, prompt, apiKeys);
    
    if (!aiSuggestions || aiSuggestions.length === 0) {
      await answerWithError(env, inlineQueryId, "未能生成回复建议，请重试。");
      return;
    }
    
    // 5. 构建 Inline 结果并返回
    await answerInlineQuery(env, inlineQueryId, aiSuggestions, userQuery);
    
    console.log("[AI Assist] ✅ 成功返回 AI 建议");
    
  } catch (err: any) {
    console.error("[AI Assist] ❌ 处理过程中发生错误", err);
    await answerWithError(env, inlineQueryId, "处理请求时发生错误，请稍后重试。");
  }
}

/**
 * 获取用户最近发送消息的上下文（chat_id 和 thread_id）
 */
async function getRecentUserContext(env: Env, userId: number): Promise<{
  chatId: number;
  threadId: number | null;
  topicName: string;
} | null> {
  try {
    const sql = `
      SELECT chat_id, thread_id, topic_name, created_at
      FROM message_history
      WHERE user_id = ?
        AND text_content IS NOT NULL
        AND text_content != ''
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    const result = await env.DB!.prepare(sql).bind(userId).all();
    const row = result.results?.[0];
    
    if (!row) {
      return null;
    }
    
    return {
      chatId: row.chat_id,
      threadId: row.thread_id,
      topicName: row.topic_name || "未知话题"
    };
  } catch (err) {
    console.error("[AI Assist] ❌ 查询用户上下文失败", err);
    return null;
  }
}

/**
 * 获取指定话题的最近聊天记录
 */
async function getRecentChatHistory(
  env: Env, 
  chatId: number, 
  threadId: number | null, 
  limit: number
  ): Promise<any[]> {
    try {
      let sql = `
        SELECT user_id, username, first_name, text_content, created_at
        FROM message_history
      WHERE chat_id = ?
        AND text_content IS NOT NULL
        AND text_content != ''
    `;
    
    const binds: any[] = [chatId];
    
    if (threadId !== null && threadId !== undefined) {
      sql += ` AND thread_id = ?`;
      binds.push(threadId);
    }
    
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    binds.push(limit);
    
    const result = await env.DB!.prepare(sql).bind(...binds).all();
    return result.results || [];
  } catch (err) {
    console.error("[AI Assist] ❌ 获取聊天记录失败", err);
    return [];
  }
}

/**
 * 构建 AI 提示词
 */
function buildAIPrompt(
  userQuery: string, 
  recentMessages: any[], 
  topicName: string
): string {
  // 反转消息顺序，从旧到新
  const chronologicalMessages = [...recentMessages].reverse();
  
  // 格式化历史消息
  const historyText = chronologicalMessages.map(msg => {
    const time = msg.created_at ? new Date(msg.created_at).toLocaleTimeString() : '';
    const name = msg.first_name || `user_${msg.user_id}`;
    const content = String(msg.text_content || '').slice(0, 300); // 截断避免过长
    
    return `[${time}] ${name}: ${content}`;
  }).join('\n');
  
  const prompt = `

以下是最近的聊天记录（按时间顺序）：
${historyText}

当前用户输入：${userQuery}

请根据以上聊天上下文和用户输入，生成 3-5 条适合作为用户润色后的回应的建议。
要求：
1. 每条建议都是完整、自然的回复句子
2. 风格亲切友好，适当使用 emoji
3. 长度适中（1-3句话）
4. 贴合聊天上下文和话题
5. 用中文回复

请直接返回建议内容，每条建议用 "---" 分隔，不要添加额外说明。

建议：`;
  
  return prompt;
}

/**
 * 调用 Gemini 生成回复建议
 */
async function generateAISuggestions(
  env: Env, 
  prompt: string, 
  apiKeys: string[]
): Promise<string[]> {
  const randomKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];
  
  const controller = new AbortController();
  const timeout = 30000; // 30 秒超时
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 800,
        temperature: 0.7,
      }
    };
    
    const apiRes = await fetch( 
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${randomKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!apiRes.ok) {
      console.error("[AI Assist] ❌ Gemini API 错误", await apiRes.text());
      return [];
    }
    
    const json: GeminiResponse = await apiRes.json();
    const responseText = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    
    if (!responseText) {
      return [];
    }
    
    // 按 "---" 分隔建议
    const suggestions = responseText
      .split('---')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .slice(0, 5); // 最多5条
    
    return suggestions;
    
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error("[AI Assist] ⏰ Gemini 请求超时");
    } else {
      console.error("[AI Assist] ❌ 调用 Gemini 失败", err);
    }
    return [];
  }
}

/**
 * 返回 Inline 查询结果
 */
async function answerInlineQuery(
  env: Env, 
  inlineQueryId: string, 
  suggestions: string[], 
  userQuery: string
) {
  if (suggestions.length === 0) {
    return await answerWithError(env, inlineQueryId, "未生成任何建议。");
  }
  
  // 构建 Inline 结果
  const results = suggestions.map((suggestion, index) => ({
    type: 'article',
    id: `ai_suggestion_${index}_${Date.now()}`,
    title: `建议 ${index + 1}`,
    description: suggestion.length > 50 ? suggestion.slice(0, 47) + '...' : suggestion,
    input_message_content: {
      message_text: suggestion,
      parse_mode: 'HTML'
    },
    reply_markup: suggestions.length > 1 ? {
      inline_keyboard: [[
        { 
          text: "🔄 换一条", 
          callback_data: JSON.stringify({ 
            type: 'ai_cycle', 
            query: userQuery,
            currentIndex: index,
            total: suggestions.length
          }) 
        }
      ]]
    } : undefined
  }));
  
  try {
    await TgMessage.send(env, 'answerInlineQuery', {
      inline_query_id: inlineQueryId,
      results: JSON.stringify(results),
      cache_time: 10, // 缓存10秒
      is_personal: true // 每个用户独立
    });
  } catch (err) {
    console.error("[AI Assist] ❌ 发送 Inline 结果失败", err);
  }
}

/**
 * 返回默认建议（当没有查询内容或没有历史记录时）
 */
async function answerWithDefaultSuggestions(
  env: Env, 
  inlineQueryId: string, 
  userId: number
) {
  const defaultSuggestions = [
    "👋 你好呀！最近怎么样？",
    "😊 有什么我可以帮忙的吗？",
    "💭 在想什么呢？",
    "🎲 要来一局游戏吗？",
    "📚 最近看了什么有趣的东西吗？"
  ];
  
  const results = defaultSuggestions.map((suggestion, index) => ({
    type: 'article',
    id: `default_${index}_${Date.now()}`,
    title: `通用回复 ${index + 1}`,
    description: suggestion,
    input_message_content: {
      message_text: suggestion,
      parse_mode: 'HTML'
    }
  }));
  
  try {
    await TgMessage.send(env, 'answerInlineQuery', {
      inline_query_id: inlineQueryId,
      results: JSON.stringify(results),
      cache_time: 300, // 缓存5分钟
      is_personal: true
    });
  } catch (err) {
    console.error("[AI Assist] ❌ 发送默认建议失败", err);
  }
}

/**
 * 返回错误信息
 */
async function answerWithError(
  env: Env, 
  inlineQueryId: string, 
  errorMessage: string
) {
  const result = [{
    type: 'article',
    id: `error_${Date.now()}`,
    title: '⚠️ 出错了',
    description: errorMessage,
    input_message_content: {
      message_text: "抱歉，暂时无法提供 AI 建议。",
      parse_mode: 'HTML'
    }
  }];
  
  try {
    await TgMessage.send(env, 'answerInlineQuery', {
      inline_query_id: inlineQueryId,
      results: JSON.stringify(result),
      cache_time: 60,
      is_personal: true
    });
  } catch (err) {
    console.error("[AI Assist] ❌ 发送错误信息失败", err);
  }
}

export default handleInlineAI;