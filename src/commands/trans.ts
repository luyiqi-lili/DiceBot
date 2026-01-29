import TgMessage, { ParsedUpdate, EnvLike } from "../lib/tgMessage";
import { escapeHtml } from "../lib/util";

type Env = EnvLike & {
  AI: any; // Cloudflare AI 绑定
};

export async function handleTrans(parsedMessage: ParsedUpdate, env: Env) {
  console.log("[Trans] 🔍 进入 handleTrans (parsed)");

  const chatId = parsedMessage.chatId || parsedMessage.message?.chat?.id;
  const threadId = parsedMessage.threadId;
  if (!chatId) {
    console.error("[Trans] ⛔️ 无 chatId，无法发送回复");
    return;
  }

  const repliedText =
    (parsedMessage.replyToMessage && parsedMessage.replyToMessage.text) ??
    (parsedMessage.message && parsedMessage.message.reply_to_message && parsedMessage.message.reply_to_message.text) ??
    undefined;

  if (!repliedText) {
    console.log("[Trans] ⛔️ 未检测到回复消息或原始消息没有文本内容");
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: "请回复一条带有文本的消息，并在回复时发送 `/trans` 命令。",
      parse_mode: "Markdown",
      message_thread_id: threadId
    });
    return;
  }

  const originalText = parsedMessage.text || "";
  console.log("[Trans] 🧾 原始命令文本:", originalText);

  const botUsername = (env as any).BOT_USERNAME || "";
  const mentionRegex = botUsername ? new RegExp(`^@${botUsername}\\s*`, "i") : /^@?\w+\s*/i;
  const cmdText = originalText.replace(mentionRegex, "").trim();
  console.log("[Trans] 🧾 处理后命令文本:", cmdText);

  const match = cmdText.match(/^\/trans(?:@\w+)?(?:\s+(.+))?/i);
  const targetLang = match && match[1] ? match[1].trim() : "简体中文";
  console.log("[Trans] 🌐 目标语言:", targetLang);

  try {
    console.log("[Trans] 📤 发送翻译请求，目标语言:", targetLang);
    
    // 直接使用 input 参数，而不是 messages
    const response = await env.AI.run('@cf/openai/gpt-oss-120b', {
      input: `请将以下文本翻译为${targetLang}，只输出翻译结果，不要任何解释和说明：\n${repliedText}`,
      reasoning: {
        effort: "low" // 降低推理努力，加快响应速度
      },
      summary: "auto"
    });

    console.log("[Trans] ✅ 收到翻译响应（原始）:", response);
    console.log("[Trans] ✅ 收到翻译响应（JSON）:", JSON.stringify(response, null, 2));

    // 根据 Cloudflare AI 的响应格式提取文本
    let translation = "";
    
    // 方式1：如果响应是字符串
    if (typeof response === 'string') {
      translation = response.trim();
    }
    // 方式2：如果响应是对象且有 choices 数组
    else if (response && typeof response === 'object') {
      // 尝试不同的响应格式
      
      // 格式1: OpenAI 兼容格式
      if (response.choices && Array.isArray(response.choices) && response.choices[0]?.message?.content) {
        translation = response.choices[0].message.content.trim();
      }
      // 格式2: 直接有 content 字段
      else if (response.content) {
        translation = response.content.trim();
      }
      // 格式3: 有 text 字段
      else if (response.text) {
        translation = response.text.trim();
      }
      // 格式4: 有 response 字段
      else if (response.response) {
        translation = response.response.trim();
      }
      // 格式5: 直接是对象，尝试转换为字符串
      else {
        // 尝试获取第一个可用的文本字段
        const textFields = ['output', 'result', 'translation', 'answer'];
        for (const field of textFields) {
          if (response[field]) {
            translation = String(response[field]).trim();
            break;
          }
        }
        
        // 如果以上都没有，使用 JSON.stringify
        if (!translation) {
          translation = JSON.stringify(response).slice(0, 1000); // 限制长度
        }
      }
    }

    console.log("[Trans] 🎯 提取的翻译文本:", translation);

    if (!translation) {
      console.log("[Trans] ⚠️ 翻译结果为空");
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: "[翻译失败，未收到有效响应]",
        message_thread_id: threadId
      });
      return;
    }

    // 清理响应中的推理过程（如果存在）
    // 移除任何可能包含思考过程的标记
    translation = translation.replace(/SCENE THOUGHT:.*?\n\n?/gis, '');
    translation = translation.replace(/\[.*?思考.*?\].*?\n\n?/gis, '');
    translation = translation.replace(/思考过程：.*?\n\n?/gis, '');
    translation = translation.replace(/.*?reasoning:.*?\n\n?/gis, '');
    
    // 如果翻译过长，截取主要部分
    const maxLength = 2000; // Telegram消息限制
    if (translation.length > maxLength) {
      translation = translation.substring(0, maxLength) + "...";
    }

    console.log("[Trans] ✅ 清理后的翻译文本:", translation);

    const safeOriginal = escapeHtml(repliedText);
    const safeTranslation = escapeHtml(translation);

    const replyText = `骰娘刚刚听到： 「${safeOriginal}」\n翻译一下就是： 「${safeTranslation}」`;

    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: replyText,
      parse_mode: "HTML",
      message_thread_id: threadId
    });

    return;
  } catch (e: any) {
    console.error("[Trans] ❌ 调用翻译 API 失败", e);
    
    let errorMessage = "⚠️ 翻译服务调用失败，请稍后重试。";
    
    if (e.message?.includes("timeout") || e.name === 'AbortError') {
      errorMessage = "⏰ 翻译请求超时，请稍后重试。";
    } else if (e.message?.includes("rate limit") || e.message?.includes("Rate limit")) {
      errorMessage = "🚫 请求频率过高，请稍后再试。";
    } else if (e.message?.includes("invalid") || e.message?.includes("Invalid")) {
      errorMessage = "❌ 请求参数无效，请检查命令格式。";
    } else if (e.message?.includes("AI") || e.message?.includes("ai")) {
      errorMessage = "🔧 AI 服务配置错误，请检查 Cloudflare AI 绑定。";
    }
    
    await TgMessage.sendText(env, {
      chat_id: chatId,
      text: errorMessage,
      message_thread_id: threadId
    });
    return;
  }
}

export default handleTrans;