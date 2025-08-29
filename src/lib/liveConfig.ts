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
