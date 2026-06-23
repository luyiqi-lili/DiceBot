import TgMessage, { ParsedUpdate, EnvLike } from '../lib/telegram';

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
<blockquote expandable><b>🎲 掷骰</b>
 <code>/roll</code> / <code>/r</code> / <code>/rdY</code> — 掷骰，支持 XdY / {选项} / 表达式
 <code>/rh</code> — 隐藏掷骰，结果私聊发送
 <code>/groll</code> — 发起群骰，多人加入一起 roll
 <code>/21</code> — <a href="https://t.me/c/2742074355/345/196400">发起多人 21 点游戏</a>

<b>💰 货币</b>
 <code>/coin</code> — 查询余额
 <code>/coin pray</code> — 今日祈祷领钱
 <code>/coin send 50</code> — 回复消息转账
 <code>/coin check</code> — （管理）查询国库
 <code>/coin take 100</code> — （管理）国库取款
 <code>/lottery</code> — 彩票系统
 <code>/lottery buy</code> — 购买彩票
 <code>/congrats</code> / <code>/恭喜发财</code> — 回复他人发红包
 <code>/rose</code> — 回复某人查看好感度
 <code>/rose send</code> — 回复某人送花 🌷

<b>🎣 娱乐</b>
 <code>/f X</code> — 花费 X 鱼饵钓鱼
 <code>/f check</code> — 查看今日钓鱼情况
 <code>/f add 名称 价值</code> — 花费 10c 添加鱼（价值 1-13）
 <code>/f list</code> / <code>/f remove 序号</code> — 管理鱼种（管理员）
 <code>/wish 想法</code> — 提交功能愿望
 <code>/fate</code> — 塔罗占卜（抽3张牌）
 <code>/em</code> / <code>/me</code> / <code>/emote</code> — 动作指令，如 /em 开心地跳了起来
 <code>/duel 赌注</code> — 回复某人发起赌注决斗

<b>📦 物品 & 书签</b>
 <code>/book</code> — 查看书签列表
 <code>/book &lt;备注&gt;</code> — 回复消息添加书签
 <code>/book del #序号</code> — 删除书签
 <code>/item</code> — 查看物品列表
 <code>/item create</code> — 回复消息创建物品

<b>📰 信息 & 翻译</b>
 <code>/news</code> — 查看当日小道消息
 <code>/news YYYYMMDD</code> — 查看指定日期消息
 <code>/trans 日语</code> — 回复消息翻译（默认简体中文）
 <code>/ask</code> — 回复消息，评论内容真假和合理性
 <code>/echo 内容</code> — 让骰娘评判你的话
 <code>/like</code> — 查看召唤骰娘次数
 <code>/like all</code> — 查看使用排行榜
 <code>/whoami</code> — 查看用户信息（回复查看他人）
 <code>/act start</code> — 开始记录会话
 <code>/act end</code> — 结束记录并生成摘要
 <code>/report</code> — AI 生成昨日群聊汇报
 <code>/rule</code> — 查看/设置群组规则

<b>🎫 彩票（管理）</b>
 <code>/lottery now</code> — 开奖
 <code>/lottery clean</code> — 清空记录
 <code>/lottery list</code> — 查看购买记录
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
        { text: "/duel", switch_inline_query_current_chat: `/duel 一杯奶茶` },
        { text: "/groll", switch_inline_query_current_chat: `/groll` }
      ],
      [
        { text: "/book", switch_inline_query_current_chat: `/book` },
        { text: "/book del #2", switch_inline_query_current_chat: `/book del #2` },
        { text: "/21", switch_inline_query_current_chat: `/21` }
      ],
      [
        { text: "/news", switch_inline_query_current_chat: `/news` },
        { text: "/trans", switch_inline_query_current_chat: `/trans English` },
        { text: "/ask", switch_inline_query_current_chat: `/ask` }
      ],
      [
        { text: "/rose", switch_inline_query_current_chat: `/rose` },
        { text: "/rose send", switch_inline_query_current_chat: `/rose send` },
        { text: "/f", switch_inline_query_current_chat: `/f 3` },
        { text: "/f add", switch_inline_query_current_chat: `/f add 🐟新鱼 1` },
        { text: "/f list", switch_inline_query_current_chat: `/f list` },
        { text: "/wish", switch_inline_query_current_chat: `/wish ` },
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
