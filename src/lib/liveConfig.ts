/**
 * @file src/lib/liveConfig.ts
 * @description 运行时配置与静态数据。
 *   包含：群组白名单、塔罗牌数据、态度回应文本、好感度分级、钓鱼配置、付费配置等。
 *   此文件无运行时副作用，仅导出常量/配置项供其他模块使用。
 */
export const ALLOWED_CHAT_IDS = new Set([
  -1002742074355,
  -1002848481881,
  -1002661676227,
  -1002796780505,
  -1002970430696,
  -1003580231284,
  0
]);

export const deleteUids: number[] = [
  //  8080375150, // 需要删除消息的用户 ID 1
  //  6839700093, 小皮
  //  987654321, // 需要删除消息的用户 ID 2
  // 添加更多 UID
];

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
  { name: "<a href=\"tg://user?id=8445100282\" >🍾破损漂流瓶</a>", hookRate: 0.40, value: 0 },
  { name: "<a href=\"tg://user?id=8445100282\" >🪵浮木</a>", hookRate: 0.40, value: 0 },
  { name: "<a href=\"tg://user?id=8445100282\" >👢没用的靴子", hookRate: 0.40, value: 0 },
  { name: "<a href=\"tg://user?id=8445100282\" >🌿绿海草</a>", hookRate: 0.40, value: 0 },
  { name: "<a href=\"tg://user?id=8445100282\" ><tg-spoiler>🩸用过的避孕套</tg-spoiler></a>", hookRate: 0.60, value: 0 },
  { name: "<a href=\"tg://user?id=8445100282\" >🍇海葡萄</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🌙月牙石</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >⭐星星贝壳</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🪸红珊瑚</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🪱泥虫</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🦐沙虾</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🪼红骨水母</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🌊滩海蜇</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐟沙丘鱼</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐠浪花鱼</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐚红蛏子</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐌军舰海螺</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >⚔️战斧海马</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐍海蛇</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐡鸟嘴鱼</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🎣小嘴海鲈</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐟红衫鱼</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🦐眼镜虾</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🫠咸鱼</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🌀钻头贝</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >👑鲤鱼王</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐟大鱼</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐟变异鱼</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🦑黑口鱼</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐠美味小鱼</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐡长嘴泥鳅</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐟彩鳍鱼</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐠鼠尾鱼</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐟滑皮鲭鱼</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🍟薯条</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🧵浸湿的丝线</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >💧水</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >💵两Coin</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >😋杂鱼</a>", hookRate: 0.40, value: 1 },


  { name: "<a href=\"tg://user?id=8445100282\" >🐭鼠鼠</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐒海猴</a>", hookRate: 0.40, value: 1 },
  { name: "<a href=\"tg://user?id=8445100282\" >🕸钓鱼佬绝不空军</a>", hookRate: 0.40, value: 1 },


  { name: "<a href=\"tg://user?id=8445100282\" >🍜“何意味”泡面</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐒海猴</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🦐虾头</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🍤炸虾</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >👙小七的胖次</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐚回音海螺</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🦀三钳蟹</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🦐樱花虾</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🌿蓝海草</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐟沙丁鱼</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" ><tg-spoiler>🔵跳蛋</tg-spoiler></a>", hookRate: 0.40, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐡红刺豚</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐟蓝鳍鱼</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐠带刺石斑</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐟石楠花鱼</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐟穴鱼</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐡球绒鱼</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐟芒果鱼</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" ><tg-spoiler>📿项圈</tg-spoiler></a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🍲红烧鱼(生)</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🥢清蒸鱼(生)</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🌶麻辣鱼(生)</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🌟星鱼</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🌀漩涡鱼</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🪼浅滩水母</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >💥爆炸河豚</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🍣鲑鱼</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🦀潮汐蟹</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🎈泡泡鱼</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐟咸水鲤鱼</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🥘西湖醋鱼</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >👻隐身鱼</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >⭐杨桃鱼</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🔷六角鲤鱼</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🦐鹰虾</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐟大马哈鱼</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🦂海蠍子</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐂海公牛</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🔥火鳞鳝鱼</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐡刺须鲶鱼</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐠大鼠尾鱼</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐟银头鲑鱼</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐠石鳞鳕鱼</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🍗章鱼哥的腿</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐈🐟“猫</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🔭破损望远镜</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🤖安卓鱼</a>", hookRate: 0.35, value: 2 },


  { name: "<a href=\"tg://user?id=8445100282\" >🥥半块椰子</a>", hookRate: 0.35, value: 2 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐡爆炸鱼</a>", hookRate: 0.30, value: 3 },

  { name: "<a href=\"tg://user?id=8445100282\" >🧶猫鱼的猫毛</a>", hookRate: 0.30, value: 3 },
  { name: "<a href=\"tg://user?id=8445100282\" >🥮三黄QQ弹弹香芋抹茶糯叽叽月饼</a>", hookRate: 0.30, value: 3 },
  { name: "<a href=\"tg://user?id=8445100282\" >🎁哥布林人偶</a>", hookRate: 0.30, value: 3 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐙章鱼小丸子</a>", hookRate: 0.30, value: 3 },
  { name: "<a href=\"tg://user?id=8445100282\" >🥛“兰兰乳业”鲜奶</a>", hookRate: 0.30, value: 3 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐟兔鱼</a>", hookRate: 0.30, value: 3 },
  { name: "<a href=\"tg://user?id=8445100282\" >🪼夜光水母</a>", hookRate: 0.30, value: 3 },
  { name: "<a href=\"tg://user?id=8445100282\" ><tg-spoiler>⚡震动棒</tg-spoiler></a>", hookRate: 0.30, value: 3 },
  { name: "<a href=\"tg://user?id=8445100282\" ><tg-spoiler>🍆假阳具</tg-spoiler></a>", hookRate: 0.30, value: 3 },
  { name: "<a href=\"tg://user?id=8445100282\" >🫐蓝莓水母</a>", hookRate: 0.30, value: 3 },
  { name: "<a href=\"tg://user?id=8445100282\" >💎玛瑙珊瑚</a>", hookRate: 0.30, value: 3 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐧企鹅鲨鱼</a>", hookRate: 0.30, value: 3 },
  { name: "<a href=\"tg://user?id=8445100282\" >✨荧光鱼</a>", hookRate: 0.30, value: 3 },
  { name: "<a href=\"tg://user?id=8445100282\" >🍎苹果蟹</a>", hookRate: 0.30, value: 3 },
  { name: "<a href=\"tg://user?id=8445100282\" >🕷️海蜘蛛</a>", hookRate: 0.30, value: 3 },
  { name: "<a href=\"tg://user?id=8445100282\" >💍珍珠贝</a>", hookRate: 0.30, value: 3 },
  { name: "<a href=\"tg://user?id=8445100282\" >🦪枸杞生蚝</a>", hookRate: 0.30, value: 3 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐟光滑大鱼</a>", hookRate: 0.30, value: 3 },
  { name: "<a href=\"tg://user?id=8445100282\" >🌙夜鳞鲷鱼</a>", hookRate: 0.30, value: 3 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐟红鳃鱼</a>", hookRate: 0.30, value: 3 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐠斑点黄尾鱼</a>", hookRate: 0.30, value: 3 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐟夏日鲈鱼</a>", hookRate: 0.30, value: 3 },
  { name: "<a href=\"tg://user?id=8445100282\" >☀️阳鳞鲑鱼</a>", hookRate: 0.30, value: 3 },
  { name: "<a href=\"tg://user?id=8445100282\" >⚡石鳞鳗</a>", hookRate: 0.30, value: 3 },
  { name: "<a href=\"tg://user?id=8445100282\" >❄️冬鱿鱼</a>", hookRate: 0.30, value: 3 },
  { name: "<a href=\"tg://user?id=8445100282\" >🍏被嫌弃的苹果</a>", hookRate: 0.30, value: 3 },

  { name: "<a href=\"tg://user?id=8445100282\" >🐸奇怪的青蛙</a>", hookRate: 0.27, value: 4 },
  { name: "<a href=\"tg://user?id=8445100282\" >🪑酒馆的凳子</a>", hookRate: 0.27, value: 4 },
  { name: "<a href=\"tg://user?id=8445100282\" >🔱朗基努斯鱼</a>", hookRate: 0.27, value: 4 },
  { name: "<a href=\"tg://user?id=8445100282\" >🧚仙女海马</a>", hookRate: 0.27, value: 4 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐾肉球海豹</a>", hookRate: 0.27, value: 4 },
  { name: "<a href=\"tg://user?id=8445100282\" >🛡️Chieftain Mk.VI</a>", hookRate: 0.27, value: 4 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐋烏爾比安</a>", hookRate: 0.27, value: 4 },
  { name: "<a href=\"tg://user?id=8445100282\" >🦈幽靈鯊</a>", hookRate: 0.27, value: 4 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐳斯卡蒂</a>", hookRate: 0.27, value: 4 },
  { name: "<a href=\"tg://user?id=8445100282\" >🧹小皮的扫把</a>", hookRate: 0.27, value: 4 },

  { name: "<a href=\"tg://user?id=8445100282\" >🕶很酷不说话鱼</a>", hookRate: 0.25, value: 5 },
  { name: "<a href=\"tg://user?id=8445100282\" >🥚小母龙的蛋</a>", hookRate: 0.25, value: 5 },
  { name: "<a href=\"tg://user?id=8445100282\" >🥄银勺子</a>", hookRate: 0.25, value: 5 },
  { name: "<a href=\"tg://user?id=8445100282\" >🍱小白的便当</a>", hookRate: 0.25, value: 5 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐟岩崖飞鱼</a>", hookRate: 0.25, value: 5 },
  { name: "<a href=\"tg://user?id=8445100282\" ><tg-spoiler>🛏️充气娃娃</tg-spoiler></a>", hookRate: 0.25, value: 5 },
  { name: "<a href=\"tg://user?id=8445100282\" >🦑毒刺乌贼</a>", hookRate: 0.25, value: 5 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐝海蜻蜓</a>", hookRate: 0.25, value: 5 },
  { name: "<a href=\"tg://user?id=8445100282\" >🦭尖牙海豹</a>", hookRate: 0.25, value: 5 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐟双塔金枪鱼</a>", hookRate: 0.25, value: 5 },
  { name: "<a href=\"tg://user?id=8445100282\" >🦐猎人巨虾</a>", hookRate: 0.25, value: 5 },
  { name: "<a href=\"tg://user?id=8445100282\" >🌭深海肉茎</a>", hookRate: 0.25, value: 5 },
  { name: "<a href=\"tg://user?id=8445100282\" >🪼黏液海触手</a>", hookRate: 0.25, value: 5 },
  { name: "<a href=\"tg://user?id=8445100282\" >🦑骆驼乌贼</a>", hookRate: 0.25, value: 5 },
  { name: "<a href=\"tg://user?id=8445100282\" >🪙金币鱼</a>", hookRate: 0.25, value: 5 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐟巨嘴金鱼</a>", hookRate: 0.25, value: 5 },
  { name: "<a href=\"tg://user?id=8445100282\" >🥕闪闪的胡萝卜</a>", hookRate: 0.25, value: 5 },
  { name: "<a href=\"tg://user?id=8445100282\" >🥭可爱的芒果</a>", hookRate: 0.25, value: 5 },
  { name: "<a href=\"tg://user?id=8445100282\" >🎞️远星的胶片</a>", hookRate: 0.25, value: 5 },
  { name: "<a href=\"tg://user?id=8445100282\" >🌔圆月模型</a>", hookRate: 0.25, value: 5 },
  { name: "<a href=\"tg://user?id=8445100282\" >🎃南瓜灯</a>", hookRate: 0.25, value: 5 },


  { name: "<a href=\"tg://user?id=8445100282\" >🫙纸星瓶</a>", hookRate: 0.23, value: 6 },
  { name: "<a href=\"tg://user?id=8445100282\" >💤睡觉鱼</a>", hookRate: 0.23, value: 6 },
  { name: "<a href=\"tg://user?id=8445100282\" >🎣鱼竿</a>", hookRate: 0.23, value: 6 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐖群友</a>", hookRate: 0.23, value: 6 },

  { name: "<a href=\"tg://user?id=6788664480\" >🥷忍者</a>", hookRate: 0.20, value: 7 },
  { name: "<a href=\"tg://user?id=6788664480\" >🐊鳄鱼</a>", hookRate: 0.20, value: 7 },
  { name: "<a href=\"tg://user?id=6788664480\" >🍀幸運葉子</a>", hookRate: 0.20, value: 7 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐬彩虹海豚</a>", hookRate: 0.20, value: 7 },
  { name: "<a href=\"tg://user?id=8445100282\" >🌊风暴海鲈</a>", hookRate: 0.20, value: 7 },
  { name: "<a href=\"tg://user?id=8445100282\" >🌹玫瑰海胆</a>", hookRate: 0.20, value: 7 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐟冰原鲳</a>", hookRate: 0.20, value: 7 },
  { name: "<a href=\"tg://user?id=8445100282\" >🪸珊瑚海马</a>", hookRate: 0.20, value: 7 },
  { name: "<a href=\"tg://user?id=8445100282\" >🛡️骑士鱼</a>", hookRate: 0.20, value: 7 },
  { name: "<a href=\"tg://user?id=8445100282\" >💖爱心鱼</a>", hookRate: 0.20, value: 7 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐠阴蒂鱼</a>", hookRate: 0.20, value: 7 },


  { name: "<a href=\"tg://user?id=8445100282\" >💐厄尔庇斯花</a>", hookRate: 0.18, value: 8 },
  { name: "<a href=\"tg://user?id=8445100282\" >🧸琉璃的小熊玩偶</a>", hookRate: 0.18, value: 8 },

  { name: "<a href=\"tg://user?id=8445100282\" >🐈哈基喵</a>", hookRate: 0.17, value: 9 },
  { name: "<a href=\"tg://user?id=8445100282\" >⛄️琪露诺的雪人</a>", hookRate: 0.17, value: 9 },
  { name: "<a href=\"tg://user?id=8445100282\" >☘️幸运三叶草</a>", hookRate: 0.17, value: 9 },

  { name: "<a href=\"tg://user?id=8445100282\" >🪷花</a>", hookRate: 0.16, value: 10 },
  { name: "<a href=\"tg://user?id=8445100282\" >🚛泥头车</a>", hookRate: 0.16, value: 10 },
  { name: "<a href=\"tg://user?id=8445100282\" >🌠翻折的祈愿星</a>", hookRate: 0.16, value: 10 },
  { name: "<a href=\"tg://user?id=8445100282\" >🏆金奖杯！</a>", hookRate: 0.16, value: 10 },
  { name: "<a href=\"tg://user?id=8445100282\" >🎄圣诞树</a>", hookRate: 0.16, value: 10 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐻窝窝头</a>", hookRate: 0.16, value: 10 },

  { name: "<a href=\"tg://user?id=8445100282\" >🐉红蛟</a>", hookRate: 0.15, value: 11 },
  { name: "<a href=\"tg://user?id=8445100282\" >🧬远古海马</a>", hookRate: 0.15, value: 11 },
  { name: "<a href=\"tg://user?id=8445100282\" >☯️阴阳鱼</a>", hookRate: 0.15, value: 11 },
  { name: "<a href=\"tg://user?id=8445100282\" >🌺牡丹海参</a>", hookRate: 0.15, value: 11 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐢银龟</a>", hookRate: 0.15, value: 11 },
  { name: "<a href=\"tg://user?id=8445100282\" >☀️太阳鲨鱼</a>", hookRate: 0.15, value: 11 },
  { name: "<a href=\"tg://user?id=8445100282\" >🌋岩浆鳗鱼</a>", hookRate: 0.15, value: 11 },
  { name: "<a href=\"tg://user?id=8445100282\" >⚡雷电鮟鱇鱼</a>", hookRate: 0.15, value: 11 },
  { name: "<a href=\"tg://user?id=8445100282\" >🌊潮汐鱼人</a>", hookRate: 0.15, value: 11 },
  { name: "<a href=\"tg://user?id=8445100282\" >🦑黄金乌贼</a>", hookRate: 0.15, value: 11 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐋触须鲸</a>", hookRate: 0.15, value: 11 },


  { name: "<a href=\"tg://user?id=8445100282\" >🐙章鱼哥</a>", hookRate: 0.11, value: 12 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐚神奇海螺</a>", hookRate: 0.11, value: 12 },

  { name: "<a href=\"tg://user?id=8445100282\" >💍神秘戒指</a>", hookRate: 0.10, value: 13 },
  { name: "<a href=\"tg://user?id=8445100282\" >📒琉璃的回忆相册</a>", hookRate: 0.10, value: 13 },
  { name: "<a href=\"tg://user?id=8445100282\" >📔花音的秘密笔记本</a>", hookRate: 0.10, value: 13 },
  { name: "<a href=\"tg://user?id=8445100282\" >🦈龙牙鲨</a>", hookRate: 0.10, value: 13 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐍巨角蟒</a>", hookRate: 0.10, value: 13 },
  { name: "<a href=\"tg://user?id=8445100282\" >🐱猫鱼</a>", hookRate: 0.10, value: 13 },
  { name: "<a href=\"tg://user?id=8445100282\" >🧚‍♀️湖中精灵</a>", hookRate: 0.10, value: 13 },
  { name: "<a href=\"tg://user?id=8445100282\" >💣教堂の“小男孩”</a>", hookRate: 0.10, value: 13 },
 // { name: "<a href=\"tg://user?id=7674905488\" >🖼️莹魔的涩图”</a>", hookRate: 0.10, value: 13 },
  { name: "<a href=\"tg://user?id=8445100282\" >🦈虎纹鲨鱼”</a>", hookRate: 0.10, value: 13 },

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
    chatId: -1002970430696,
    threadIds: [177],
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
    chatId: -1002970430696,
    threadIds: [178],
    placeName: "紫罗兰教堂的募捐箱",
    enabled: true,
    successMessage:
      "${userName}已将 ${amount} 💰投入${place}." +
      "<blockquote expandable>信徒手中握紧了硬币，在胸前虔诚地画下了十字，然后将它们投进了募捐箱中。硬币落于箱底，发出了清脆的声响。信徒合十之后的祈祷，和空气中若有若无的圣歌，相得益彰。烛台的火苗，忽然爆起，发出了噼啪声。\n\n"
      + "神像的目光，宽任怜恤，看向了虔敬的信徒。温暖的阳光，穿过了彩色的玻璃窗，聚焦于信徒的头顶，仿佛亮起了一道神明降下的视线，久久不曾离开。\n\n"
      + "祈祷声渐歇，光影抖动着、跳跃着。空中似乎浮现出天使之手，撒下了无数的紫罗兰花瓣，在神明的注视下，伴随着信徒坚定的步履，一路飘落，向前。</blockquote>"
      + "${place}现已累计收到 ${total} 💰的捐款。感谢您的善助。"
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

/**
 * 根据抛竿力度返回一段日式异世界轻小说风格的描述。
 * 文案为“xx 抛出渔线 之后”的续句：先写力度感，然后是视觉与听觉反馈（无主语）。
 * strength: 抛竿力度（数值越大力度越强），函数会在同等级中随机挑一句。
 */
export function getCastDesc(strength: number): string {
  function pick(options: string[]): string {
    return options[Math.floor(Math.random() * options.length)];
  }

  switch (true) {
    case (strength <= 15):
      return pick([
        "力道轻若羽落，线落水面只留一圈温柔的涟漪，水面像轻声的呼吸，耳边只有细碎水滴敲击木杆的轻响。",
        "力度如同拂晓的微风，渔线轻柔划过空气，浮漂缓缓入水，传来如银丝般的轻响，月光在水面颤抖。",
        "一抛带着温和的节奏，几乎与周遭寂静融为一体，水面只起了羞涩的涟漪，连风声也显得更柔软。"
      ]);
    case (strength <= 20):
      return pick([
        "力度像轻扇拂面，弧线舒展优雅，落水处泛起细碎光点，仿佛远处风铃伴着水声轻唱。",
        "力道带着一点弹性，鱼线在空中描出温婉的弧线，触水轻响有节奏，周遭的树影随之微动。",
        "轻快却不急促，渔线划过空气发出毫无侵略的唰声，浮漂落下时水面轻声叹息。"
      ]);
    case (strength <= 25):
      return pick([
        "力道恰到好处，抛出如同一页翻开的古书，弧线在空中留下淡淡光痕，落水处泛起的声响似低语的祝福。",
        "力度稳健但不张扬，水面被切开成整齐的涟漪，微弱的水花伴随一声清晰的撞击感。",
        "动作利落却柔和，渔线入水时带起一圈圆润的波纹，像在湖心写下短短诗句。"
      ]);
    case (strength <= 30):
      return pick([
        "这一抛带着一缕坚定，弧线拉长了空气的呼吸，入水瞬间外溢的水花像散落的星屑，伴着短促的溅声。",
        "力度有了更明显的存在感，鱼线划出一道细长的弧，水面回应以清晰的拍击声与连串涟漪。",
        "抛投带着练达的节奏感，空气中回响一声干净的风切音，湖面在声音里微微颤动。"
      ]);
    case (strength <= 35):
      return pick([
        "力道变得坚实，渔线犹如弯曲的弓弦放开，落水处激起散开的水花，伴着低沉的水声和湖底沉闷的回响。",
        "抛出时劲道稳重，弧线在夕阳下留下一道亮影，水面被唤醒，连远处鸟鸣都仿佛缩短了距离。",
        "动作带着从容的力量感，入水处迸出清晰的碎响，波纹翻卷成层层吟唱。"
      ]);
    case (strength <= 40):
      return pick([
        "力度带着果敢，渔线划破空气发出干脆的呼啸，入水处挥起一簇高扬的水珠，像短暂喷薄的银色焰火。",
        "这一抛有明显冲击感，水面被撕开一瞬，回荡起利落的拍打声，湖面像是受到了召唤般回声连连。",
        "抛投如弦上拔弦，空气中留下短促而有力的回响，水花高起又迅速散尽。"
      ]);
    case (strength <= 45):
      return pick([
        "力道厚重如铁锤轻敲，渔线入水时带起明显浪花，水声低沉，仿佛在湖心敲下有力的注脚。",
        "这一掷带着庄重的力度，落点处水雾四散，水声深沉回荡，周遭的光影也为之一顿。",
        "抛竿像扔出一枚重物，入水时的拍击声带着金属般的清脆与沉稳混合。"
      ]);
    case (strength <= 50):
      return pick([
        "力度稳中带劲，弧线像切开的银弧，入水处激起一圈圈翻涌，波纹带着低频的共鸣，像远处钟声的余波。",
        "一抛带着仪式感，水面瞬间展开成有秩序的波列，溅起的水珠在夕光里闪烁并发出饱满的声响。",
        "力度开始显露威势，鱼线划过空气时带起明显的气流声，撞击水面随之发出浑厚一击。"
      ]);
    case (strength <= 55):
      return pick([
        "力道更为明确，渔线似长缨横扫，触水引发高起的弧浪，声音粗粝却不失节奏，像是大鼓的一记拍击。",
        "抛出带着一点刚烈，水花高扬并迅速坠落，浪声在耳畔聚合成低沉的低语。",
        "这一抛像是向湖心投下重函，落点处水气翻腾，回声有力且持久。"
      ]);
    case (strength <= 60):
      return pick([
        "力度趋于厚重，弧线切割空气发出强烈的啸声，入水处波涛瞬间扩散，仿佛搅动了湖底的沉寂。",
        "抛投带着锋利的速度感，水面被猛然唤起，溅起的水珠像碎银般四散，回声深远。",
        "一记有冲击力的抛掷，水波像被巨手拨动，伴着明显的风声与水声交织。"
      ]);
    case (strength <= 65):
      return pick([
        "力道如同祷歌中高昂的一句，渔线入水处泛起奇异的光泽，水声夹带低沉的嗡鸣，像古老器物共振。",
        "抛出时空气里仿佛生出微光，落点处涌起圆形涡流，声响有着异样的厚度。",
        "力度带来些许神秘感，水面被唤起的光华和声色让周遭的空气都微微颤抖。"
      ]);
    case (strength <= 70):
      return pick([
        "这一抛拥有风暴的前奏感，鱼线呼啸而去，入水时掀起显著波涛，伴随低沉且连绵的撞击声。",
        "力道强劲，弧线像切裂天空的一道缝隙，落水处水雾腾起，声音厚重而持续，宛如远处鼓阵。",
        "抛投既有力又带着凌厉，溅起的浪头高远，水声与风声并行，渲染出紧张的气氛。"
      ]);
    case (strength <= 75):
      return pick([
        "力道与魄力并存，渔线像长枪掷出，入水瞬间形成高低错落的波峰，撞击声带着金属般的清亮与厚重感。",
        "抛出时空气被切分得更彻底，水面翻卷，伴随着一阵近似咆哮的低频回响。",
        "这一掷如宣告般坚定，水花攀升而下，声浪在湖面间奔涌。"
      ]);
    case (strength <= 80):
      return pick([
        "力度接近巅峰，但仍克制，弧线划破半空，入水处掀起宽阔的波面，水声像战鼓般有节奏地回荡。",
        "抛投带着几分沉烈，溅起的水珠在空中划出长长的轨迹，落下时带来连绵不断的拍击声。",
        "一记有分量的抛竿，湖面像被撕开一道浅口，回声宏大而不杂乱。"
      ]);
    case (strength <= 85):
      return pick([
        "力度厚重到能震动胸腔，但仍不失优雅，鱼线入水时水面被迫生成翻滚的涡带，声音带着金属般的余韵。",
        "抛出带来强烈的视觉冲击，水花高扬，光影急促跳动，回响深远并略带颤抖。",
        "这一抛几乎像是向湖泊宣誓，波纹扩散迅速而有力量，回声在空旷中回荡。"
      ]);
    case (strength <= 90):
      return pick([
        "力道接近极限，但仍在理性范围内，渔线砸入水面激起浩荡的浪潮，水声化作低吼，远处山谷似乎回应。",
        "抛投带着剧烈的爆发力，弧线迅疾，水面瞬间裂出大片白沫，空气中回荡着震荡般的音波。",
        "一记强而有力的掷出，让湖心的寂静被打破，水雾高扬、声音厚重且深远。"
      ]);
    case (strength <= 95):
      return pick([
        "力度几近满格，渔线入水掀起翻腾的白浪，水面像被重锤敲击，声音有着震撼的层次感且伴随回旋。",
        "抛出带来明显的气流与水气冲击，溅起高耸的水柱，回响在耳畔回旋不散。",
        "这一掷带着不可忽视的威仪，水花扬起，波纹像刀痕般切过湖面。"
      ]);
    case (strength <= 100):
      return pick([
        "力道强劲到几乎能撼动周遭的空气，渔线砸入湖面引发壳状涌动，水声如同战鼓，光影被猛烈撕扯。",
        "抛投带来震耳的风切与水击，浪头高扬并伴随连续的轰鸣，仿佛把湖面化为一场短促的风暴。",
        "这一抛像点燃湖心的暗潮，水雾升腾，回声在四周撞击回荡。"
      ]);
    case (strength <= 105):
      return pick([
        "力度超越常态的稳健，渔线入水瞬间带起巨大的涌动，水花与气浪同起，声响厚重且带着回荡的余音。",
        "抛出仿佛牵动了更深层的水域，落点周围水面卷起巨大涡流，回波有种古老器物共鸣的质感。",
        "这一掷带着近乎史诗的气息，水面被力道切割出明显的褶皱，声音沉而有力。"
      ]);
    case (strength <= 110):
      return pick([
        "力道位于极限边缘，渔线如矢贯空，入水处瞬时爆发出高耸浪峰，水声像雷鼓连击，湖心震荡成圈层扩散。",
        "抛投带来强烈的视觉轰动，水花飞扬成帷幕，空气中回荡的声波带着压迫感与宽阔感。",
        "这一抛几乎将湖面当作了舞台，涌起的水柱与爆裂的声响宣示着强烈的存在感。"
      ]);
    default:
      // 超出设定上限，保持简洁且不夸张
      return pick([
        "力道超出了平常衡量，渔线飞掠长空，湖面为之起伏，声音厚重又被拉长成回忆般的余音。",
        "超出既定极限的一掷，入水处带起巨大涌动，水雾如帷幕翻飞，回声迟缓而深邃。",
        "力量超限但未失控，弧线与水面在瞬间交织成宏大的景象，声响带着辽阔的收束感。"
      ]);
  }
}

export type BackupTarget = { chat_id: number; threadId?: number };
export type BackupMapping = { from: { chat_id: number; threadId?: number }; to: BackupTarget[] };

// 示例 backupConfig — 请根据实际需要替换/扩展此常量
// 说明：
// - from.chat_id 必填，用于匹配来源群组/频道
// - from.threadId 可选，若指定则只在该 threadId 下匹配；未指定则匹配整个 chat
// - to 是目标数组，可包含多个目的地（chat_id + 可选 threadId）
export const backupConfig: BackupMapping[] = [
  // 示例：整个群组 -1001111111111 的消息都会被备份到 -1002222222222 和 -1003333333333
  {
    from: { chat_id: -1001111111111 },
    to: [
      { chat_id: -1002222222222 },
      { chat_id: -1003333333333 }
    ]
  },
  // 示例：测试群

  /*
    {
      from: { chat_id: -1002848481881, threadId: 66 },
      to: [
        { chat_id: -1002661676227, threadId: 2 }
      ]
    },
  */

  //紫罗大群
  //匹配区
  {
    from: { chat_id: -1002742074355, threadId: 302677 },
    to: [
      { chat_id: -1003066803437, threadId: 4 }
    ]
  },
  //紫罗兰之花
  {
    from: { chat_id: -1002742074355, threadId: 1161 },
    to: [
      { chat_id: -1003066803437, threadId: 6 }
    ]
  },
  //酒馆
  {
    from: { chat_id: -1002742074355, threadId: 48 },
    to: [
      { chat_id: -1003066803437, threadId: 8 }
    ]
  },
  //教堂
  {
    from: { chat_id: -1002742074355, threadId: 62 },
    to: [
      { chat_id: -1003066803437, threadId: 10 }
    ]
  },
  //艺术馆
  {
    from: { chat_id: -1002742074355, threadId: 284999 },
    to: [
      { chat_id: -1003066803437, threadId: 12 }
    ]
  },
  //伊莲娜
  {
    from: { chat_id: -1002742074355, threadId: 194 },
    to: [
      { chat_id: -1003066803437, threadId: 93 }
    ]
  },
  //摄影棚
  {
    from: { chat_id: -1002742074355, threadId: 232551 },
    to: [
      { chat_id: -1003066803437, threadId: 91 }
    ]
  },
  //紫罗兰学院https://t.me/c/2742074355//636402
  {
    from: { chat_id: -1002742074355, threadId: 514627 },
    to: [
      { chat_id: -1003066803437, threadId: 89 }
    ]
  },
  //玉宝
  {
    from: { chat_id: -1002742074355, threadId: 251 },
    to: [
      { chat_id: -1003066803437, threadId: 87 }
    ]
  },
  //客房1
  {
    from: { chat_id: -1002742074355, threadId: 467843 },
    to: [
      { chat_id: -1003066803437, threadId: 85 }
    ]
  },
  //女皇
  {
    from: { chat_id: -1002742074355, threadId: 215 },
    to: [
      { chat_id: -1003066803437, threadId: 83 }
    ]
  },
  //客房2
  {
    from: { chat_id: -1002742074355, threadId: 74050 },
    to: [
      { chat_id: -1003066803437, threadId: 81 }
    ]
  },
  //行商小屋
  {
    from: { chat_id: -1002742074355, threadId: 338 },
    to: [
      { chat_id: -1003066803437, threadId: 79 }
    ]
  },
  //FuFu
  {
    from: { chat_id: -1002742074355, threadId: 448929 },
    to: [
      { chat_id: -1003066803437, threadId: 77 }
    ]
  },
  //审判庭https://t.me/c/2742074355//513532
  {
    from: { chat_id: -1002742074355, threadId: 389 },
    to: [
      { chat_id: -1003066803437, threadId: 75 }
    ]
  },
  //跑团
  {
    from: { chat_id: -1002742074355, threadId: 55106 },
    to: [
      { chat_id: -1003066803437, threadId: 73 }
    ]
  },
  //委托墙https://t.me/c/2742074355//621182
  {
    from: { chat_id: -1002742074355, threadId: 584924 },
    to: [
      { chat_id: -1003066803437, threadId: 71 }
    ]
  },
  //图书馆
  {
    from: { chat_id: -1002742074355, threadId: 205 },
    to: [
      { chat_id: -1003066803437, threadId: 69 }
    ]
  },
  //闪闪
  {
    from: { chat_id: -1002742074355, threadId: 244 },
    to: [
      { chat_id: -1003066803437, threadId: 67 }
    ]
  },
  //广场
  {
    from: { chat_id: -1002742074355, threadId: 246576 },
    to: [
      { chat_id: -1003066803437, threadId: 65 }
    ]
  },
  //大会堂
  {
    from: { chat_id: -1002742074355, threadId: 301724 },
    to: [
      { chat_id: -1003066803437, threadId: 63 }
    ]
  },
  //爬塔
  {
    from: { chat_id: -1002742074355, threadId: 497929 },
    to: [
      { chat_id: -1003066803437, threadId: 61 }
    ]
  },
  //耀阳
  {
    from: { chat_id: -1002742074355, threadId: 382 },
    to: [
      { chat_id: -1003066803437, threadId: 59 }
    ]
  },
  //kago
  {
    from: { chat_id: -1002742074355, threadId: 141941 },
    to: [
      { chat_id: -1003066803437, threadId: 57 }
    ]
  },
  //酥酥
  {
    from: { chat_id: -1002742074355, threadId: 165 },
    to: [
      { chat_id: -1003066803437, threadId: 55 }
    ]
  },
  //人设
  {
    from: { chat_id: -1002742074355, threadId: 21237 },
    to: [
      { chat_id: -1003066803437, threadId: 53 }
    ]
  },
  //软软
  {
    from: { chat_id: -1002742074355, threadId: 182 },
    to: [
      { chat_id: -1003066803437, threadId: 51 }
    ]
  },
  //琉璃
  {
    from: { chat_id: -1002742074355, threadId: 33861 },
    to: [
      { chat_id: -1003066803437, threadId: 49 }
    ]
  },
  //汐汐
  {
    from: { chat_id: -1002742074355, threadId: 258 },
    to: [
      { chat_id: -1003066803437, threadId: 47 }
    ]
  },
  //设定
  {
    from: { chat_id: -1002742074355, threadId: 334 },
    to: [
      { chat_id: -1003066803437, threadId: 45 }
    ]
  },

  //万事屋
  {
    from: { chat_id: -1002742074355, threadId: 444725 },
    to: [
      { chat_id: -1003066803437, threadId: 43 }
    ]
  },

  //牡丹群岛
  {
    from: { chat_id: -1002742074355, threadId: 454656 },
    to: [
      { chat_id: -1003066803437, threadId: 41 }
    ]
  },

  //满月
  {
    from: { chat_id: -1002742074355, threadId: 361 },
    to: [
      { chat_id: -1003066803437, threadId: 39 }
    ]
  },

  //缘宝
  {
    from: { chat_id: -1002742074355, threadId: 88693 },
    to: [
      { chat_id: -1003066803437, threadId: 37 }
    ]
  },

  //YOLO
  {
    from: { chat_id: -1002742074355, threadId: 621178 },
    to: [
      { chat_id: -1003066803437, threadId: 35 }
    ]
  },

  //后花园
  {
    from: { chat_id: -1002742074355, threadId: 202 },
    to: [
      { chat_id: -1003066803437, threadId: 33 }
    ]
  },

  //桌游
  {
    from: { chat_id: -1002742074355, threadId: 345 },
    to: [
      { chat_id: -1003066803437, threadId: 31 }
    ]
  },
  //落雪
  {
    from: { chat_id: -1002742074355, threadId: 234072 },
    to: [
      { chat_id: -1003066803437, threadId: 29 }
    ]
  },
  //小小M
  {
    from: { chat_id: -1002742074355, threadId: 211 },
    to: [
      { chat_id: -1003066803437, threadId: 26 }
    ]
  },
  //娜链
  {
    from: { chat_id: -1002742074355, threadId: 503851 },
    to: [
      { chat_id: -1003066803437, threadId: 24 }
    ]
  },
  //电竞
  {
    from: { chat_id: -1002742074355, threadId: 80 },
    to: [
      { chat_id: -1003066803437, threadId: 22 }
    ]
  },
  //魔法少女
  {
    from: { chat_id: -1002742074355, threadId: 176 },
    to: [
      { chat_id: -1003066803437, threadId: 20 }
    ]
  },
  //兰兰
  {
    from: { chat_id: -1002742074355, threadId: 168 },
    to: [
      { chat_id: -1003066803437, threadId: 18 }
    ]
  },
  //小母龙
  {
    from: { chat_id: -1002742074355, threadId: 7571 },
    to: [
      { chat_id: -1003066803437, threadId: 16 }
    ]
  },
  //音
  {
    from: { chat_id: -1002742074355, threadId: 184 },
    to: [
      { chat_id: -1003066803437, threadId: 14 }
    ]
  },
  //内务部 https://t.me/c/2742074355//638715  https://t.me/c/3066803437//2028
  {
    from: { chat_id: -1002742074355, threadId: 638714 },
    to: [
      { chat_id: -1003066803437, threadId: 2027 }
    ]
  },

  

  //匹配区
  {
    from: { chat_id: -1002970430696, threadId: 302677 },
    to: [
      { chat_id: -1003066803437, threadId: 4 }
    ]
  },
  //紫罗兰之花
  {
    from: { chat_id: -1002970430696, threadId: 184 },
    to: [
      { chat_id: -1003066803437, threadId: 6 }
    ]
  },
  //酒馆
  {
    from: { chat_id: -1002970430696, threadId: 210 },
    to: [
      { chat_id: -1003066803437, threadId: 8 }
    ]
  }, 
  //艺术馆
  {
    from: { chat_id: -1002970430696, threadId: 158 },
    to: [
      { chat_id: -1003066803437, threadId: 12 }
    ]
  }, 
  //摄影棚 
  {
    from: { chat_id: -1002970430696, threadId: 168 },
    to: [
      { chat_id: -1003066803437, threadId: 91 }
    ]
  },    
  //审判庭
  {
    from: { chat_id: -1002970430696, threadId: 314 },
    to: [
      { chat_id: -1003066803437, threadId: 75 }
    ]
  },   
  //闪闪
  {
    from: { chat_id: -1002970430696, threadId: 180 },
    to: [
      { chat_id: -1003066803437, threadId: 67 }
    ]
  },
  //广场 
  {
    from: { chat_id: -1002970430696, threadId: 178 },
    to: [
      { chat_id: -1003066803437, threadId: 65 }
    ]
  }, 
  //大会堂 
  {
    from: { chat_id: -1002970430696, threadId: 67 },
    to: [
      { chat_id: -1003066803437, threadId: 63 }
    ]
  },
  //大会堂 
  {
    from: { chat_id: -1002970430696, threadId: 1 },
    to: [
      { chat_id: -1003066803437, threadId: 63 }
    ]
  },
  //爬塔
  {
    from: { chat_id: -1002970430696, threadId: 182 },
    to: [
      { chat_id: -1003066803437, threadId: 61 }
    ]
  },
  //耀阳
  {
    from: { chat_id: -1002970430696, threadId: 162 },
    to: [
      { chat_id: -1003066803437, threadId: 59 }
    ]
  }, 
  //酥酥
  {
    from: { chat_id: -1002970430696, threadId: 172 },
    to: [
      { chat_id: -1003066803437, threadId: 55 }
    ]
  },
  //人设
  {
    from: { chat_id: -1002970430696, threadId: 155 },
    to: [
      { chat_id: -1003066803437, threadId: 53 }
    ]
  },
  //软软
  {
    from: { chat_id: -1002970430696, threadId: 177 },
    to: [
      { chat_id: -1003066803437, threadId: 51 }
    ]
  },
  //琉璃
  {
    from: { chat_id: -1002970430696, threadId: 176 },
    to: [
      { chat_id: -1003066803437, threadId: 49 }
    ]
  },  
  //万事屋
  {
    from: { chat_id: -1002970430696, threadId: 170 },
    to: [
      { chat_id: -1003066803437, threadId: 43 }
    ]
  },

  //牡丹群岛
  {
    from: { chat_id: -1002970430696, threadId: 166 },
    to: [
      { chat_id: -1003066803437, threadId: 41 }
    ]
  },
 

  //缘宝
  {
    from: { chat_id: -1002970430696, threadId: 175 },
    to: [
      { chat_id: -1003066803437, threadId: 37 }
    ]
  }, 

  //桌游
  {
    from: { chat_id: -1002970430696, threadId: 160 },
    to: [
      { chat_id: -1003066803437, threadId: 31 }
    ]
  },   
  //电竞
  {
    from: { chat_id: -1002970430696, threadId: 161 },
    to: [
      { chat_id: -1003066803437, threadId: 22 }
    ]
  },
  //魔法少女
  {
    from: { chat_id: -1002970430696, threadId: 159 },
    to: [
      { chat_id: -1003066803437, threadId: 20 }
    ]
  },
  //兰兰
  {
    from: { chat_id: -1002970430696, threadId: 171 },
    to: [
      { chat_id: -1003066803437, threadId: 18 }
    ]
  },
  //小母龙
  {
    from: { chat_id: -1002970430696, threadId: 174 },
    to: [
      { chat_id: -1003066803437, threadId: 16 }
    ]
  },
  //音
  {
    from: { chat_id: -1002970430696, threadId: 173 },
    to: [
      { chat_id: -1003066803437, threadId: 14 }
    ]
  }, 
  
  //魔枢

  {
    from: { chat_id: -1002970430696, threadId: 89 },
    to: [
      { chat_id: -1003066803437, threadId: 63 }
    ]
  },
  //神殿

  {
    from: { chat_id: -1002970430696, threadId: 157 },
    to: [
      { chat_id: -1003066803437, threadId: 63 }
    ]
  },
  //农场https://t.me/c/3066803437/572947/572948
  {
    from: { chat_id: -1002970430696, threadId: 179 },
    to: [
      { chat_id: -1003066803437, threadId: 572947 }
    ]
  },



];
