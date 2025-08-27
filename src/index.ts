/* index.ts */

import { handleEcho } from "./commands/echo";
import { handleRoll } from "./commands/roll";
import { handleLike } from "./commands/like";
import { handleTrans } from "./commands/trans";
import { handleRose } from "./commands/rose";
import { handleTopicEdited } from "./commands/topicEditHandler";
import { handleCoin } from "./commands/coin";
import { handleFate } from "./commands/fate";
import { handleFish } from "./commands/fish";
import TgMessage, { ParsedUpdate } from './lib/tgMessage';
import { ALLOWED_CHAT_IDS } from './lib/liveConfig';

export type Env = {
  TOKEN: string;
  BOT_USERNAME: string;
  NEWS_STORE: KVNamespace
};

export default {
  async fetch(request, env) {

    //1. 日记记录原始请求
    console.log("index: 收到请求", {
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers)
    });

    //2. 直接相应非post请求
    if (request.method !== "POST") {
      console.log("index: 非 POST 请求，返回存活内容");
      return new Response("I am alive", { status: 200 });
    }

    //3. 解析请求
    //TODO:  update在全部命令迁移完成后要取消
    let update;
    let parsedMessage;
    try {
      update = await request.json();
      parsedMessage = TgMessage.parseUpdate(update, env.BOT_USERNAME);
      console.log("index: 解析请求 JSON 成功");
    } catch (e) {
      console.error("index: 无法解析 JSON", e);
      return new Response("Bad Request", { status: 400 });
    }

    if (!ALLOWED_CHAT_IDS.has(parsedMessage.chatId)) {
      console.log(`🚫 chatId ${parsedMessage.chatId} 不在允许响应的群组内，跳过处理`);
      return new Response("OK", { status: 200 });
    }

    //4. 分别处理 callback_query 和 message
    console.log("index:parsedMessage.type", parsedMessage.type);
    switch (parsedMessage.type) {

      //4.1 处理 callback_query
      case 'callback_query': {

        const callbackQuery = parsedMessage.callbackQuery;
        const callbackData = parsedMessage.callbackData;

        // 处理回调命令
        // TODO 回调都改成json格式
        // ✅ 新逻辑：JSON 格式 callback
        if (typeof callbackData === "object" && callbackData.type) {
          console.log("index:parsedMessage.callbackData.type", callbackData.type);
          switch (callbackData.type) {
            case "21": {
              // callbackQuery 为 parsedMessage.callbackQuery
              // callbackData 为 解析后的对象，例如 { type: "21", action: "draw" }
              console.log("➡️ 处理 21 点回调", callbackData);
              // 引入新的 handler
              const { handle21Callback } = await import("./commands/21");
              await handle21Callback(parsedMessage.callbackQuery, callbackData, env);
              return new Response("OK", { status: 200 });
            }
            case "duel": {
              // callbackQuery 为 parsedMessage.callbackQuery
              // callbackData 为 解析后的对象，例如 { type: "21", action: "draw" }
              console.log("➡️ 处理 duel 点回调", callbackData);
              // 引入新的 handler
              const { handleDuelCallback } = await import("./commands/duel");
              await handleDuelCallback(parsedMessage.callbackQuery, callbackData, env);
              return new Response("OK", { status: 200 });
            }
            case "groll": {
              // callbackQuery 为 parsedMessage.callbackQuery
              // callbackData 为 解析后的对象，例如 { type: "21", action: "draw" }
              console.log("➡️ 处理 groll回调", callbackData);
              // 引入新的 handler
              const { handleGrollCallback } = await import("./commands/groll");
              await handleGrollCallback(parsedMessage.callbackQuery, callbackData, env);
              return new Response("OK", { status: 200 });
            }

            case "delete_message":
              {
                const chat_id = callbackQuery.message.chat.id;
                const message_id = callbackQuery.message.message_id;

                await TgMessage.deleteMessage(env, chat_id, message_id);
                await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
                  text: "消息已删除",
                  show_alert: true
                });

                // 已处理完成，直接返回
                return new Response("OK", { status: 200 });
              }

            default:
              console.log("ℹ️ 未知 callback type，忽略", callbackData);
              return new Response("OK", { status: 200 });
          }
        }

        // 🔙 老逻辑：保持兼容        
        let payload: any;
        const cq = parsedMessage.callbackQuery;
        if (cq.data?.startsWith("fish_pull:")) {
          payload = await handleFish(cq, env);
        }

        else {
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

      //4.2 处理消息
      //TOOD 后续迁移全部的消息
      case 'message': {

        console.log("main:isCommand", parsedMessage.isCommand);
        if (parsedMessage.isCommand) {

          console.log("main:command", parsedMessage.command);
          switch (parsedMessage.command) {

            case "book": {
              console.log("index: 检测到 /book 命令，进入 book逻辑");
              const { handleBook } = await import("./commands/book");
              await handleBook(parsedMessage, env);
              await TgMessage.deleteMessage(env, parsedMessage.message.chat.id, parsedMessage.message.message_id);
              console.log(`index: /book 处理完成`);
              return new Response("OK", { status: 200 });
            }

            case "help": {
              console.log("index: 检测到 /help 命令，进入 help逻辑");
              const { handleHelp } = await import("./commands/help");
              await handleHelp(parsedMessage, env);
              await TgMessage.deleteMessage(env, parsedMessage.message.chat.id, parsedMessage.message.message_id);
              console.log(`index: /help 处理完成`);
              return new Response("OK", { status: 200 });
            }


            case "like": {
              console.log("index: 检测到 /like 命令，进入 like 逻辑");
              const { handleLike } = await import("./commands/like");
              await handleLike(parsedMessage, env);
              await TgMessage.deleteMessage(env, parsedMessage.message.chat.id, parsedMessage.message.message_id);
              console.log(`index: /like 处理完成`);
              return new Response("OK", { status: 200 });
            }


            case "duel": {
              console.log("index: 检测到 /duel 命令，进入 duel 逻辑");
              const { handleDuel } = await import("./commands/duel");
              await handleDuel(parsedMessage, env);
              await TgMessage.deleteMessage(env, parsedMessage.message.chat.id, parsedMessage.message.message_id);
              console.log(`index: /duel 处理完成`);
              return new Response("OK", { status: 200 });
            }

            case "groll": {
              console.log("index: 检测到 /groll 命令，进入 groll 逻辑");
              const { handleGroll } = await import("./commands/groll");
              await handleGroll(parsedMessage, env);
              await TgMessage.deleteMessage(env, parsedMessage.message.chat.id, parsedMessage.message.message_id);
              console.log(`index: /groll 处理完成`);
              return new Response("OK", { status: 200 });
            }

            case "21": {
              console.log("index: 检测到 /21点 命令，进入 21 逻辑");
              const { handle21 } = await import("./commands/21");
              await handle21(parsedMessage, env);
              await TgMessage.deleteMessage(env, parsedMessage.message.chat.id, parsedMessage.message.message_id);
              console.log(`index: 21处理完成`);
              return new Response("OK", { status: 200 });
            }

            case "news": {
              console.log(`index: 检查到news命令`);
              const { handleNews } = await import("./commands/news");
              await handleNews(parsedMessage, env);
              await TgMessage.deleteMessage(env, parsedMessage.message.chat.id, parsedMessage.message.message_id);
              console.log(`index: news处理完成`);
              return new Response("OK", { status: 200 });
            }
          }
        }
      }
    }


    try {
      const editResponse = await handleTopicEdited(update, env);
      if (editResponse) return editResponse;

    }
    catch (e) {
      console.error(`❌ [callback] ${method} 标题更新失败`, e);

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


    if (!ALLOWED_CHAT_IDS.has(chatId)) {
      console.log(`🚫 chatId ${chatId} 不在允许响应的群组内，跳过处理`);
      return new Response("OK", { status: 200 });
    }
    const threadId =
      msg.message_thread_id
      ?? msg.message?.message_thread_id;

    console.log(`🔍 检查是否包含 @${env.BOT_USERNAME}`);


    if (
      !text.trim().startsWith(`@${env.BOT_USERNAME}`) &&
      !text.trim().startsWith("/r")
    ) {
      console.log("➖ 文本不不是以 @Bot 用户名，或者/r 开头，忽略");
      return new Response("OK", { status: 200 });
    }

    else {

      const userId = msg.from.id;
      const firstName = msg.from.first_name || "";
      const key = `count:${userId}`;
      // 读取原始记录（可能是旧版的纯数字）
      const prev = await env.TGBOTCOUNT.get(key);
      let record;
      if (prev) {
        try {
          // 尝试解析为 JSON
          record = JSON.parse(prev);
          if (typeof record.count !== 'number') {
            // 如果结构不符，退回到旧版数值
            record = { count: parseInt(prev, 10) || 0 };
          }
        } catch (e) {
          // 旧版数据为纯数字字符串
          record = { count: parseInt(prev, 10) || 0 };
        }
      } else {
        record = { count: 0 };
      }
      // 更新记录
      record.count += 1;
      record.firstName = firstName;
      // 写回 KV，使用 JSON 格式
      await env.TGBOTCOUNT.put(key, JSON.stringify(record));


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
    } else if (/^\/rh\b/.test(text)) {
      console.log("🎲 检测到 /rh 命令，进行隐藏掷骰");
      const userName = msg.from?.first_name || "某人";
      const rollResult = handleRoll(text.replace(/^\/rh/, "/roll"), userName);  // 替换为 /roll 处理逻辑

      // 发群组提示（可选）
      await fetch(`https://api.telegram.org/bot${env.TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_thread_id: threadId,
          parse_mode: "HTML",
          text: `🎲 已将掷骰结果发送至 <b>${userName}</b> 的私聊。`
        })
      });

      // 发私聊消息
      await fetch(`https://api.telegram.org/bot${env.TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: msg.from.id,
          parse_mode: "HTML",
          text: `🎲 <b>你的隐藏掷骰结果</b>：\n${rollResult}`
        })
      });

      return new Response("OK", { status: 200 });
    } else if (/\/fate\b/.test(text)) {
      console.log("🔮 检测到 /fate 命令，开始发送媒体组");
      console.log("🔮 检测到 /fate 命令，开始处理 handleFate 返回的 payload");
      try {
        // 1. 调用 handleFate，拿到完整 payload，包括 method 字段
        const payload = await handleFate(msg, env);
        const method = payload.method || 'sendMessage';
        // 2. 删除 method 字段，剩下的就是请求 body
        delete payload.method;
        console.log(`➡️ 调用 Telegram API 方法：${method}`, payload);

        if (threadId) {
          payload.message_thread_id = threadId;
          console.log("📌 [fate] 附加 message_thread_id:", threadId);
        }


        // 3. 根据 method 动态请求
        const apiRes = await fetch(
          `https://api.telegram.org/bot${env.TOKEN}/${method}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          }
        );
        const data = await apiRes.json();
        console.log(`✅ ${method} API 返回`, data);
      } catch (err) {
        console.error("❌ /fate 处理失败", err);
      }
      return new Response("OK", { status: 200 });


    } else if (/\/rose\b/.test(text)) {
      console.log("🎲 检测到 /rose 命令，进入 Rose 逻辑");
      payload = { ...payload, ...(await handleRose(msg, env)) };
    } else if (/\/r/.test(text)) {
      console.log("🎯 检测到 /roll 命令");
      const userName = msg.from?.first_name || "某人";
      payload.text = handleRoll(text, userName);
    } else if (/\/fish\b/.test(text)) {
      payload = { ...payload, ...(await handleFish(msg, env)) };
    }  else if (/\/trans\b/.test(text)) {
      console.log("🌐 检测到 /trans 命令，进入翻译逻辑");
      const res = await handleTrans(msg, env);
      payload.text = res.text;
      if (res.parse_mode) payload.parse_mode = res.parse_mode;
    } else if (/\/coin\b/.test(text)) {
      // 新增 coin 命令
      const res = await handleCoin(msg, env);
      payload = { ...payload, ...res };

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
