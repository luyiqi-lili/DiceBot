/*
liveConfig.ts
*/
export const ALLOWED_CHAT_IDS = new Set([
  -1002742074355,
  -1002848481881,
  -1002661676227
]);


export const MAJOR_ARCANA = [
  { name: "愚者", file: "https://luyiqi-lili.github.io/pic/0.jpg" },
  { name: "魔术师", file: "https://luyiqi-lili.github.io/pic/1.jpg" },
  { name: "女祭司", file: "https://luyiqi-lili.github.io/pic/2.jpg" },
  { name: "皇后", file: "https://luyiqi-lili.github.io/pic/3.jpg" },
  { name: "皇帝", file: "https://luyiqi-lili.github.io/pic/4.jpg" },
  { name: "教皇", file: "https://luyiqi-lili.github.io/pic/5.jpg" },
  { name: "恋人", file: "https://luyiqi-lili.github.io/pic/6.jpg" },
  { name: "战车", file: "https://luyiqi-lili.github.io/pic/7.jpg" },
  { name: "力量", file: "https://luyiqi-lili.github.io/pic/8.jpg" },
  { name: "隐者", file: "https://luyiqi-lili.github.io/pic/9.jpg" },
  { name: "命运之轮", file: "https://luyiqi-lili.github.io/pic/10.jpg" },
  { name: "正义", file: "https://luyiqi-lili.github.io/pic/11.jpg" },
  { name: "倒吊人", file: "https://luyiqi-lili.github.io/pic/12.jpg" },
  { name: "死亡", file: "https://luyiqi-lili.github.io/pic/13.jpg" },
  { name: "节制", file: "https://luyiqi-lili.github.io/pic/14.jpg" },
  { name: "恶魔", file: "https://luyiqi-lili.github.io/pic/15.jpg" },
  { name: "高塔", file: "https://luyiqi-lili.github.io/pic/16.jpg" },
  { name: "星星", file: "https://luyiqi-lili.github.io/pic/17.jpg" },
  { name: "月亮", file: "https://luyiqi-lili.github.io/pic/18.jpg" },
  { name: "太阳", file: "https://luyiqi-lili.github.io/pic/19.jpg" },
  { name: "审判", file: "https://luyiqi-lili.github.io/pic/20.jpg" },
  { name: "世界", file: "https://luyiqi-lili.github.io/pic/21.jpg" },
  { name: "逆愚者", file: "https://luyiqi-lili.github.io/pic/0d.jpg" },
  { name: "逆魔术师", file: "https://luyiqi-lili.github.io/pic/1d.jpg" },
  { name: "逆女祭司", file: "https://luyiqi-lili.github.io/pic/2d.jpg" },
  { name: "逆皇后", file: "https://luyiqi-lili.github.io/pic/3d.jpg" },
  { name: "逆皇帝", file: "https://luyiqi-lili.github.io/pic/4d.jpg" },
  { name: "逆教皇", file: "https://luyiqi-lili.github.io/pic/5d.jpg" },
  { name: "逆恋人", file: "https://luyiqi-lili.github.io/pic/6d.jpg" },
  { name: "逆战车", file: "https://luyiqi-lili.github.io/pic/7d.jpg" },
  { name: "逆力量", file: "https://luyiqi-lili.github.io/pic/8d.jpg" },
  { name: "逆隐者", file: "https://luyiqi-lili.github.io/pic/9d.jpg" },
  { name: "逆命运之轮", file: "https://luyiqi-lili.github.io/pic/10d.jpg" },
  { name: "逆正义", file: "https://luyiqi-lili.github.io/pic/11d.jpg" },
  { name: "逆倒吊人", file: "https://luyiqi-lili.github.io/pic/12d.jpg" },
  { name: "逆死亡", file: "https://luyiqi-lili.github.io/pic/13d.jpg" },
  { name: "逆节制", file: "https://luyiqi-lili.github.io/pic/14d.jpg" },
  { name: "逆恶魔", file: "https://luyiqi-lili.github.io/pic/15d.jpg" },
  { name: "逆高塔", file: "https://luyiqi-lili.github.io/pic/16d.jpg" },
  { name: "逆星星", file: "https://luyiqi-lili.github.io/pic/17d.jpg" },
  { name: "逆月亮", file: "https://luyiqi-lili.github.io/pic/18d.jpg" },
  { name: "逆太阳", file: "https://luyiqi-lili.github.io/pic/19d.jpg" },
  { name: "逆审判", file: "https://luyiqi-lili.github.io/pic/20d.jpg" },
  { name: "逆世界", file: "https://luyiqi-lili.github.io/pic/21d.jpg" }
];

