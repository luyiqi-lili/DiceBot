/* commands/fate.js */
// 提取 22 张大阿卡那塔罗牌
const MAJOR_ARCANA = [
    { name: '愚者', file: 'https://luyiqi-lili.github.io/pic/0.jpg' },
    { name: '魔术师', file: 'https://luyiqi-lili.github.io/pic/1.jpg' },
    { name: '女祭司', file: 'https://luyiqi-lili.github.io/pic/2.jpg' },
    { name: '皇后', file: 'https://luyiqi-lili.github.io/pic/3.jpg' },
    { name: '皇帝', file: 'https://luyiqi-lili.github.io/pic/4.jpg' },
    { name: '教皇', file: 'https://luyiqi-lili.github.io/pic/5.jpg' },
    { name: '恋人', file: 'https://luyiqi-lili.github.io/pic/6.jpg' },
    { name: '战车', file: 'https://luyiqi-lili.github.io/pic/7.jpg' },
    { name: '力量', file: 'https://luyiqi-lili.github.io/pic/8.jpg' },
    { name: '隐者', file: 'https://luyiqi-lili.github.io/pic/9.jpg' },
    { name: '命运之轮', file: 'https://luyiqi-lili.github.io/pic/10.jpg' },
    { name: '正义', file: 'https://luyiqi-lili.github.io/pic/11.jpg' },
    { name: '倒吊人', file: 'https://luyiqi-lili.github.io/pic/12.jpg' },
    { name: '死亡', file: 'https://luyiqi-lili.github.io/pic/13.jpg' },
    { name: '节制', file: 'https://luyiqi-lili.github.io/pic/14.jpg' },
    { name: '恶魔', file: 'https://luyiqi-lili.github.io/pic/15.jpg' },
    { name: '高塔', file: 'https://luyiqi-lili.github.io/pic/16.jpg' },
    { name: '星星', file: 'https://luyiqi-lili.github.io/pic/17.jpg' },
    { name: '月亮', file: 'https://luyiqi-lili.github.io/pic/18.jpg' },
    { name: '太阳', file: 'https://luyiqi-lili.github.io/pic/19.jpg' },
    { name: '审判', file: 'https://luyiqi-lili.github.io/pic/20.jpg' },
    { name: '世界', file: 'https://luyiqi-lili.github.io/pic/21.jpg' },
    { name: '逆愚者', file: 'https://luyiqi-lili.github.io/0d.jpg' },
    { name: '逆魔术师', file: 'https://luyiqi-lili.github.io/1d.jpg' },
    { name: '逆女祭司', file: 'https://luyiqi-lili.github.io/2d.jpg' },
    { name: '逆皇后', file: 'https://luyiqi-lili.github.io/3d.jpg' },
    { name: '逆皇帝', file: 'https://luyiqi-lili.github.io/4d.jpg' },
    { name: '逆教皇', file: 'https://luyiqi-lili.github.io/5d.jpg' },
    { name: '逆恋人', file: 'https://luyiqi-lili.github.io/6d.jpg' },
    { name: '逆战车', file: 'https://luyiqi-lili.github.io/7d.jpg' },
    { name: '逆力量', file: 'https://luyiqi-lili.github.io/8d.jpg' },
    { name: '逆隐者', file: 'https://luyiqi-lili.github.io/9d.jpg' },
    { name: '逆命运之轮', file: 'https://luyiqi-lili.github.io/10d.jpg' },
    { name: '逆正义', file: 'https://luyiqi-lili.github.io/11d.jpg' },
    { name: '逆倒吊人', file: 'https://luyiqi-lili.github.io/12d.jpg' },
    { name: '逆死亡', file: 'https://luyiqi-lili.github.io/13d.jpg' },
    { name: '逆节制', file: 'https://luyiqi-lili.github.io/14d.jpg' },
    { name: '逆恶魔', file: 'https://luyiqi-lili.github.io/15d.jpg' },
    { name: '逆高塔', file: 'https://luyiqi-lili.github.io/16d.jpg' },
    { name: '逆星星', file: 'https://luyiqi-lili.github.io/17d.jpg' },
    { name: '逆月亮', file: 'https://luyiqi-lili.github.io/18d.jpg' },
    { name: '逆太阳', file: 'https://luyiqi-lili.github.io/19d.jpg' },
    { name: '逆审判', file: 'https://luyiqi-lili.github.io/20d.jpg' },
    { name: '逆世界', file: 'https://luyiqi-lili.github.io/21d.jpg' }


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
