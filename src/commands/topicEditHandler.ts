// topicEditHandler.ts
// 专门处理论坛话题标题编辑事件的模块
// 详细中文注释和日志

export interface Env {
    // 绑定到 Cloudflare Workers KV 的命名空间
    TOPIC_KV: KVNamespace;
    // Telegram Bot 的 token，需在 wrangler.toml 中配置
    TOKEN: string;
}

export async function handleTopicEdited(update: any, env: any): Promise<Response | undefined> {
    console.log('收到 update:', JSON.stringify(update));

    const msg = update.message;
    // 1. 只处理来自“话题”的编辑事件（forum_topic_edited）
    const editInfo = msg?.forum_topic_edited;
    if (!msg || !msg.is_topic_message || !editInfo) {
        console.log('无话题标题编辑事件，跳过处理');
        return;
    }



    // 2. 提取必要字段
    const chatId: number = msg.chat.id;
    const threadId: number = msg.message_thread_id;
    const newTitle: string | undefined = editInfo.name;
    if (typeof newTitle !== 'string') {
        console.log('仅更新了图标，无标题文本变更，跳过处理');
        return;
    }

    // 3. 白名单配置：只监听特定群组和话题
    const whitelist: Record<number, number[]> = {
        [-1002848481881]: [104, 69],
        [-1002742074355]: [
            184, 176, 33861, 205, 382, 88693, 168, 7571,
            211, 361, 244, 234072, 165, 258, 182, 194,
            141941, 251, 389, 409, 48
        ],
    };
    const allowedThreads = whitelist[chatId];
    if (!allowedThreads || !allowedThreads.includes(threadId)) {
        console.log(`chat_id=${chatId} threadId=${threadId} 不在白名单，跳过`);
        return;
    }
    console.log(`检测到白名单内的话题编辑：chat_id=${chatId}, threadId=${threadId}, newTitle="${newTitle}"`);

    // 4. 预设每个房间的友好名称和跳转链接（硬编码）
    const roomMeta: Record<number, { name: string; link: string }> = {
        184: { name: '音', link: 'https://t.me/c/2742074355/184' },
        176: { name: '花音', link: 'https://t.me/c/2742074355/176' },
        33861: { name: '琉璃', link: 'https://t.me/c/2742074355/33861' },
        205: { name: '柔柔', link: 'https://t.me/c/2742074355/205' },
        382: { name: '耀阳', link: 'https://t.me/c/2742074355/382' },
        88693: { name: '缘宝', link: 'https://t.me/c/2742074355/88693' },
        168: { name: '兰兰', link: 'https://t.me/c/2742074355/168' },
        7571: { name: '小母龙', link: 'https://t.me/c/2742074355/7571' },
        211: { name: '小小M', link: 'https://t.me/c/2742074355/211' },
        361: { name: '满月', link: 'https://t.me/c/2742074355/361' },
        244: { name: '闪闪', link: 'https://t.me/c/2742074355/244' },
        234072: { name: '落雪', link: 'https://t.me/c/2742074355/234072' },
        165: { name: '酥酥', link: 'https://t.me/c/2742074355/165' },
        258: { name: '汐汐', link: 'https://t.me/c/2742074355/258' },
        182: { name: '软软', link: 'https://t.me/c/2742074355/182' },
        194: { name: '娜娜', link: 'https://t.me/c/2742074355/194' },
        141941: { name: '出灰', link: 'https://t.me/c/2742074355/141941' },
        251: { name: '玉', link: 'https://t.me/c/2742074355/251' },
        389: { name: '审判庭', link: 'https://t.me/c/2742074355/389' },
        409: { name: '地下室', link: 'https://t.me/c/2742074355/409' },
        48: { name: '酒馆', link: 'https://t.me/c/2742074355/48' },
        // 如有新增房间，按上述格式添加
    };

    // 5. 从 KV 中读取全局状态
    const KV_KEY = 'topic_status:single';
    let record = await env.TOPIC_KV.get(KV_KEY, 'json') as {
        message_id: number | null;
        titles: Record<string, string>;
    } | null;

    // 6. 初始化 KV（首次运行）
    if (!record) {
        console.log('KV 中无记录，进行初始化');
        record = { message_id: null, titles: {} };
        for (const [gid, threads] of Object.entries(whitelist)) {
            for (const tid of threads) {
                record.titles[tid.toString()] = '标题';
            }
        }
        await env.TOPIC_KV.put(KV_KEY, JSON.stringify(record));
        console.log('KV 初始化完成:', record);
    }

    // 7. 更新本地记录：无论是否含 ❤️，都先存储新标题
    const prevTitle = record.titles[threadId.toString()] || '等待初始化标题';
    record.titles[threadId.toString()] = newTitle;
    await env.TOPIC_KV.put(KV_KEY, JSON.stringify(record));
    console.log(`已更新 KV 中 threadId=${threadId} 的标题，从 "${prevTitle}" 到 "${newTitle}"`);

    // 8. 判断是否触发提示：修改前后至少一端包含 ❤️
    const hasHeartBefore = prevTitle.includes('❤️');
    const hasHeartAfter = newTitle.includes('❤️');
    if (!hasHeartBefore && !hasHeartAfter) {
        console.log('前后均无 ❤️，仅更新内部记录，不发送提示');
        return;
    }

    // 9. 在固定目标话题中只保留一条提示
    const targetChatId = -1002848481881;
    const targetThreadId = 66;

    // 9.1 删除上一次提示消息
    if (record.message_id) {
        const deleteUrl = `https://api.telegram.org/bot${env.TOKEN}/deleteMessage?chat_id=${targetChatId}&message_id=${record.message_id}`;
        try {
            console.log(`尝试删除上次提示消息 id=${record.message_id}`);
            await fetch(deleteUrl);
            console.log('上次提示消息删除成功');
        } catch (err) {
            console.error('删除上次提示消息失败', err);
        }
    }

    // 9.2 构造新提示内容（HTML 格式），❤️房间优先，其余在后，并用 <blockquote expandable> 包裹
    let content = `<b>${roomMeta[threadId]?.name || threadId}</b> 状态从「${prevTitle}」变成了「${newTitle}」\n\n`;
    content += `<b>当前所有房间的状态：</b>\n`;


    // 按是否含 ❤️ 分组
    const entries = Object.entries(record.titles);
    const heartEntries = entries.filter(([_, title]) => title.includes('❤️'));
    const normalEntries = entries.filter(([_, title]) => !title.includes('❤️'));

    // 先输出含 ❤️ 的
    for (const [tid, title] of heartEntries) {
        const num = Number(tid);
        const meta = roomMeta[num];
        if (meta?.link) {
            content += `<a href="${meta.link}">${meta.name}: ${title}</a>\n`;
        } else {
            content += `${tid}: ${title}\n`;
        }
    }
    content += `<blockquote expandable>`;
    // 再输出不含 ❤️ 的
    for (const [tid, title] of normalEntries) {
        const num = Number(tid);
        const meta = roomMeta[num];
        if (meta?.link) {
            content += `<a href="${meta.link}">${meta.name}: ${title}</a>\n`;
        } else {
            content += `${tid}: ${title}\n`;
        }
    }

    content += `</blockquote>\n`;









    // 9.3 发送新提示
    const sendUrl = `https://api.telegram.org/bot${env.TOKEN}/sendMessage`;
    const body = {
        chat_id: targetChatId,
        message_thread_id: targetThreadId,
        text: content,
        parse_mode: "HTML",
    };
    try {
        console.log('发送新提示消息，url：', sendUrl);
        console.log('发送新提示消息，内容：', body);
        const resp = await fetch(sendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await resp.json();
        if (data.ok && data.result?.message_id) {
            record.message_id = data.result.message_id;
            await env.TOPIC_KV.put(KV_KEY, JSON.stringify(record));
            console.log('新提示消息发送成功，message_id=', record.message_id);
        } else {
            console.error('发送新提示消息失败，Telegram 返回：', data);
        }
    } catch (err) {
        console.error('发送新提示消息过程中发生异常', err);
    }

    return;
}
