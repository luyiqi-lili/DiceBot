/* commands/fate.js */
// 提取 22 张大阿卡那塔罗牌
// 每张牌对象包含 name（牌名）和 file（图片 URL）
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
    { name: '逆愚者', file: 'https://luyiqi-lili.github.io/pic/0d.jpg' },
    { name: '逆魔术师', file: 'https://luyiqi-lili.github.io/pic/1d.jpg' },
    { name: '逆女祭司', file: 'https://luyiqi-lili.github.io/pic/2d.jpg' },
    { name: '逆皇后', file: 'https://luyiqi-lili.github.io/pic/3d.jpg' },
    { name: '逆皇帝', file: 'https://luyiqi-lili.github.io/pic/4d.jpg' },
    { name: '逆教皇', file: 'https://luyiqi-lili.github.io/pic/5d.jpg' },
    { name: '逆恋人', file: 'https://luyiqi-lili.github.io/pic/6d.jpg' },
    { name: '逆战车', file: 'https://luyiqi-lili.github.io/pic/7d.jpg' },
    { name: '逆力量', file: 'https://luyiqi-lili.github.io/pic/8d.jpg' },
    { name: '逆隐者', file: 'https://luyiqi-lili.github.io/pic/9d.jpg' },
    { name: '逆命运之轮', file: 'https://luyiqi-lili.github.io/pic/10d.jpg' },
    { name: '逆正义', file: 'https://luyiqi-lili.github.io/pic/11d.jpg' },
    { name: '逆倒吊人', file: 'https://luyiqi-lili.github.io/pic/12d.jpg' },
    { name: '逆死亡', file: 'https://luyiqi-lili.github.io/pic/13d.jpg' },
    { name: '逆节制', file: 'https://luyiqi-lili.github.io/pic/14d.jpg' },
    { name: '逆恶魔', file: 'https://luyiqi-lili.github.io/pic/15d.jpg' },
    { name: '逆高塔', file: 'https://luyiqi-lili.github.io/pic/16d.jpg' },
    { name: '逆星星', file: 'https://luyiqi-lili.github.io/pic/17d.jpg' },
    { name: '逆月亮', file: 'https://luyiqi-lili.github.io/pic/18d.jpg' },
    { name: '逆太阳', file: 'https://luyiqi-lili.github.io/pic/19d.jpg' },
    { name: '逆审判', file: 'https://luyiqi-lili.github.io/pic/20d.jpg' },
    { name: '逆世界', file: 'https://luyiqi-lili.github.io/pic/21d.jpg' }
];

/**
 * 处理 /fate 命令：随机抽取 3 张大阿卡那，或解析已抽取的牌
 * @param {TelegramMessage} msg - Telegram 消息对象
 * @param {Env} env - Cloudflare Worker 环境变量
 * @returns 发送媒体组或文本消息所需的 payload
 */
