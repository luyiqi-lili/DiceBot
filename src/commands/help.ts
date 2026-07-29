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
 <code>/fate</code> — 塔罗占卜（抽3张牌）
 <code>/em</code> / <code>/me</code> / <code>/emote</code> — 动作指令，如 /em 开心地跳了起来
 <code>/duel 赌注</code> — 回复某人发起赌注决斗

<b>📦 物品 & 书签</b>
 <code>/book</code> — 查看书签列表
 <code>/book &lt;备注&gt;</code> — 回复消息添加书签
 <code>/book del #序号</code> — 删除书签
 <code>/item</code> — 查看物品列表
 <code>/item create</code> — 回复消息创建物品

<b>📰 信息</b>
 <code>/news</code> — 查看当日小道消息
 <code>/news YYYYMMDD</code> — 查看指定日期消息
 <code>/check 问题</code> — 查询莉莉当前功能规则
 <code>/status</code> — 查看机器人、存储和 AI 的配置就绪状态（不显示密钥）
 <code>/echo 内容</code> — 掷骰给你的话一个态度评价
 <code>/like</code> — 查看召唤骰娘次数
 <code>/like all</code> — 查看使用排行榜
 <code>/whoami</code> — 查看用户信息（回复查看他人）
 <code>/act start</code> — 开始记录会话
 <code>/act end</code> — 结束记录并生成摘要
 <code>/rule</code> — 查看/设置群组规则
 <code>/top</code> — （管理）最近 7 天主题消息排行

<b>🧬 源码共创与 AI 审核</b>
 <code>/wish 具体需求</code> / <code>/issue 具体需求</code> — 创建公开源码 Issue
 请写清使用场景、期望结果和限制条件（8–2000 字）。Cloudflare 每小时审核尚未标记的 Issue。
 静态检查通过后，Workers AI 会经 AI Gateway 用免费额度复核。AI 判定 <code>risk=low</code> 且置信度 ≥ 85%，并确认 Issue 未被修改后，才自动添加 <code>bot:ready</code>。
 密钥、资金、权限、部署、工作流、数据库迁移和安全类需求不会自动批准；维护者仍可手动添加 <code>bot:ready</code>。机器人不会自动改源码、创建 PR 或合并。
 <a href="https://github.com/luyiqi-lili/DiceBot/issues">查看公开 Issues 与处理进度</a>

<b>🌐 翻译</b>
 回复一条文字后发送 <code>/trans [目标语言]</code> — 通过 AI Gateway 调用 Gemini Flash 翻译，默认译为简体中文；也支持 <code>/trans English 你好，世界</code>
 <code>/quota</code> — 仅私聊：查询自己捐赠 API 的余额或可用性

<b>🔑 安全捐赠 AI Token</b>
 请勿把 Token 发到群聊、Issue 或普通表单。与机器人单独聊天并发送：
 <code>/donatetoken deepseek shared_inference YOUR_TOKEN</code>
 也兼容 <code>/donate_token</code>。机器人必须先删除含 Token 的原消息，才会加密入库；删除失败则拒绝保存。每位用户 24 小时最多捐赠 5 个 Token。
 请求填写 <code>provider</code>、<code>apiKey</code>、<code>usagePolicy</code>，可选 <code>donorLabel</code>；<code>validation_only</code> 只允许验证，<code>shared_inference</code> 才授权机器人用于共享推理。
 运维方仍可使用受保护的 <code>POST /api/donations/api-keys</code>。支持 Gemini、DeepSeek、OpenAI、Anthropic、OpenRouter；平台名称会标准化，Token 经 AES-GCM 加密且不会通过 API 读回。<a href="https://github.com/luyiqi-lili/DiceBot/blob/main/docs/zh-CN/self-evolution-roadmap.md">查看完整说明</a>

<b>💝 Stars / TON 捐赠</b>
 与机器人私聊发送 <code>/donate</code> 打开捐赠菜单；也可使用 <code>/donate stars 25</code> 或 <code>/donate ton 0.5</code>。
 Stars 付款成功后自动记账；TON 会生成专属备注，链上确认上线前保持待核对。支付说明：<code>/terms</code>，支付支持：<code>/paysupport</code>。

<b>🎫 彩票（管理）</b>
 <code>/lottery now</code> — 开奖
 <code>/lottery clean</code> — 清空记录
 <code>/lottery list</code> — 查看购买记录

<b>🛡️ 权限（群主）</b>
 群主自动拥有全部管理命令权限，并可回复某人后授权他人：
 <code>/perm grant &lt;权限名&gt;</code> — 授予其某项管理权限
 <code>/perm revoke &lt;权限名&gt;</code> — 移除该权限
 <code>/perm list</code> — 查看其已获授权
 <code>/perm keys</code> — 查看全部可授予的权限名
 权限名：<code>coin_check</code> 查国库 · <code>coin_take</code> 取款 · <code>coin_create</code> 增发 · <code>coin_remove</code> 扣款 · <code>lottery</code> 彩票管理 · <code>top</code> 主题排行 · <code>all</code> 全部

<b>🧭 主题可用范围（群主）</b>
 部分功能（<code>pray</code> 祈祷 · <code>fate</code> 占卜 · <code>fish</code> 钓鱼）默认仅限特定主题，群主可自定义：
 <code>/topic allow &lt;功能名&gt;</code> — 在“当前主题”内执行，允许该功能
 <code>/topic disallow &lt;功能名&gt;</code> — 取消当前主题的许可
 <code>/topic anywhere &lt;功能名&gt;</code> — 允许在本群所有主题使用
 <code>/topic reset &lt;功能名&gt;</code> — 恢复默认
 <code>/topic list</code> — 查看本群生效配置
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
        { text: "/check", switch_inline_query_current_chat: `/check 每日签到周年庆 50c 的触发逻辑是什么` }
      ],
      [
        { text: "/wish 提需求", switch_inline_query_current_chat: `/wish ` },
        { text: "私聊捐赠", url: "https://t.me/lili_DiceBot" }
      ],
      [
        { text: "/rose", switch_inline_query_current_chat: `/rose` },
        { text: "/rose send", switch_inline_query_current_chat: `/rose send` },
        { text: "/f", switch_inline_query_current_chat: `/f 3` },
        { text: "/f add", switch_inline_query_current_chat: `/f add 🐟新鱼 1` },
        { text: "/f list", switch_inline_query_current_chat: `/f list` },
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
