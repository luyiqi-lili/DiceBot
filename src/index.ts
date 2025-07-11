import { handleEcho } from "./commands/echo";
import { handleRoll } from "./commands/roll";
import { handleGroll } from "./commands/groll";
import { handleHelp } from "./commands/help";
import { handleDuel } from "./commands/duel";
import { handleLike } from "./commands/like";
import { handleNews } from "./commands/news";
import { handleBook } from "./commands/book";


export default {
  async fetch(request, env) {
    console.log("📥 收到请求", {
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers)
    });

    if (request.method !== "POST") {
      console.log("➡️ 非 POST 请求，返回存活内容");
      return new Response("I am alive", { status: 200 });
    }

    let update;
    try {
      update = await request.json();
      console.log("✅ 解析请求 JSON 成功", update);
    } catch (e) {
      console.error("❌ 无法解析 JSON", e);
      return new Response("Bad Request", { status: 400 });
    }

    if (update.callback_query) {
      const cq = update.callback_query;

      // ① 先回答 callback_query，去掉客户端的加载状态
      await fetch(
        `https://api.telegram.org/bot${env.TOKEN}/answerCallbackQuery`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callback_query_id: cq.id,
            // 不显示任何提示：
            show_alert: false
          })
        }
      );

      // ② 再处理回调命令
      let payload: any;
      if (cq.data.startsWith("duel_accept") || /\/duel\b/.test(cq.message.text || "")) {
        payload = handleDuel(cq, env);
        console.log("➡️ [callback] handleDuel 返回 payload:", payload);
      } else if (
        cq.data.startsWith("groll_accept") ||
        cq.data.startsWith("groll_end")) {
        payload = handleGroll(cq, env);
        console.log("➡️ [callback] handleGroll 返回 payload:", payload);
      } else {
        console.log("ℹ️ 未知 callback_data，忽略");
        return new Response("OK", { status: 200 });
      }

      const method = payload.method || "sendMessage";
      delete payload.method;
      console.log(`➡️ [callback] 准备调用 ${method} 接口`, payload);
      try {
        const apiRes = await fetch(
          `https://api.telegram.org/bot${env.TOKEN}/${method}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          }
        );
        const json = await apiRes.json();
        console.log(`✅ [callback] ${method} API 成功`, json);
      } catch (e) {
        console.error(`❌ [callback] ${method} API 调用失败`, e);
      }

      return new Response("OK", { status: 200 });
    }


    const msg = update.message ?? update.channel_post;
    if (!msg) {
      console.log("➖ 无 message 或 channel_post，忽略本次更新");
      return new Response("OK", { status: 200 });
    }

    const text = msg.text;
    if (!text) {
      console.log("➖ 消息中无 text 字段，忽略");
      return new Response("OK", { status: 200 });
    }

    const chatId =
      // 如果是普通消息，就用 msg.chat.id
      msg.chat?.id
      // 如果是回调，就退而求其次用 msg.message.chat.id
      ?? msg.message.chat.id;
    // ✅ 只允许在指定群组中响应
    const ALLOWED_CHAT_IDS = new Set([
      -1002742074355,
      -1002848481881
    ]);

    if (!ALLOWED_CHAT_IDS.has(chatId)) {
      console.log(`🚫 chatId ${chatId} 不在允许响应的群组内，跳过处理`);
      return new Response("OK", { status: 200 });
    }
    const threadId =
      msg.message_thread_id
      ?? msg.message?.message_thread_id;

    console.log(`🔍 检查是否包含 @${env.BOT_USERNAME}`);
    if (!text.includes(`@${env.BOT_USERNAME}`)) {
      console.log("➖ 文本未包含 Bot 用户名，忽略");
      return new Response("OK", { status: 200 });
    }

    if (text.includes(`@${env.BOT_USERNAME}`)) {
      const userId = msg.from.id;
      const key = `count:${userId}`;
      // 从 KV 读旧值（字符串），转换数字
      const prev = await env.TGBOTCOUNT.get(key);
      const oldCount = parseInt(prev || "0", 10);
      const newCount = oldCount + 1;
      // 写回 KV
      await env.TGBOTCOUNT.put(key, newCount.toString());
    }

    console.log("➡️ 将处理文本 =", text);

    let payload: any = {
      chat_id: chatId,
      parse_mode: "HTML"
    };

    if (threadId) {
      payload.message_thread_id = threadId;
      console.log("📌 附加 message_thread_id 到响应消息");
    }

    if (/\/echo\b/.test(text)) {
      console.log("📢 检测到 /echo 命令");
      const userName = msg.from?.first_name || "某人";
      payload.text = handleEcho(text, userName);
    } else if (/\/roll\b/.test(text)) {
      console.log("🎯 检测到 /roll 命令");
      const userName = msg.from?.first_name || "某人";
      payload.text = handleRoll(text, userName);
    } else if (/\/groll\b/.test(text)) {
      console.log("🎲 检测到 /groll 命令，进入 Groll 逻辑");
      payload = { ...payload, ...handleGroll(msg, env) };
    } else if (/\/duel\b/.test(text)) {
      console.log("⚔️ 检测到 /duel 命令，进入决斗逻辑");
      payload = { ...payload, ...handleDuel(msg, env) };
    } else if (/\/like\b/.test(text)) {
      // 调用我们在下一步定义的 handleLike
      const res = await handleLike(msg, env);
      payload.text = res.text;
      if (res.reply_markup) payload.reply_markup = res.reply_markup;
    } else if (/\/help\b/.test(text)) {
      console.log("ℹ️ 检测到 /help 命令，返回完整帮助信息");
      const helpResponse = handleHelp(env.BOT_USERNAME);
      payload.text = helpResponse.text;
      payload.parse_mode = helpResponse.parse_mode;
      payload.reply_markup = helpResponse.reply_markup;
    } else if (/\/news\b/.test(text)) {
      console.log("📰 检测到 /news 命令，进入新闻逻辑");
      const res = await handleNews(msg, env);
      payload.text = res.text;
      if (res.parse_mode) payload.parse_mode = res.parse_mode;
      if (res.reply_markup) payload.reply_markup = res.reply_markup;
    }  else if (/\/book\b/.test(text)) {
      console.log("📰 检测到 /book 命令，进入书签逻辑");
      const res = await handleBook(msg, env);
      payload.text = res.text;
      if (res.parse_mode) payload.parse_mode = res.parse_mode;
      if (res.reply_markup) payload.reply_markup = res.reply_markup;
    } else if (/\/whoami\b/.test(text)) {
      console.log("🆔 检测到 /whoami 命令");

      // 用户基本信息
      const userId = msg.from.id;
      const userName = msg.from.first_name || "";

      // 群组信息
      const chatId = msg.chat.id;
      const chatTitle = msg.chat.title || "(无群名)";

      // 主题 / 线程 信息（Telegram 论坛群组专用）
      // message_thread_id 在普通群里通常是 undefined
      const threadId =
        msg.message_thread_id
        ?? msg.message?.message_thread_id;

      // 构造输出文本
      let replyText = `你的用户 ID：<code>${userId}</code>\n` +
        `你的用户名：<code>${userName}</code>\n` +
        `群组 ID：<code>${chatId}</code>\n` +
        `群组名称：<code>${chatTitle}</code>\n`;

      if (threadId) {
        replyText += `主题 ID：<code>${threadId}</code>\n`;
      }

      payload.text = replyText;
      payload.parse_mode = "HTML";

    }
    else {
      // 未识别命令 —— 提示用户输入 /help 查询
      const responses = [
        "呜哇，这个咒语骰娘听不懂欸～是不是念错啦？<i>（歪头）</i> 用 <b>/help</b> 咒语看看都有哪些能用的呢！✨",
        "诶诶？咒语不在词典里欸，骰娘好困惑！<i>快用</i> /help <i>来检查一下正确咒语吧～</i>🌟",
        "骰娘耳朵竖起来听咒语了，可是……没听懂耶🥺 是不是写错啦？<b>用 /help 咒语召唤帮助之书！📖</b>",
        "呀！你的咒语好像失败啦！骰娘感受到一股混沌的魔力呢～不如用 <b>/help</b> 检查一下正确咒语吧🎀",
        "唔……骰娘尝试解析咒语中……失败了！可能咒语太古老啦～来试试 <b>/help</b>，看看现代用法！🔮"
      ];

      const randomIndex = Math.floor(Math.random() * responses.length);
      payload.text = responses[randomIndex];
      payload.parse_mode = "HTML";
      payload.reply_markup = {
        inline_keyboard: [
          [
            {
              text: "✨ 查看帮助咒语 ✨",
              switch_inline_query_current_chat: "/help"
            }
          ]
        ]
      };
    }


    try {
      const apiRes = await fetch(
        `https://api.telegram.org/bot${env.TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      const json = await apiRes.json();
      console.log("✅ sendMessage API 成功", json);
    } catch (e) {
      console.error("❌ sendMessage API 调用失败", e);
    }

    return new Response("OK", { status: 200 });
  }
} satisfies ExportedHandler<Env>;