export async function handleFate(msg, env) {
    console.log('🔮 [handleFate] 收到消息:', msg.text);

    const text = msg.text || '';
    const replied = msg.reply_to_message;
    const cap = replied?.caption || '';
    console.log(`🔍 [handleFate] text = ${text}`);
    console.log(`🔍 [handleFate] replied = ${replied}`);
    console.log(`🔍 [handleFate] cap = ${cap}`);
    // 判断是否需要执行塔罗牌含义解析
    const isInterpret = (
        // 以 /fate 开头，或以 @BotUsername /fate 开头
        /^(?:\/fate(?:@\w+)?|@\w+\s*\/fate(?:@\w+)?)/i.test(text)
        && replied
        && cap.includes('昨天')
        && cap.includes('今天')
        && cap.includes('明天')
    );
    console.log('🔍 [handleFate] isInterpret =', isInterpret);

    if (isInterpret) {
        const firstName = msg.from.first_name || '';

        console.log('📝 [handleFate] 开始解析回复消息的牌义，caption:', cap);
        // 系统层指令：定义解析角色和风格
        const systemInstruction = '你是一个精通塔罗牌牌义解析的雌小鬼骰娘，使用幽默诙谐,带有情色比喻的日式HRPG风格的口气，自然的输出内容，绝对不要使用Markdown格式，不要假定用户的性别，使用更加中性的对用户称呼。';
        // 用户层指令：包含三张牌及对应位置
        const userPrompt = `下面是一组 ${firstName} 抽取的三张大阿卡那塔罗牌及位置：\n${cap}\n请首先分别对"昨天"、"今天"、"明天"位置上的塔罗牌含义进行基本解读，然后综合三张卡片给出一个包括[占卜结果、建议、谶语、未来趋势及注意事项]的解析。绝对不要使用Markdown格式。`;
        console.log('📨 [handleFate] 调用 API 的 prompt:', userPrompt);

        // 构造 API 请求体
        const payload = {
            contents: [{ parts: [{ text: userPrompt }] }],
            systemInstruction: { parts: [{ text: systemInstruction }] },
            generationConfig: { thinkingConfig: { thinkingBudget: -1 } }
        };
        console.log('📤 [handleFate] 发送到 Gemini API 的 payload:', JSON.stringify(payload));

        // 调用 Gemini Text API 生成解析内容
        const res = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': env.GOOGLE_API_KEY
                },
                body: JSON.stringify(payload)
            }
        );
        const { candidates } = await res.json();
        console.log('📨 [handleFate] 调用 API 的 响应:', candidates);

        let textOut = candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '解析失败，请稍后重试。';
        console.log('✅ [handleFate] 解析完成，内容:', textOut);
        textOut = textOut.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

        // 返回文本消息
        // 把 caption 的换行改成顿号或逗号，便于内嵌在一句话里
        const cardList = cap
            .split('\n')
            .map(line => line.split('：')[1])   // 提取每行的牌名部分
            .filter(Boolean)
            .join('、');

        const replyText =
            `${firstName} 你好，关于刚刚抽取的 ${cardList} 这三张牌的解读如下： <blockquote expandable>` +
            textOut +
            `</blockquote>`;

        // 返回文本消息
        return {
            method: 'sendMessage',
            chat_id: msg.chat.id,
            text: replyText,
            parse_mode: 'HTML'
        };
    }

    // --- 随机抽取 3 张大阿卡那牌流程 ---
    console.log('🎴 [handleFate] 执行抽牌流程');
    const pickCount = 3;
    const indices = [];
    while (indices.length < pickCount) {
        const idx = Math.floor(Math.random() * MAJOR_ARCANA.length);
        if (!indices.includes(idx)) {
            indices.push(idx);
            console.log(`🎲 [handleFate] 选中牌索引: ${idx} (${MAJOR_ARCANA[idx].name})`);
        }
    }

    const positions = ['昨天', '今天', '明天'];
    console.log('🕰️ [handleFate] 牌位映射顺序:', positions);

    // 为了布局美观，图片顺序调整为：今天、昨天、明天
    const order = [1, 0, 2];
    const media = order.map((posIdx, j) => {
        const card = MAJOR_ARCANA[indices[posIdx]];
        console.log(`📸 [handleFate] 准备发送图片: ${card.file}`);
        const entry = { type: 'photo', media: card.file };
        if (j === 0) {
            // 第一张图附带 caption，展示三张牌的原始位置
            const captionText = positions.map((pos, k) => `${pos}：${MAJOR_ARCANA[indices[k]].name}`).join('\n');
            entry.caption = captionText;
            entry.parse_mode = 'HTML';
            console.log('📝 [handleFate] 设置 caption:', captionText);
        }
        return entry;
    });

    // 返回 MediaGroup 格式
    const payload = {
        method: 'sendMediaGroup',
        chat_id: msg.chat.id,
        message_thread_id: msg.message_thread_id,
        media
    };
    console.log('📤 [handleFate] sendMediaGroup payload:', JSON.stringify(payload, null, 2));
    return payload;
}