export const fishList = [
  { name: "🍾破损漂流瓶", hookRate: 0.60, value: 1 },
  { name: "🪵浮木", hookRate: 0.60, value: 1 },
  { name: "👢没用的靴子", hookRate: 0.60, value: 1 },
  { name: "🌿绿海草", hookRate: 0.60, value: 1 },
  { name: "<tg-spoiler>🩸用过的避孕套</tg-spoiler>", hookRate: 0.60, value: 1 },

  { name: "🐚回音海螺", hookRate: 0.40, value: 2 },
  { name: "🦀三钳蟹", hookRate: 0.40, value: 2 },
  { name: "🦐樱花虾", hookRate: 0.40, value: 2 },
  { name: "🌿蓝海草", hookRate: 0.40, value: 2 },
  { name: "🐟沙丁鱼", hookRate: 0.40, value: 2 },
  { name: "<tg-spoiler>🔵跳蛋</tg-spoiler>", hookRate: 0.40, value: 2 },

  { name: "🐡红刺豚", hookRate: 0.35, value: 2 },
  { name: "🐟蓝鳍鱼", hookRate: 0.35, value: 2 },
  { name: "🐠带刺石斑", hookRate: 0.35, value: 2 },
  { name: "🐟石楠花鱼", hookRate: 0.35, value: 2 },
  { name: "🐟穴鱼", hookRate: 0.35, value: 2 },
  { name: "🐡球绒鱼", hookRate: 0.35, value: 2 },
  { name: "🐟芒果鱼", hookRate: 0.35, value: 2 },
  { name: "<tg-spoiler>📿项圈</tg-spoiler>", hookRate: 0.35, value: 2 },

  { name: "🐟弧光鱼", hookRate: 0.30, value: 3 },
  { name: "🐟兔鱼", hookRate: 0.30, value: 3 },
  { name: "🪼夜光水母", hookRate: 0.30, value: 3 },
  { name: "<tg-spoiler>⚡震动棒</tg-spoiler>", hookRate: 0.30, value: 3 },
  { name: "<tg-spoiler>🍆假阳具</tg-spoiler>", hookRate: 0.30, value: 3 },

  { name: "🐟岩崖飞鱼", hookRate: 0.25, value: 5 },
  { name: "<tg-spoiler>🛏️充气娃娃</tg-spoiler>", hookRate: 0.25, value: 5 },
  { name: "🦑毒刺乌贼", hookRate: 0.25, value: 5 },
  { name: "🐝海蜻蜓", hookRate: 0.25, value: 5 },
  { name: "🦭尖牙海豹", hookRate: 0.25, value: 5 },
  { name: "🐟双塔金枪鱼", hookRate: 0.25, value: 5 },
  { name: "🦐猎人巨虾", hookRate: 0.25, value: 5 },
  { name: "🌭深海肉茎", hookRate: 0.25, value: 5 },
  { name: "🪼黏液海触手", hookRate: 0.25, value: 5 },
  { name: "🦑骆驼乌贼", hookRate: 0.25, value: 5 },
  { name: "🪙金币鱼", hookRate: 0.25, value: 5 },
  { name: "🐟巨嘴金鱼", hookRate: 0.25, value: 5 },

  { name: "🐬彩虹海豚", hookRate: 0.20, value: 7 },
  { name: "🌊风暴海鲈", hookRate: 0.20, value: 7 },
  { name: "🌹玫瑰海胆", hookRate: 0.20, value: 7 },
  { name: "🐟冰原鲳", hookRate: 0.20, value: 7 },
  { name: "🪸珊瑚海马", hookRate: 0.20, value: 7 },
  { name: "🛡️骑士鱼", hookRate: 0.20, value: 7 },
  { name: "💖爱心鱼", hookRate: 0.20, value: 7 },
  { name: "🐠阴蒂鱼", hookRate: 0.20, value: 7 },

  { name: "🐉红蛟", hookRate: 0.15, value: 11 },
  { name: "🧬远古海马", hookRate: 0.15, value: 11 },
  { name: "☯️阴阳鱼", hookRate: 0.15, value: 11 },
  { name: "🌺牡丹海参", hookRate: 0.15, value: 11 },
  { name: "🐢银龟", hookRate: 0.15, value: 11 },
  { name: "☀️太阳鲨鱼", hookRate: 0.15, value: 11 },
  { name: "🌋岩浆鳗鱼", hookRate: 0.15, value: 11 },
  { name: "⚡雷电鮟鱇鱼", hookRate: 0.15, value: 11 },
  { name: "🌊潮汐鱼人", hookRate: 0.15, value: 11 },
  { name: "🦑黄金乌贼", hookRate: 0.15, value: 11 },
  { name: "🐋触须鲸", hookRate: 0.15, value: 11 },

  { name: "🦈龙牙鲨", hookRate: 0.10, value: 13 },
  { name: "🐍巨角蟒", hookRate: 0.10, value: 13 },
  { name: "🐱猫鱼", hookRate: 0.10, value: 13 }
];

