import TgMessage, { ParsedUpdate, extractCmdContext } from "../lib/tgMessage";
import { attitudeResponses } from "../lib/liveConfig";
import { callAIChat } from "../lib/aiClient";
import {escapeHtml}  from "../lib/util";
import type { Env } from "../index";

// 黑名单用户名列表（请按需修改）
const blacklist = [
  "example",
  // 在此添加更多用户名（小写匹配）
];
 
function buildEchoPrompt(content: string, diceRoll: number, attitude: string, referenceResponse: string): string {
  return [
    "请根据下面信息，生成一条新的骰娘莉莉风格评价。",
    "",
    `用户内容：${content}`,
    `骰点：${diceRoll}`,
    `态度：${attitude}`,
    `参考文案：${referenceResponse}`,
    "",
    "要求：",
    "1. 只输出评价正文，不要重复用户名、骰点或态度标题。",
    "2. 态度必须与骰点结果一致。",
    "3. 参考文案只用来学习语气和风格，不要照抄。",
    "4. 保持中文群聊口吻，像骰娘莉莉在轻松评价这句话。",
    "5. 适合直接发到 Telegram 群里，控制在 80 字以内。",
  ].join("\n");
}

export async function handleEcho(parsedMessage: ParsedUpdate, env: Env) {
  const { chatId, from } = extractCmdContext(parsedMessage);
  if (!chatId || !from) { console.error("[echo] 找不到 chatId 或 from"); return; }

  // 优先使用 username（无 @），没有则使用 first_name
  const rawUserName = (from.username as string) || (from.first_name as string) || `ID${from.id}`;
  const userNameForCheck = rawUserName.toLowerCase();

  // 黑名单检查（小写匹配）
  if (blacklist.map(s => s.toLowerCase()).includes(userNameForCheck)) {
    return await TgMessage.sendText(env, {
      chat_id: chatId,
      text: "骰娘说爸爸不让我和傻子玩",
      message_thread_id: parsedMessage.threadId
    });
  }

  // 提取 content：优先使用解析出的 args（如果有），否则从原始文本去掉命令前缀
  let content = "";
  if (Array.isArray(parsedMessage.args) && parsedMessage.args.length > 0) {
    content = parsedMessage.args.join(" ");
  } else if (parsedMessage.text) {
    // 移除可能的 @Bot 前缀和 /echo 或 echo 前缀
    content = parsedMessage.text.replace(new RegExp(`^@?\\w*\\s*`), "");
    content = content.replace(/\/echo\b/i, "").replace(/^\s*@?\w+\s*/i, "").trim();
  }

  content = content.trim() || "(没有内容)";

  // 模拟掷骰子，结果为 1~6
  const diceRoll = Math.floor(Math.random() * 6) + 1;

  // 获取对应的回应（容错处理）
  const attitudeMap: Array<keyof typeof attitudeResponses> = [
    "非常不同意", // 1
    "不同意",     // 2
    "一般",       // 3
    "一般",       // 4
    "同意",       // 5
    "非常同意"    // 6
  ];
  const chosenAttitude = attitudeMap[diceRoll - 1]; // 类型是 keyof typeof attitudeResponses
  const responses = attitudeResponses[chosenAttitude];
  const chosenResponse = responses[Math.floor(Math.random() * responses.length)];

  console.log("🗣 用户名 =", rawUserName);
  console.log("🎲 掷骰结果 =", diceRoll);
  console.log("📢 Echo 内容 =", content);
  console.log("🎭 态度 =", chosenAttitude);
  console.log("🎯 参考表述 =", chosenResponse);

  // 显示给用户的显示名：优先 KV/firstName（如果你有类似逻辑可以替换）；这里直接用 from.first_name 回退
  const displayName = (from.first_name as string) || rawUserName || `ID ${from.id}`;
  const safeName = escapeHtml(displayName);
  const safeContent = escapeHtml(content);

  try {
    const generatedResponse = await callAIChat(env, {
      temperature: 0.9,
      maxTokens: 180,
      timeoutMs: 60000,
      messages: [
        {
          role: "system",
          content: "你是紫罗兰花园的骰娘莉莉，活泼、机灵、会用一点冒险者和骰子风格的比喻。你会根据给定骰点和态度评价用户内容。",
        },
        {
          role: "user",
          content: buildEchoPrompt(content, diceRoll, chosenAttitude, chosenResponse),
        },
      ],
    });

    const text = `${safeName} 说：${safeContent}\n🎲 骰娘扔出了一个 ${diceRoll}，因此她认为：${chosenAttitude}：${escapeHtml(generatedResponse)}`;

    return await TgMessage.sendText(env, {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      message_thread_id: parsedMessage.threadId
    });
  } catch (err) {
    console.error("[echo] LLM 调用失败", err);

    return await TgMessage.sendText(env, {
      chat_id: chatId,
      text: `${safeName} 说：${safeContent}\n🎲 骰娘扔出了一个 ${diceRoll}，因此她认为：${chosenAttitude}：骰娘的评价服务暂时不可用，请稍后再试。`,
      parse_mode: "HTML",
      message_thread_id: parsedMessage.threadId
    });
  }
}

export default handleEcho;
