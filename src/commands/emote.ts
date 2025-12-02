// commands/emote.ts
import TgMessage, { ParsedUpdate, EnvLike } from "../lib/tgMessage";
import { deleteMarkup } from "../lib/util";

/**
 * /em 命令处理器
 * 支持别名：/e, /me, /emote （由 index.ts 在命令分发处映射）
 */
export async function handleEmote(parsed: ParsedUpdate, env: EnvLike) {
  if (!parsed || parsed.type !== "message" || !parsed.message) {
    console.log("[emote] 非 message 或缺少 message，忽略");
    return;
  }

  const chatId = parsed.chatId!;
  const threadId = parsed.threadId;
  const from = parsed.from ?? parsed.message.from;
  if (!from) {
    console.error("[emote] 无发起用户信息，无法继续");
    return;
  }

  // 获取演员显示名：优先 first_name，再 username，再 id
  const actorRaw =
    (from.first_name as string) ||
    (from.username ? `@${from.username}` : "") ||
    `ID${from.id}`;
  const actor = actorRaw.trim();

  // 如果是回复则尝试获取目标用户信息（用于 %t 替换）
  let targetRaw: string | null = null;
  let replyToMessageId: number | undefined = undefined;
  if (parsed.isReply && parsed.replyToMessage && parsed.replyToMessage.from) {

    if (parsed.replyToMessage.from.is_bot) {
      const errText = `哎呀，莉莉可没办法和别的机器人互动哦～请回复一位真人玩家的消息来使用此功能。`;
      try {
        await TgMessage.sendText(env, {
          chat_id: chatId,
          text: errText,
          parse_mode: "HTML",
          message_thread_id: threadId,
          reply_markup: deleteMarkup // 使用已有的删除按钮
        });
      } catch (e) {
        console.error("[emote] 发送‘禁止回复Bot’提示失败", e);
      }
      return; // 直接结束函数，不再执行后面的动作发送流程
    }


    const tgt = parsed.replyToMessage.from;
    // 记录要回复的 message_id（使 bot 的消息回复同一条被回复消息）
    replyToMessageId = parsed.replyToMessage.message_id;
    try {
      const member = await TgMessage.fetchChatMember(env, chatId, tgt.id);
      // 优先用 first_name，再 username，再回落到 ID
      targetRaw = (member?.first_name as string) || (member?.username ? `@${member.username}` : (`ID${tgt.id}`));
    } catch (e) {
      // fetch 失败则回退到回复消息里原始 from 字段（可靠）
      try {
        targetRaw = (tgt.first_name as string) || (tgt.username ? `@${tgt.username}` : (`ID${tgt.id}`));
      } catch {
        targetRaw = `ID${tgt.id}`;
      }
    }
  }

  // 提取命令后的文本：优先使用 args（parseCommandFromText 已填充）
  let content = "";
  if (Array.isArray(parsed.args) && parsed.args.length > 0) {
    content = parsed.args.join(" ").trim();
  } else if (parsed.text) {
    // 回退：从原始文本中移除命令前缀（例如 "/em"、"/me"、"@Bot /em" 等）
    content = parsed.text.replace(/^\s*\/?\w+(@\w+)?\s*/i, "").trim();
  }

  // 如果用户没有输入任何内容，提示并结束
  if (!content || content.trim().length === 0) {
    const hint = `错误：请在 /em 后添加动作描述。例如：<code>/em 开心地跳了起来</code>`;
    try {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: hint,
        parse_mode: "HTML",
        message_thread_id: threadId,
        reply_markup: deleteMarkup
      });
    } catch (e) {
      console.error("[emote] 发送空内容提示失败", e);
    }
    return;
  }

  // 检查 %t 占位符使用情况
  const containsTargetPlaceholder = content.includes("%t");

  if (containsTargetPlaceholder && !targetRaw) {
    // 错误使用 %t：没有回复指定目标
    const errText = `错误：使用 %t 时，请通过 "回复" 一条消息来指定目标用户。`;
    try {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: errText,
        parse_mode: "HTML",
        message_thread_id: threadId,
        reply_markup: deleteMarkup
      });
    } catch (e) {
      console.error("[emote] 发送错误提示失败", e);
    }
    return;
  }

  // 如果存在 targetRaw，则替换 %t 为目标名称
  let finalContent = content;
  if (targetRaw) {
    finalContent = finalContent.split("%t").join(`${targetRaw}`);
  }

  // 组装输出文本： "<em> Actor action </em>"
  const out = `<em>  ${actor}${finalContent} </em>`;

  // 发送时如果用户原始消息是回复某条消息，bot 的消息也应 reply_to 那条消息
  const sendParams: any = {
    chat_id: chatId,
    text: out,
    parse_mode: "HTML",
    message_thread_id: threadId,
  };
  if (replyToMessageId !== undefined) {
    sendParams.reply_to_message_id = replyToMessageId;
  }

  try {
    await TgMessage.sendText(env, sendParams);
  } catch (err) {
    console.error("[emote] 发送 emote 失败，尝试低级接口回退", err);
    // 回退发送也带上 reply_to_message_id（若有）
    try {
      const fallbackParams: any = {
        chat_id: chatId,
        text: out,
        parse_mode: "HTML",
        message_thread_id: threadId
      };
      if (replyToMessageId !== undefined) fallbackParams.reply_to_message_id = replyToMessageId;
      await TgMessage.send(env, "sendMessage", fallbackParams);
    } catch (e) {
      console.error("[emote] 回退发送也失败", e);
    }
  }
}

export default handleEmote;