export type LikeTextEntry = {
  range: [number, number] | "above";
  texts: string[];
};

// 冒险者友情风格：鼓励成长、不显暧昧
export const likeTextMapFriend: LikeTextEntry[] = [
  {
    range: [1, 10],
    texts: [
      "你好，冒险才刚刚开始呢～🌱",
      "刚刚组队，总有点新鲜感对吧？😉",
      "咿呀……是新来的旅人吗？欢迎欢迎～✨",
      "你的名字已经被写入公会名册了哦！继续冒险吧～📜",
      "初次并肩作战，总是令人期待～🔰",
      "你是新同伴对吧？一起变强吧！⚔️"
    ]
  },
  {
    range: [10, 100],
    texts: [
      "我们已经配合得越来越默契啦！🌟",
      "从初阶冒险者变成可靠的伙伴了呢！🛡️",
      "你总是第一个响应召唤的人，好安心～🥰",
      "和你并肩作战的次数已经数不清了！📈",
      "这段旅程因为你变得精彩了许多✨",
      "队友之间的信赖，不需要多说～🔥"
    ]
  },
  {
    range: [100, 1000],
    texts: [
      "你的名字已经传遍了大陆，是王牌冒险者吧！💎",
      "你是我见过最执着的召唤者了呢！🧭",
      "我们像是命运中注定要同行的人～🌌",
      "骰娘已经把你视为最可靠的冒险家了呢🏅",
      "呼唤100次以上……你是传说组合成员！📖",
      "如果要组成固定队，那一定非你莫属！🎖️"
    ]
  },
  {
    range: "above",
    texts: [
      "你已经成为了我的值得信赖的人呢！👑",
      "你的指令我都记得，比系统还可靠呢！🗂️",
      "每一次召唤我都回应，这就是信赖吧～🔔",
      "你是公会中最资深的召唤者，尊敬你！🏛️",
      "这段旅途，因为你坚持，才走得这么远🌍",
      "骰娘一直都在支援你，无论何时何地📡"
    ]
  }
];


