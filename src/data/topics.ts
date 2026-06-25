/**
 * Known forum topic display names.
 *
 * Telegram regular message updates do not reliably include the forum topic
 * title, so commands that summarize historic messages need this static
 * fallback when D1 rows have an empty topic_name.
 */

export const TOPIC_ROOM_NAMES: Record<number, Record<number, string>> = {
	[-1002742074355]: {
		302677: '匹配区',
		1161: '紫罗兰之花',
		48: '酒馆',
		62: '教堂',
		284999: '艺术馆',
		194: '伊莲娜',
		232551: '摄影棚',
		514627: '紫罗兰学院',
		251: '玉宝',
		467843: '客房1',
		215: '女皇',
		74050: '客房2',
		338: '行商小屋',
		448929: 'FuFu',
		389: '审判庭',
		55106: '跑团',
		584924: '委托墙',
		205: '图书馆',
		244: '闪闪',
		246576: '广场',
		301724: '大会堂',
		497929: '爬塔',
		382: '耀阳',
		141941: 'kago',
		165: '酥酥',
		21237: '人设',
		182: '软软',
		33861: '琉璃',
		258: '汐汐',
		334: '设定',
		444725: '万事屋',
		454656: '牡丹群岛',
		361: '满月',
		88693: '缘宝',
		621178: 'YOLO',
		202: '后花园',
		345: '桌游',
		234072: '落雪',
		211: '小小M',
		503851: '娜链',
		80: '电竞',
		176: '魔法少女',
		168: '兰兰',
		7571: '小母龙',
		184: '音',
		638714: '内务部',
	},
	[-1002970430696]: {
		302677: '匹配区',
		184: '紫罗兰之花',
		210: '酒馆',
		158: '艺术馆',
		168: '摄影棚',
		314: '审判庭',
		180: '闪闪',
		178: '广场',
		67: '大会堂',
		1: '大会堂',
		182: '爬塔',
		162: '耀阳',
		172: '酥酥',
		155: '人设',
		177: '软软',
		176: '琉璃',
		170: '万事屋',
		166: '牡丹群岛',
		175: '缘宝',
		160: '桌游',
		161: '电竞',
		159: '魔法少女',
		171: '兰兰',
		174: '小母龙',
		173: '音',
		89: '魔枢',
		157: '神殿',
		179: '农场',
	},
};

export function getKnownTopicRoomName(chatId: number | string | null | undefined, threadId: number | string | null | undefined): string | null {
	const chatKey = Number(chatId);
	const threadKey = Number(threadId);
	if (!Number.isFinite(chatKey) || !Number.isFinite(threadKey)) return null;
	return TOPIC_ROOM_NAMES[chatKey]?.[threadKey] ?? null;
}
