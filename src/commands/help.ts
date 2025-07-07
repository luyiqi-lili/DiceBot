export function handleHelp(botUsername: string) {
  console.log("📖 返回帮助信息");

  const text = `🤖 <b>可用命令：</b>

/echo &lt;内容&gt; - 让骰娘判断你说的对不对  
/roll - 掷一个 1~100 的随机数  
/roll XdY - 掷 X 个 Y 面骰子，例如 /roll 2d6  
/roll {A B C} - 从多个选项中抽取一个，例如 /roll {红 白 绿}  
/roll Nd{A B C} - 从多个选项中抽取 N 次，例如 /roll 3d{红 白 绿}  
/duel @目标 赌注内容 - 向某人发起一场赌注决斗！
/groll - 发起一个群骰，支持最多 20 人加入

<b>使用方法：</b>  
<i>请先 @${botUsername} 再输入命令！</i>

示例：  
<code>@${botUsername} /echo 我觉得今天要发财</code>  
<code>@${botUsername} /roll 3d10</code>  
<code>@${botUsername} /roll {红 白 绿}</code>  
<code>@${botUsername} /roll 3d{红 白 绿}</code>  
<code>@${botUsername} /duel @对手 一杯奶茶</code>
<code>@${botUsername} /groll</code>`;

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
      ]
    ]
  };

  return {
    text,
    parse_mode: "HTML",
    reply_markup
  };
}