export const attitudeResponses = {
  "非常同意": [
    "简直太对了，我现在就想鼓掌！👏",
    "这太棒了，我要在酒馆里大声朗读！🍻",
    "如此高见，冒险者协会已经为您准备好了专属徽章🏅",
    "你的话语像魔导书一样闪闪发光📚✨",
    "这条发言得到了神明的加护💫",
    "你这番话，连圣剑都在共鸣⚔️✨",
    "这段发言，我愿称之为神启📖",
    "我听完立刻原地转职成圣骑士⚜️",
    "我刚才自动施放了赞美魔法🪄",
    "连精灵女王都频频点头🌸"
  ],
  "同意": [
    "我现在就跳个舞庆祝🕺",
    "你这话值一个 +20 灵感🎲",
    "太有道理了，我决定把它写进我的日记📔",
    "我要截图发给我妈，她说我终于交到聪明朋友了📸",
    "这句话一定有 +99 幸运加成🍀",
    "赞同！我都想送你一张旅团推荐信📜",
    "这话我会告诉我在王都的导师👨‍🏫",
    "我同意，我的史莱姆伙伴也点头了🟢",
    "你的逻辑堪比魔法回路般顺畅🔁",
    "感觉你下回能登上冒险者月刊头条📰"
  ],
  "一般": [
    "嗯……也许吧，骰娘先保留意见🤔",
    "这话说得，跟我昨天梦见的一模一样！😴",
    "同意，但只在满月的星期五🌕",
    "有点意思，我差点就信了😂",
    "我同意，但是假设我是茶几🫖",
    "就像哥布林的战术，略显混乱但不无道理🗡️",
    "这说法就像迷宫里的岔路——我需要想一想🧭",
    "或许你是在吟游诗人讲故事的风格里说的🎶",
    "这话听起来像某个 C 级委托的背景设定📄"
  ],
  "不同意": [
    "不同意，我的骰子刚刚都震惊了🎲",
    "听起来像是我隔壁龙族奶奶说的😅",
    "不同意，甚至想报警📞",
    "我试图支持，但大脑发出拒绝信号📵",
    "我请出先知卡片，她摇头了🃏",
    "我的幻兽听完直接逃走了🦄",
    "这话像被低等级诅咒附身了一样奇怪☠️",
    "不太对劲，像史莱姆假扮的人类发言😳",
    "我念了侦测谎言术，结果闪瞎了👁️",
    "甚至触发了我的吐槽技能💢"
  ],
  "非常不同意": [
    "这可能是平行宇宙的说法🚀",
    "我刚摇了一颗 d20，结果是 1，彻底不同意🎲",
    "这想法让我掉了 5 点理智值🧠💥",
    "啊？你再说一遍我都不会同意😤",
    "这就是真正的异世界之声啊！💥",
    "你这是混进魔王军的内奸言论吧🕳️🐍",
    "这话一出，连神殿的神官都晕倒了⛪😵",
    "我的魔力瞬间被抽空🌀",
    "这句发言我已经用封印术保存起来，永不再提🔒",
    "魔王听了都说内行，但我们是人类阵营的❌"
  ]
};


/* ------------------------- payConfigs（保留你的原始内容） ------------------------- */
export interface PayConfig {
  chatId: number;
  threadIds?: number[];
  placeName?: string;
  enabled?: boolean;
  successMessage?: string;
}

