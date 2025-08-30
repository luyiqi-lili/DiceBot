/* index.ts */


import TgMessage from './lib/tgMessage';
import { ALLOWED_CHAT_IDS } from './lib/liveConfig';
import { incrementUsageCount } from "./commands/like";

export type Env = {
  TOKEN: string;
  BOT_USERNAME: string;
  NEWS_STORE: KVNamespace
  TOPIC_KV: KVNamespace
  COIN_KV: KVNamespace
  BOOK_STORE: KVNamespace
  FISHING_RECORD_KV: KVNamespace
  TGBOTCOUNT: KVNamespace
  AFFECTION_KV: KVNamespace
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
    let parsedMessage;
    try {
      parsedMessage = TgMessage.parseUpdate(await request.json(), env.BOT_USERNAME);
      console.log("index: 解析请求 JSON 成功");
    } catch (e) {
      console.error("index: 无法解析 JSON", e);
      return new Response("Bad Request", { status: 400 });
    }

    // 4.白名单群组检查
    if (!ALLOWED_CHAT_IDS.has(parsedMessage.chatId)) {
      console.log(`🚫 chatId ${parsedMessage.chatId} 不在允许响应的群组内，跳过处理`);
      return new Response("OK", { status: 200 });
    }

    //5. 分别处理 callback_query 和 message 和 topic_edited
    console.log("index:parsedMessage.type", parsedMessage.type);
    
    switch (parsedMessage.type) {
      //5.1 处理房间修改
      case 'topic_edited': {
        console.log("index: 检测到 topic_edited，尝试处理话题标题编辑");
        try {
          const { handleTopicEdited } = await import("./commands/topicEditHandler");
          const editResponse = await handleTopicEdited(parsedMessage, env);
          if (editResponse) {
            return editResponse; // 如果 handler 返回 Response（按需），则直接返回
          }
        } catch (e) {
          console.error("❌ handleTopicEdited(topic_edited) 失败", e);
        }
        // 如果没有被 handleTopicEdited 消化，继续不做其它处理（返回 OK）
        return new Response("OK", { status: 200 });
      }

      //5.2 处理 callback_query
      case 'callback_query': {

        const callbackQuery = parsedMessage.callbackQuery;
        console.log("index:parsedMessage.callbackQuery", callbackQuery);
        const callbackData = parsedMessage.callbackData;
        console.log("index:parsedMessage.callbackData", callbackData);
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
            case "fish": {
              // callbackQuery 为 parsedMessage.callbackQuery
              // callbackData 为 解析后的对象，例如 { type: "21", action: "draw" }
              console.log("➡️ 处理 fish 点回调", callbackData);
              // 引入新的 handler
              const { handleFishCallback } = await import("./commands/fish");
              await handleFishCallback(parsedMessage.callbackQuery, callbackData, env);
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
      }

      //5.3 处理消息
      case 'message': {

        console.log("main:isCommand", parsedMessage.isCommand);
        if (parsedMessage.isCommand) {

          //5.3.0 首先添加用户调用计数
          console.log("main:command", parsedMessage.command);
          await incrementUsageCount(parsedMessage, env);

          switch (parsedMessage.command) {
            //书签
            case "book": {
              console.log("index: 检测到 /book 命令，进入 book逻辑");
              const { handleBook } = await import("./commands/book");
              await handleBook(parsedMessage, env);
              await TgMessage.deleteMessage(env, parsedMessage.message.chat.id, parsedMessage.message.message_id);
              console.log(`index: /book 处理完成`);
              return new Response("OK", { status: 200 });
            }
            //UID查询 
            case "whoami": {
              console.log("index: 检测到 / whoami 命令，进入 whoami 逻辑");
              const { handleWhoami } = await import("./commands/whoami");
              await handleWhoami(parsedMessage, env);
              await TgMessage.deleteMessage(env, parsedMessage.message.chat.id, parsedMessage.message.message_id);
              console.log(`index: / whoami 处理完成`);
              return new Response("OK", { status: 200 });
            }
            //抽卡
            case "fate": {
              console.log("index: 检测到 /fate 命令，进入 fate逻辑");
              const { handleFate } = await import("./commands/fate");
              await handleFate(parsedMessage, env);
              await TgMessage.deleteMessage(env, parsedMessage.message.chat.id, parsedMessage.message.message_id);
              console.log(`index: /fate 处理完成`);
              return new Response("OK", { status: 200 });
            }
            //送花
            case "rose": {
              console.log("index: 检测到 /rose 命令，进入 rose逻辑");
              const { handleRose } = await import("./commands/rose");
              await handleRose(parsedMessage, env);
              await TgMessage.deleteMessage(env, parsedMessage.message.chat.id, parsedMessage.message.message_id);
              console.log(`index: /rose 处理完成`);
              return new Response("OK", { status: 200 });
            }
            //骰点
            case "roll":
            case "r":
            case "rd":
            case "rh": {
              console.log("index: 检测到 /roll 命令，进入 roll逻辑");
              const { handleRoll } = await import("./commands/roll");
              await handleRoll(parsedMessage, env);
              await TgMessage.deleteMessage(env, parsedMessage.message.chat.id, parsedMessage.message.message_id);
              console.log(`index: /roll 处理完成`);
              return new Response("OK", { status: 200 });
            }
            //帮助
            case "help": {
              console.log("index: 检测到 /help 命令，进入 help逻辑");
              const { handleHelp } = await import("./commands/help");
              await handleHelp(parsedMessage, env);
              await TgMessage.deleteMessage(env, parsedMessage.message.chat.id, parsedMessage.message.message_id);
              console.log(`index: /help 处理完成`);
              return new Response("OK", { status: 200 });
            }
            //钓鱼
            case "fish": {
              console.log("index: 检测到 /fish 命令，进入 fish 逻辑");
              const { handleFish } = await import("./commands/fish");
              await handleFish(parsedMessage, env);
              await TgMessage.deleteMessage(env, parsedMessage.message.chat.id, parsedMessage.message.message_id);
              console.log(`index: /fish 处理完成`);
              return new Response("OK", { status: 200 });
            }
            //货币
            case "coin": {
              console.log("index: 检测到 /coin 命令，进入 coin逻辑");
              const { handleCoin } = await import("./commands/coin");
              await handleCoin(parsedMessage, env);
              await TgMessage.deleteMessage(env, parsedMessage.message.chat.id, parsedMessage.message.message_id);
              console.log(`index: /coin 处理完成`);
              return new Response("OK", { status: 200 });
            }
            //翻译
            case "trans": {
              console.log("index: 检测到 /trans 命令，进入 trans逻辑");
              const { handleTrans } = await import("./commands/trans");
              await handleTrans(parsedMessage, env);
              await TgMessage.deleteMessage(env, parsedMessage.message.chat.id, parsedMessage.message.message_id);
              console.log(`index: /trans 处理完成`);
              return new Response("OK", { status: 200 });
            }
            //回声
            case "echo": {
              console.log("index: 检测到 /echo 命令，进入 echo逻辑");
              const { handleEcho } = await import("./commands/echo");
              await handleEcho(parsedMessage, env);
              await TgMessage.deleteMessage(env, parsedMessage.message.chat.id, parsedMessage.message.message_id);
              console.log(`index: /echo 处理完成`);
              return new Response("OK", { status: 200 });
            }
            //调用次数查询
            case "like": {
              console.log("index: 检测到 /like 命令，进入 like 逻辑");
              const { handleLike } = await import("./commands/like");
              await handleLike(parsedMessage, env);
              await TgMessage.deleteMessage(env, parsedMessage.message.chat.id, parsedMessage.message.message_id);
              console.log(`index: /like 处理完成`);
              return new Response("OK", { status: 200 });
            }
            //决斗
            case "duel": {
              console.log("index: 检测到 /duel 命令，进入 duel 逻辑");
              const { handleDuel } = await import("./commands/duel");
              await handleDuel(parsedMessage, env);
              await TgMessage.deleteMessage(env, parsedMessage.message.chat.id, parsedMessage.message.message_id);
              console.log(`index: /duel 处理完成`);
              return new Response("OK", { status: 200 });
            }
            // groll
            case "groll": {
              console.log("index: 检测到 /groll 命令，进入 groll 逻辑");
              const { handleGroll } = await import("./commands/groll");
              await handleGroll(parsedMessage, env);
              await TgMessage.deleteMessage(env, parsedMessage.message.chat.id, parsedMessage.message.message_id);
              console.log(`index: /groll 处理完成`);
              return new Response("OK", { status: 200 });
            }
            // 21点游戏
            case "21": {
              console.log("index: 检测到 /21点 命令，进入 21 逻辑");
              const { handle21 } = await import("./commands/21");
              await handle21(parsedMessage, env);
              await TgMessage.deleteMessage(env, parsedMessage.message.chat.id, parsedMessage.message.message_id);
              console.log(`index: 21处理完成`);
              return new Response("OK", { status: 200 });
            }
            // 新闻
            case "news": {
              console.log(`index: 检查到news命令`);
              const { handleNews } = await import("./commands/news");
              await handleNews(parsedMessage, env);
              await TgMessage.deleteMessage(env, parsedMessage.message.chat.id, parsedMessage.message.message_id);
              console.log(`index: news处理完成`);
              return new Response("OK", { status: 200 });
            }
            // 默认提示
            default: {
              
              console.log("index: 未知命令，发送默认帮助提示");
              const { handleDefaultHelp } = await import("./commands/help");
              await handleDefaultHelp(parsedMessage, env);
              try {
 //               await TgMessage.deleteMessage(env, parsedMessage.message.chat.id, parsedMessage.message.message_id);
              } catch (e) {
                console.warn("index: 删除触发命令消息失败（可忽略）", e);
              }

              return new Response("OK", { status: 200 });
            }

          }
        }
      }
    }

    return new Response("OK", { status: 200 });
  }
} satisfies ExportedHandler<Env>;
