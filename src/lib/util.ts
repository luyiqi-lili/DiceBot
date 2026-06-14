/**
 * @file src/lib/util.ts
 * @description 通用工具函数集：
 *   - escapeHtml: HTML 转义
 *   - stripHtml / decodeHtmlEntities: HTML 清理与实体解码
 *   - deleteMarkup: 通用的"删除消息"内联键盘按钮
 */

/** 转义 HTML 特殊字符（& < > " '），防止 XSS 或 Telegram HTML 解析错误 */
export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}


/** 通用的"删除消息"内联键盘按钮，可在任意回复消息中附加使用 */
export const deleteMarkup = {
    inline_keyboard: [
      [
        {
          text: "删除消息",
          callback_data: JSON.stringify({ type: "delete_message" })
        }
      ]
    ]
  };

  /**
   * 去除 HTML 标签并解码 HTML 实体，返回纯文本。
   * 先移除 <script>/<style> 内容避免其中的 < > 被误判，再移除所有标签，最后解码实体。
   */
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

/** 解码 HTML 实体（命名实体和十进制/十六进制数值实体） */
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
