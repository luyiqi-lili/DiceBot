/*
liveConfig.ts
*/

import TgMessage from "./tgMessage";

export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}


export const deleteMarkup = TgMessage.buildInlineKeyboard([
    [
      {
        text: "删除消息",
        callback_data: JSON.stringify({ type: "delete_message" })
      }
    ]
  ]);