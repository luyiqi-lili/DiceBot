/**
 * @file src/data/backup.ts
 * @description 消息备份目标映射配置。
 */

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
