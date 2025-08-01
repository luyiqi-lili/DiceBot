export async function handleTrans(msg: any, env: Env) {
  console.log("[Trans] 🔍 进入 handleTrans");

  const replied = msg.reply_to_message;
  if (!replied || !replied.text) {
    console.log("[Trans] ⛔️ 未检测到回复消息或原始消息没有文本内容");
    return {
      text: "请回复一条带有文本的消息，并在回复时发送 `/trans` 命令。",
      parse_mode: "Markdown"
    };
  }

  const originalText = msg.text as string;
  console.log("[Trans] 🧾 原始消息内容:", originalText);

  // 去除 @BotUsername 前缀
  const mentionRegex = new RegExp(`^@${env.BOT_USERNAME}\s*`, 'i');
  const cmdText = originalText.replace(mentionRegex, '').trim();
  console.log("[Trans] 🧾 处理后命令文本:", cmdText);

  // 匹配 /trans [language]
  const match = cmdText.match(/^\/trans(?:@\w+)?(?:\s+(.+))?/i);
  let targetLang = match && match[1] ? match[1].trim() : "简体中文";
  console.log("[Trans] 🌐 目标语言:", targetLang);

  const contentToTranslate = replied.text;
  console.log("[Trans] 📄 待翻译文本:", contentToTranslate);
  const payload = {
    contents: [
      {
        parts: [
          { text: `翻译下面的内容为${targetLang}：\n${contentToTranslate}` }
        ]
      }
    ],
    systemInstruction: {
      parts: [
        { text: `你是一个精通网络用语、俚语和流行梗的骰娘。只输出翻译，不要多余说明。` }
      ]
    },
    generationConfig: {
      thinkingConfig: { thinkingBudget: -1 }
    }
  };

  console.log("[Trans] 📤 发送翻译请求 payload:", JSON.stringify(payload));

  try {

    const apiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GOOGLE_API_KEY
        },
        body: JSON.stringify(payload)
      }
    );

    const json = await apiRes.json();
    console.log("[Trans] ✅ 收到翻译响应:", JSON.stringify(json));

    const translation = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();


    if (!translation) {
      console.log("[Trans] ⚠️ 翻译结果为空或未找到 choices 内容");
      return { text: "[翻译失败，未收到有效响应]" };
    }

    console.log("[Trans] 🎯 翻译结果:", translation);

    // 构建输出，包含可展开的思考
    const replyText = `骰娘刚刚听到： 「${contentToTranslate}」 翻译一下就是： 「${translation}」`;

    return { text: replyText, parse_mode: "HTML" };
  } catch (e) {
    console.error("[Trans] ❌ 调用翻译 API 失败", e);
    return { text: "⚠️ 翻译服务调用失败，请稍后重试。" };
  }
}
