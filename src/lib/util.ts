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

  export function stripHtml(html: string): string {
  if (!html) return '';

  // 先移除 script/style 内容，防止里面的 < > 被误判为文本
  let s = html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '');

  // 再移除所有标签
  s = s.replace(/<\/?[^>]+(>|$)/g, '');

  // 解码常见 HTML 实体（包括十进制/十六进制数值实体）
  s = decodeHtmlEntities(s);

  return s;
}

function decodeHtmlEntities(str: string): string {
  if (!str) return '';

  return str.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    // numeric entity - decimal
    if (entity.startsWith('#')) {
      if (entity.startsWith('#x') || entity.startsWith('#X')) {
        const code = parseInt(entity.slice(2), 16);
        return isNaN(code) ? match : String.fromCodePoint(code);
      } else {
        const code = parseInt(entity.slice(1), 10);
        return isNaN(code) ? match : String.fromCodePoint(code);
      }
    }

    // named entities - 扩展此映射以支持更多实体
    const map: Record<string, string> = {
      lt: '<',
      gt: '>',
      amp: '&',
      quot: '"',
      apos: "'",
      nbsp: '\u00A0'
    };

    return map[entity] ?? match; // 未知实体保留原样
  });
}
