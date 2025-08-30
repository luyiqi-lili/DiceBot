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
<blockquote expandable>
 <code>/echo 某个内容 </code> - 让骰娘判断你说的对不对  \n
 <code>/roll </code>- 掷一个 1~100 的随机数  \n
 <code>/roll XdY </code>- 掷 X 个 Y 面骰子，例如 /roll 2d6  \n
 <code>/roll {A B C} </code>- 从多个选项中抽取一个，例如 /roll {红 白 绿}  \n
 <code>/roll Nd{A B C} </code>- 从多个选项中抽取 N 次，例如 /roll 3d{红 白 绿}  \n
 <code>/roll 表达式 </code>- 支持加减法，例如 /roll 2d6+1d4+5  \n
 <code>/r </code>- 简写，等价于 /roll 1d100 \n
 <code>/rdY </code>- 简写，等价于 /roll 1dY    \n
 <code>/rXdY </code>- 简写，等价于 /roll XdY  \n
 <code>/rh </code>- 隐藏掷骰，结果仅发送到私聊  \n
 <code>/duel @目标 赌注内容 </code>- 向某人发起一场赌注决斗！\n
 <code>/groll </code>- 发起一个群骰，支持多人加入 \n
 <code>/book </code>- 查看自己的书签  \n
 <code>/book &lt;关键字&gt; </code>- 回复自己消息并带上备注，添加书签到个人列表  \n
 <code>/book del #序号 </code>- 删除指定序号的书签  \n
 <code>/book @用户名 </code>- 查看指定用户的书签   \n
 <code>/21 </code>- <a href="https://t.me/c/2742074355/345/196400">发起一局多人 21 点游戏 </a> \n
 <code>/news </code>- 直接使用，查看当日爆料列表 ；回复消息时使用）将该条消息爆料进小道消息系统  \n
 <code>/news YYYYMMDD </code>- 查看指定日期的爆料  \n
 <code>/like </code>- 查看你召唤骰娘的次数  \n
 <code>/trans &lt;语言&gt; </code>- 回复消息并翻译到指定语言（默认中文），例如 /trans 日语 \n
 <code>/rose </code>- 回复某人的消息以查看你对他的好感度   \n
 <code>/rose send </code>- 回复某人的消息向他赠送一朵 🌷（每天首次免费，之后需支付 💰） \n
 <code>/fish X </code> - 花费价值X的鱼饵钓鱼 \n
 <code>/coin</code> 查询余额  \n
 <code>/coin pray</code> 今日祈祷 \n
 <code>/coin send 50</code> 回复消息给某人转账 50 💰  \n
 <code>/coin check</code> （管理员查询艾丽莎宝库/用户合计/回复某人查看其余额）\n
 <code>/coin take 100</code> （管理员从艾丽莎宝库取款） \n
 <code>/fate </code>  直接使用，骰娘给你抽取3张塔罗牌 ；在骰娘抽取的塔罗牌消息上回复，花费5💰进行解析 \n

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
      ],
      [
        { text: "/news", switch_inline_query_current_chat: `/news` },
        { text: "/like", switch_inline_query_current_chat: `/like` },
        { text: "/trans", switch_inline_query_current_chat: `/trans English` }
      ],
      [
        { text: "/rose", switch_inline_query_current_chat: `/rose` },
        { text: "/rose send", switch_inline_query_current_chat: `/rose send` },
        { text: "/fish", switch_inline_query_current_chat: `/fish 3` },
      ],
      [
        { text: "/coin ", switch_inline_query_current_chat: `/coin ` },
        { text: "/coin pray", switch_inline_query_current_chat: `/coin pray` },
        { text: "/fate", switch_inline_query_current_chat: `/fate` },
      ], [
        {
          text: "删除消息",
          callback_data: JSON.stringify({ type: "delete_message" })
        }
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
        ], [
          {
            text: "删除消息",
            callback_data: JSON.stringify({ type: "delete_message" })
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