export const payConfigs: PayConfig[] = [
  {
    chatId: -1002742074355,
    threadIds: [182],
    placeName: "天狐宫的祈愿箱",
    enabled: true,
    successMessage:
      "${userName}将 ${amount} 💰投入${place}." +
      "<blockquote expandable>铜钱在掌心里带着一丝凉意，双手合握着硬币，轻轻投下。铜钱落下时撞击木格的声响，清脆而短促，细微的回音在殿内回荡，彷佛整座神社都听见了他的愿望，像是把心意托付给神明的回应。"
      + "拉动铃绳，铃铛随着力道震颤，清冽而悠长，声音化作无形的狐鸣，穿梭于屋檐与杉木林间。双手在胸前合十，闭眼低首。两次轻拍掌声回响，像是驱散尘世之音，也像是在召唤守护此地的狐灵。"
      + "心跳与手心的温度，似乎与远处的狐火呼应，燃成一点点无形的光。最后，再次深深鞠躬，感受到自己也被那无形的狐影注视着。临走时，不起眼的小狐灵悄悄的跟了过去守护着。</blockquote>"
      + "${place}现已累积 ${total} 💰。"
  },
  {
    chatId: -1002742074355,
    threadIds: [62],
    placeName: "紫罗兰教堂的募捐箱",
    enabled: true,
    successMessage:
      "${userName}已将 ${amount} 💰投入${place}." +
      "<blockquote expandable>信徒手中握紧了硬币，在胸前虔诚地画下了十字，然后将它们投进了募捐箱中。硬币落于箱底，发出了清脆的声响。信徒合十之后的祈祷，和空气中若有若无的圣歌，相得益彰。烛台的火苗，忽然爆起，发出了噼啪声。"
      + "神像的目光，宽任怜恤，看向了虔敬的信徒。温暖的阳光，穿过了彩色的玻璃窗，聚焦于信徒的头顶，仿佛亮起了一道神明降下的视线，久久不曾离开。"
      + "祈祷声渐歇，光影抖动着、跳跃着。空中似乎浮现出天使之手，撒下了无数的紫罗兰花瓣，在神明的注视下，伴随着信徒坚定的步履，一路飘落，向前。</blockquote>"
      + "${place}现已累积收到 ${total} 💰的捐款。感谢您的善助。"
  },
  {
    chatId: -1002848481881,
    threadIds: [66],
    placeName: "紫罗兰教堂的募捐箱",
    enabled: true,
    successMessage:
      "${userName}已将 ${amount} 💰投入${place}." +
      "<blockquote expandable>信徒手中握紧了硬币，在胸前虔诚地画下了十字，然后将它们投进了募捐箱中。硬币落于箱底，发出了清脆的声响。信徒合十之后的祈祷，和空气中若有若无的圣歌，相得益彰。烛台的火苗，忽然爆起，发出了噼啪声。"
      + "神像的目光，宽任怜恤，看向了虔敬的信徒。温暖的阳光，穿过了彩色的玻璃窗，聚焦于信徒的头顶，仿佛亮起了一道神明降下的视线，久久不曾离开。"
      + "祈祷声渐歇，光影抖动着、跳跃着。空中似乎浮现出天使之手，撒下了无数的紫罗兰花瓣，在神明的注视下，伴随着信徒坚定的步履，一路飘落，向前。</blockquote>"
      + "${place}现已累积收到 ${total} 💰的捐款。感谢您的善助。"
  }
];

