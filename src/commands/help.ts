import TgMessage, { ParsedUpdate, EnvLike } from "../lib/tgMessage";

/**
 * 重构的 help handler
 * - 直接接收 parsedMessage
 * - 直接使用 TgMessage 发送消息（sendText）
 */
export async function handleHelp(parsedMessage: ParsedUpdate, env: EnvLike) {
  console.log("[help] 处理 help 命令，parsedMessage:", {
    chatId: parsedMessage.chatId,
    threadId: parsedMessage.threadId
  });

  const botUsername = (env && (env as any).BOT_USERNAME);

  const text = `🤖 <b>可用命令：</b>
<blockquote expandable>/echo &lt;内容&gt; - 让骰娘判断你说的对不对  
/roll - 掷一个 1~100 的随机数  
/roll XdY - 掷 X 个 Y 面骰子，例如 /roll 2d6  
/roll {A B C} - 从多个选项中抽取一个，例如 /roll {红 白 绿}  
/roll Nd{A B C} - 从多个选项中抽取 N 次，例如 /roll 3d{红 白 绿}  
/duel @目标 赌注内容 - 向某人发起一场赌注决斗！
/groll - 发起一个群骰，支持最多 20 人加入
/book - 查看自己的书签  
/book &lt;关键字&gt; - 回复自己消息并带上备注，添加书签到个人列表  
/book del #序号 - 删除指定序号的书签  
/book all - 查看本群所有用户的书签  
/book @用户名 - 查看指定用户的书签   
/21 - <a href=\"https://t.me/c/2742074355/345/196400\">发起一局多人 21 点游戏 </a>

<b>使用方法：</b>  
<i>请先 @${botUsername} 再输入命令！</i>

示例：  
<code>@${botUsername} /echo 我觉得今天要发财</code>  
<code>@${botUsername} /roll 3d10</code>  
<code>@${botUsername} /roll {红 白 绿}</code>  
<code>@${botUsername} /roll 3d{红 白 绿}</code>  
<code>@${botUsername} /duel @对手 一杯奶茶</code>
<code>@${botUsername} /groll</code>
<code>@${botUsername} /book</code>  
<code>@${botUsername} /book 阅读笔记</code>  
<code>@${botUsername} /book del #2</code>  
<code>@${botUsername} /book all</code>  
<code>@${botUsername} /book @alice</code>
<code>@${botUsername} /book @12</code>
</blockquote>`;

  const reply_markup = {
    inline_keyboard: [
      [
        { text: "/echo", switch_inline_query_current_chat: `/echo 今天很不错` },
        { text: "/roll", switch_inline_query_current_chat: `/roll` },
        { text: "/roll 2d6", switch_inline_query_current_chat: `/roll 2d6` }
      ],
      [
        { text: "/roll {选项}", switch_inline_query_current_chat: `/roll {红 白 绿}` },
        { text: "/duel", switch_inline_query_current_chat: `/duel @对手 一杯奶茶` },
        { text: "/groll", switch_inline_query_current_chat: `/groll` }
      ],
      [
        { text: "/book", switch_inline_query_current_chat: `/book` },
        { text: "/book del #2", switch_inline_query_current_chat: `/book del #2` },
        { text: "/21", switch_inline_query_current_chat: `/21` }
      ]
    ]
  };

  const chatId = parsedMessage.chatId || parsedMessage.message?.chat?.id;
  if (!chatId) {
    console.error("[help] 无法找到 chatId，无法发送帮助信息");
    return;
  }

  try {
    return await TgMessage.sendText(env, {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup,
      message_thread_id: parsedMessage.threadId
    });
  } catch (err) {
    console.error("[help] 发送帮助信息失败", err);
    throw err;
  }
}


export async function handleDefaultHelp(parsed: ParsedUpdate, env: EnvLike & { BOT_USERNAME?: string }): Promise<void> {
  try {
    if (!parsed || parsed.type !== "message" || !parsed.message) {
      console.log("[defaultHelp] 非 message 或缺少 message，忽略");
      return;
    }

    const chatId = parsed.chatId ?? parsed.message.chat?.id;
    const threadId = parsed.threadId ?? parsed.message.message_thread_id ?? parsed.message?.reply_to_message?.message_thread_id;

    const useText = (parsed.text ?? parsed.message?.text ?? "").toString();
    const botName = (env.BOT_USERNAME || "").toLowerCase();
    const startsWithAtBot = useText.trim().toLowerCase().startsWith(`@${botName}`);
    if (!startsWithAtBot) {
      console.log("➖ 消息未以 @Bot 开头，忽略本次更新");
      return;
    }
    const responses = [
      `呜哇，这个咒语骰娘听不懂欸～是不是念错啦？<i>（歪头）</i> 用 <b>/help</b> 咒语看看都有哪些能用的呢！✨`,
      `诶诶？咒语不在词典里欸，骰娘好困惑！<i>快用</i> /help <i>来检查一下正确咒语吧～</i>🌟`,
      `骰娘耳朵竖起来听咒语了，可是……没听懂耶🥺 是不是写错啦？<b>用 /help 咒语召唤帮助之书！📖</b>`,
      `呀！你的咒语好像失败啦！骰娘感受到一股混沌的魔力呢～不如用 <b>/help</b> 检查一下正确咒语吧🎀`,
      `唔……骰娘尝试解析咒语中……失败了！可能咒语太古老啦～来试试 <b>/help</b>，看看现代用法！🔮`
    ];

    const idx = Math.floor(Math.random() * responses.length);
    const text = responses[idx];

    const reply_markup = {
      inline_keyboard: [
        [
          {
            text: "✨ 查看帮助咒语 ✨",
            // 方便用户把 /help 带到当前对话
            switch_inline_query_current_chat: "/help"
          }
        ]
      ]
    };

    await TgMessage.sendText(env, {
      chat_id: chatId!,
      text,
      parse_mode: "HTML",
      reply_markup,
      message_thread_id: threadId
    });
  } catch (err) {
    console.error("[defaultHelp] 发送默认帮助失败", err);
    // 不进一步抛错
  }
}



export default handleHelp;
