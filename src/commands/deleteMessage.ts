import type { Env } from "../index";

/** callback_query -> 删除消息 处理器 */
export async function handleDeleteMessage(cq: any, env: Env) {
  const chatId = cq.message.chat.id;
  const messageId = cq.message.message_id;
  // 调用 deleteMessage API
  await fetch(`https://api.telegram.org/bot${env.TOKEN}/deleteMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId })
  });
  // 返回 answerCallbackQuery，移除按钮加载状态并提示
  return {
    method: "answerCallbackQuery",
    callback_query_id: cq.id,
    text: "消息已删除",
    show_alert: false
  };
}