export function getCastDesc(strength: number): string {
    function pick(options: string[]): string {
        return options[Math.floor(Math.random() * options.length)];
    }

    switch (true) {
        case (strength <= 15):
            return pick([
                "谨慎地抛出鱼线，水面泛起细微波纹，仿佛在进行一场静谧的祈祷。",
                "轻柔一挥，浮漂安静落下，犹如月光洒在湖面。",
                "动作带着克制，湖水回应以宁静的涟漪。"
            ]);
        case (strength <= 20):
            return pick([
                "渔线描绘出柔和的弧线，如同森林精灵的低语。",
                "鱼线划出轨迹，像是风中写下的咒文。",
                "轻快一掷，水面泛起宛如铃音般的回响。"
            ]);
        case (strength <= 25):
            return pick([
                "动作娴熟，浮漂划破水面，仿佛一枚魔法符文悄然生效。",
                "渔线落水时泛起微光，像是召唤仪式的起始。",
                "投掷干净利落，仿佛战士的利刃出鞘。"
            ]);
        case (strength <= 30):
            return pick([
                "抛出的瞬间带着淡淡光辉，如同勇者试探前方命运。",
                "你的动作带着训练有素的自信，湖面一瞬间屏住了呼吸。",
                "鱼线划破长空，如同吟唱者奏出的第一个音符。"
            ]);
        case (strength <= 35):
            return pick([
                "抛投稳健，水花如星尘散开，湖底传来远古心跳。",
                "水面荡开的涟漪，如同古代神殿的回响。",
                "鱼线触水之际，仿佛有某种灵魂苏醒。"
            ]);
        case (strength <= 40):
            return pick([
                "一记饱含力量的抛竿，激起的水花犹如龙之吐息。",
                "鱼线如雷霆坠落，湖面震颤片刻。",
                "投掷带着战士的豪迈，仿佛宣告挑战的开始。"
            ]);
        case (strength <= 45):
            return pick([
                "鱼线宛如神圣的长矛，刺破空气，带着誓约般的沉重落下。",
                "仿佛是圣殿骑士投掷圣枪，水花溅起神圣光辉。",
                "湖面一震，犹如承诺被镌刻在水之契约中。"
            ]);
        case (strength <= 50):
            return pick([
                "这一抛，似乎刻下了某种契约，湖面浮现短暂的魔法纹路。",
                "水面闪现神秘符号，如同古老的封印被触动。",
                "抛竿带着咒术般的气息，仿佛将命运写入水中。"
            ]);
        case (strength <= 55):
            return pick([
                "力道与心意合一，鱼线划破长空，远处传来不明的共鸣。",
                "渔线飞驰时，空气中闪过一丝灵光。",
                "抛出的动作中带着某种神秘节奏，天地回应。"
            ]);
        case (strength <= 60):
            return pick([
                "如战士投掷长枪，你的抛投撕开湖面，带来令人心悸的涟漪。",
                "那一瞬，水波犹如被巨兽的鳍掀动。",
                "投掷带着杀伐之气，仿佛某种试炼的前兆。"
            ]);
        case (strength <= 65):
            return pick([
                "仿佛是仪式的咏唱，鱼线坠落之处，湖面闪烁奇异光彩。",
                "湖面闪过光晕，犹如女神的轻抚。",
                "这一抛，像是把祭品献给了水之精灵。"
            ]);
        case (strength <= 70):
            return pick([
                "带着风暴之势抛出，空气中回荡着古老吟唱的回声。",
                "鱼线呼啸而去，仿佛狂风中的战歌。",
                "水面激荡，像是远古巨龙在回应。"
            ]);
        case (strength <= 75):
            return pick([
                "动作与天地同调，水面激荡如神明的回应。",
                "渔线坠落时，天地间的元素为之一振。",
                "仿佛自然本身在守望你的抛投。"
            ]);
        case (strength <= 80):
            return pick([
                "鱼线犹如流星坠落，水下的黑影似乎被命运唤醒。",
                "抛出的瞬间，湖面映出星辰的轨迹。",
                "鱼漂划破水面，如同勇者的誓约化作光点。"
            ]);
        case (strength <= 85):
            return pick([
                "抛竿带着破魔之力，水面短暂裂开，如同次元的门扉。",
                "水花四溅，仿佛撕开了世界的帷幕。",
                "那一击如同封印解开，湖底的气息躁动不安。"
            ]);
        case (strength <= 90):
            return pick([
                "宛若勇者施展奥义，湖面骤然静止，仿佛等待宿敌的出现。",
                "空气凝滞，水波一瞬间失去声息。",
                "这一抛，像是宿命的预兆。"
            ]);
        case (strength <= 95):
            return pick([
                "渔线闪烁着光芒坠落，水下传来犹如巨兽苏醒的低鸣。",
                "你感到湖水的深处，有某种庞然大物在注视。",
                "水面泛起漩涡，仿佛传来远古的召唤。"
            ]);
        case (strength <= 100):
            return pick([
                "你的抛投撕裂空气，湖面震颤，天地间似乎响起战鼓。",
                "渔线甩出的一瞬，风声像号角般响起。",
                "抛竿之际，仿佛点燃了整个湖心的战意。"
            ]);
        case (strength <= 105):
            return pick([
                "这一击超越凡人极限，抛竿之处迸发圣光，湖心泛起旋涡。",
                "你感受到某种神圣力量附着其上，仿佛神明在注视。",
                "水面瞬间分开，仿佛世界迎来了审判。"
            ]);
        case (strength <= 110):
            return pick([
                "以超凡之力抛出渔线，仿佛向世界宣告——命运的战役已然开始！",
                "那一瞬，天地回响，湖泊化为神话的舞台。",
                "抛投撕裂长空，像是勇者与世界立下的誓约。"
            ]);
        default:
            return "渔线飞出常理之外，天地为之震颤。";
    }
}
