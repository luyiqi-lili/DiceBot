/* commands/fate.js */
// 提取 22 张大阿卡那塔罗牌
const MAJOR_ARCANA = [
  { name: '愚者', file: '0.jpg' },
  { name: '魔术师', file: '1.jpg' },
  { name: '女祭司', file: '2.jpg' },
/*  { name: '皇后', file: '3.jpg' },
  { name: '皇帝', file: '4.jpg' },
  { name: '教皇', file: '5.jpg' },
  { name: '恋人', file: '6.jpg' },
  { name: '战车', file: '7.jpg' },
  { name: '力量', file: '8.jpg' },
  { name: '隐者', file: '9.jpg' },
  { name: '命运之轮', file: '10.jpg' },
  { name: '正义', file: '11.jpg' },
  { name: '倒吊人', file: '12.jpg' },
  { name: '死亡', file: '13.jpg' },
  { name: '节制', file: '14.jpg' },
  { name: '恶魔', file: '15.jpg' },
  { name: '高塔', file: '16.jpg' },
  { name: '星星', file: '17.jpg' },
  { name: '月亮', file: '18.jpg' },
  { name: '太阳', file: '19.jpg' },
  { name: '审判', file: '20.jpg' },
  { name: '世界', file: '21.jpg' }
*/   
];

/**
 * 抽取 /fate 命令：随机取 3 张大阿卡那
 * @param {Object} msg Telegram 消息对象
 * @param {Env} env Cloudflare Worker 环境
 * @returns {Object} payload 用于 sendMediaGroup
 */
export async function handleFate(msg, env) {
  // 随机不重复选择 3 张牌
  const indices = [];
  while (indices.length < 3) {
    const idx = Math.floor(Math.random() * MAJOR_ARCANA.length);
    if (!indices.includes(idx)) indices.push(idx);
  }
  const positions = ['昨天', '今天', '明天'];

  // 构造 media 数组
  const media = indices.map((i, j) => ({
    type: 'photo',
    media: `https://raw.githubusercontent.com/luyiqi-lili/pic/refs/heads/main/${MAJOR_ARCANA[i].file}`,
    // 只在第一张附带 caption
    caption: j === 0
      ? `${positions.map((pos, k) => `${pos}：${MAJOR_ARCANA[indices[k]].name}`).join('\n')}`
      : undefined,
    parse_mode: j === 0 ? 'HTML' : undefined
  }));

  // 返回发送媒体组的 payload
  const payload = {
    chat_id: msg.chat.id,
    message_thread_id: msg.message_thread_id,
    media
  };
  return { method: 'sendMediaGroup', ...payload };
}
