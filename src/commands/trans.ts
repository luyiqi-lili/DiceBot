// commands/trans.ts
// 环境配置方法：
// 方法一：在 Cloudflare Workers Dashboard 中
//   1. 打开 Workers → 选择对应的脚本 → 点击 "Settings" → "Variables"
//   2. 新增变量：
//      键: SILICONFLOW_API_KEY
//      值: 你的 SiliconFlow API Key
//      键: BOT_USERNAME
//      值: 你的 Bot 用户名，如 LichDiceBot
// 方法二：使用 wrangler.toml 本地部署
//   在 wrangler.toml 中添加：
//   [vars]
//   SILICONFLOW_API_KEY = "你的 SiliconFlow API Key"
//   BOT_USERNAME = "LichDiceBot"

type Env = {
  SILICONFLOW_API_KEY: string;
  BOT_USERNAME: string;
};

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
    model: "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `你是一个精通网络用语、俚语和流行梗的骰娘。对日语、中文、英语等多种语言的网络表达、缩写、梗图文字等都有深入了解。` +
                 `当收到翻译时，能识别并准确转换网络俚语和梗文化，输出简练自然的目标语言结果，避免直译造成生硬。只输出翻译文本，不要输出任何多余的分析或思考过程。` +
                 `在CoT过程中。直接称呼自己为"骰娘",称呼用户为"你"，**绝对避免**使用“用户”这个称呼，保持友好、耐心、幽默、富有同理心，避免过于正式、冰冷或机械化的语言` +
                 `特别记住，杂鱼的日语翻译是雑魚（ざこ）` 
      },
      {
        role: "user",
        content: `翻译下面的内容为${targetLang}：\n${contentToTranslate}`
      }
    ]
  };
  console.log("[Trans] 📤 发送翻译请求 payload:", JSON.stringify(payload));

  try {
    const apiRes = await fetch(
      "https://api.siliconflow.cn/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.SILICONFLOW_API_KEY}`
        },
        body: JSON.stringify(payload)
      }
    );

    const json = await apiRes.json();
    console.log("[Trans] ✅ 收到翻译响应:", JSON.stringify(json));

    const choice = json.choices?.[0]?.message;
    const translation = choice?.content?.trim();
    const reasoning = (choice as any)?.reasoning_content?.trim();

    if (!translation) {
      console.log("[Trans] ⚠️ 翻译结果为空或未找到 choices 内容");
      return { text: "[翻译失败，未收到有效响应]" };
    }

    console.log("[Trans] 🎯 翻译结果:", translation);
    if (reasoning) console.log("[Trans] 💭 思考内容:", reasoning);

    // 构建输出，包含可展开的思考
    let replyText = `骰娘刚刚听到： 「${contentToTranslate}」 翻译一下就是： 「${translation}」`;
    if (reasoning) {
      replyText += ` <blockquote expandable><tg-spoiler>${reasoning}</tg-spoiler></blockquote>`;
    }

    return { text: replyText, parse_mode: "HTML" };
  } catch (e) {
    console.error("[Trans] ❌ 调用翻译 API 失败", e);
    return { text: "⚠️ 翻译服务调用失败，请稍后重试。" };
  }
}
