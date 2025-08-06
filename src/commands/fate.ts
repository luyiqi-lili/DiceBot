/* commands/fate.js */
// 提取 22 张大阿卡那塔罗牌
const MAJOR_ARCANA = [
    { name: '愚者', file: 'https://i1.hdslb.com/bfs/article/1d6f4752a08b137e3b7d9cac63022a61393662166.jpg'},
    { name: '魔术师', file: 'https://i1.hdslb.com/bfs/article/c61b0b22820f4e6995c5d402cdab0f88393662166.jpg' },
    { name: '女祭司', file: 'https://i1.hdslb.com/bfs/article/ed77e31b60e66e6918a82615eb5fd4af393662166.jpg' },
    /*  { name: '皇后', file: '3' },
      { name: '皇帝', file: '4' },
      { name: '教皇', file: '5' },
      { name: '恋人', file: '6' },
      { name: '战车', file: '7' },
      { name: '力量', file: '8' },
      { name: '隐者', file: '9' },
      { name: '命运之轮', file: '10' },
      { name: '正义', file: '11' },
      { name: '倒吊人', file: '12' },
      { name: '死亡', file: '13' },
      { name: '节制', file: '14' },
      { name: '恶魔', file: '15' },
      { name: '高塔', file: '16' },
      { name: '星星', file: '17' },
      { name: '月亮', file: '18' },
      { name: '太阳', file: '19' },
      { name: '审判', file: '20' },
      { name: '世界', file: '21' },
      { name: '逆愚者', file: '0d.jpg' },
      { name: '逆魔术师', file: '1d.jpg' },
      { name: '逆女祭司', file: '2d.jpg' },
      { name: '逆皇后', file: '3d.jpg' },
      { name: '逆皇帝', file: '4d.jpg' },
      { name: '逆教皇', file: '5d.jpg' },
      { name: '逆恋人', file: '6d.jpg' },
      { name: '逆战车', file: '7d.jpg' },
      { name: '逆力量', file: '8d.jpg' },
      { name: '逆隐者', file: '9d.jpg' },
      { name: '逆命运之轮', file: '10d.jpg' },
      { name: '逆正义', file: '11d.jpg' },
      { name: '逆倒吊人', file: '12d.jpg' },
      { name: '逆死亡', file: '13d.jpg' },
      { name: '逆节制', file: '14d.jpg' },
      { name: '逆恶魔', file: '15d.jpg' },
      { name: '逆高塔', file: '16d.jpg' },
      { name: '逆星星', file: '17d.jpg' },
      { name: '逆月亮', file: '18d.jpg' },
      { name: '逆太阳', file: '19d.jpg' },
      { name: '逆审判', file: '20d.jpg' },
      { name: '逆世界', file: '21d.jpg' }
    
    */
];

/**
 * 处理 /fate 命令：随机抽取 3 张大阿卡那
 * @param msg - Telegram 消息对象
 * @param env - Cloudflare Worker 环境
 * @returns 发送媒体组所需的 payload
 */
export async function handleFate(
    msg: TelegramMessage,
    env: Env
): Promise<{
    method: 'sendMediaGroup';
    chat_id: number;
    message_thread_id?: number;
    media: Array<{
        type: 'photo';
        media: string;
        caption?: string;
        parse_mode?: 'HTML';
    }>;
}> {
    console.log('🔮 /fate 命令开始处理，用户：', msg.from.username || msg.from.first_name);

    // 随机不重复选择 3 张牌
    const pickCount = 3;
    const indices: number[] = [];
    while (indices.length < pickCount) {
        const idx = Math.floor(Math.random() * MAJOR_ARCANA.length);
        if (!indices.includes(idx)) {
            indices.push(idx);
            console.log(`🎴 选中牌索引: ${idx} (${MAJOR_ARCANA[idx].name})`);
        }
    }

    const positions = ['昨天', '今天', '明天'];
    console.log('🕰️ 牌位映射:', positions.join(', '));

    // 构造 media 数组
    const order = [1, 0, 2];
    const media = order.map((posIdx, j) => {
        const card = MAJOR_ARCANA[indices[posIdx]];
        console.log(`📸 准备发送图片: ${card.file}`);
        const entry: {
            type: 'photo';
            media: string;
            caption?: string;
            parse_mode?: 'HTML';
        } = {
            type: 'photo',
            media: `${card.file}`
        };

        if (j === 0) {
            // 仅第一张附带 caption
            const captionText = positions
                .map((pos, k) => `${pos}：${MAJOR_ARCANA[indices[k]].name}`)
                .join('\n');
            entry.caption = captionText;
            entry.parse_mode = 'HTML';
            console.log('📝 Caption 文本:', captionText.replace(/\n/g, ' | '));
        }
        return entry;
    });

    // 构造并返回 payload
    const payload = {
        method: 'sendMediaGroup' as const,
        chat_id: msg.chat.id,
        message_thread_id: msg.message_thread_id,
        media
    };
    console.log('📤 sendMediaGroup payload:', JSON.stringify(payload, null, 2));

    return payload;
}
