import { describe, it, expect } from 'vitest';
import TgMessage from '../../src/lib/tgMessage';

describe('TgMessage.buildInlineKeyboard', () => {
	it('返回包含 inline_keyboard 的对象', () => {
		const kb = TgMessage.buildInlineKeyboard([
			[{ text: '按钮1', callback_data: 'data1' }],
		]);
		expect(kb).toEqual({
			inline_keyboard: [[{ text: '按钮1', callback_data: 'data1' }]],
		});
	});

	it('支持多行多列按钮', () => {
		const kb = TgMessage.buildInlineKeyboard([
			[
				{ text: 'A', callback_data: 'a' },
				{ text: 'B', callback_data: 'b' },
			],
			[{ text: 'C', url: 'https://example.com' }],
		]);
		expect(kb.inline_keyboard).toHaveLength(2);
		expect(kb.inline_keyboard[0]).toHaveLength(2);
		expect(kb.inline_keyboard[1]).toHaveLength(1);
	});

	it('空按钮数组生成空 inline_keyboard', () => {
		const kb = TgMessage.buildInlineKeyboard([]);
		expect(kb).toEqual({ inline_keyboard: [] });
	});
});

describe('TgMessage.parseUpdate — message 类型', () => {
	it('解析普通文本消息', () => {
		const update = {
			update_id: 1,
			message: {
				message_id: 100,
				from: { id: 123, first_name: 'Alice', is_bot: false },
				chat: { id: -100999, title: 'TestGroup' },
				text: 'hello world',
				date: 1700000000,
			},
		};

		const parsed = TgMessage.parseUpdate(update, 'MyBot');
		expect(parsed.type).toBe('message');
		expect(parsed.chatId).toBe(-100999);
		expect(parsed.text).toBe('hello world');
		expect(parsed.from?.first_name).toBe('Alice');
		expect(parsed.isCommand).toBe(false);
	});

	it('解析命令消息 /roll 2d6', () => {
		const update = {
			update_id: 2,
			message: {
				message_id: 101,
				from: { id: 456, first_name: 'Bob' },
				chat: { id: -100999 },
				text: '/roll 2d6',
				date: 1700000001,
			},
		};

		const parsed = TgMessage.parseUpdate(update, 'MyBot');
		expect(parsed.type).toBe('message');
		expect(parsed.isCommand).toBe(true);
		expect(parsed.command).toBe('roll');
		expect(parsed.args).toEqual(['2d6']);
	});

	it('解析命令 /roll 不带参数', () => {
		const update = {
			update_id: 3,
			message: {
				message_id: 102,
				from: { id: 789, first_name: 'Charlie' },
				chat: { id: -100999 },
				text: '/roll',
				date: 1700000002,
			},
		};

		const parsed = TgMessage.parseUpdate(update, 'MyBot');
		expect(parsed.isCommand).toBe(true);
		expect(parsed.command).toBe('roll');
		expect(parsed.args).toEqual([]);
	});

	it('解析快捷命令 /rd10', () => {
		const update = {
			update_id: 4,
			message: {
				message_id: 103,
				from: { id: 111, first_name: 'Dave' },
				chat: { id: -100999 },
				text: '/rd10',
				date: 1700000003,
			},
		};

		const parsed = TgMessage.parseUpdate(update, 'MyBot');
		expect(parsed.isCommand).toBe(true);
		expect(parsed.command).toBe('r');
		expect(parsed.args).toEqual(['d10']);
	});

	it('解析带 @Bot 的命令 @MyBot /roll 1d100', () => {
		const update = {
			update_id: 5,
			message: {
				message_id: 104,
				from: { id: 222, first_name: 'Eve' },
				chat: { id: -100999 },
				text: '@MyBot /roll 1d100',
				date: 1700000004,
			},
		};

		const parsed = TgMessage.parseUpdate(update, 'MyBot');
		expect(parsed.isCommand).toBe(true);
		expect(parsed.command).toBe('roll');
		expect(parsed.args).toEqual(['1d100']);
	});

	it('解析下划线连写命令 /coin_check', () => {
		const update = {
			update_id: 6,
			message: {
				message_id: 105,
				from: { id: 333, first_name: 'Frank' },
				chat: { id: -100999 },
				text: '/coin_check',
				date: 1700000005,
			},
		};

		const parsed = TgMessage.parseUpdate(update, 'MyBot');
		expect(parsed.isCommand).toBe(true);
		expect(parsed.command).toBe('coin');
		expect(parsed.args).toEqual(['check']);
	});

	it('解析带 message_thread_id（论坛话题）的消息', () => {
		const update = {
			update_id: 7,
			message: {
				message_id: 106,
				from: { id: 444, first_name: 'Grace' },
				chat: { id: -100999 },
				text: '/help',
				message_thread_id: 42,
				date: 1700000006,
			},
		};

		const parsed = TgMessage.parseUpdate(update, 'MyBot');
		expect(parsed.threadId).toBe(42);
	});
});

describe('TgMessage.parseUpdate — reply 检测', () => {
	it('回复消息时 isReply 为 true', () => {
		const update = {
			update_id: 8,
			message: {
				message_id: 107,
				from: { id: 555, first_name: 'Hank' },
				chat: { id: -100999 },
				text: '/book a cool snippet',
				reply_to_message: {
					message_id: 88,
					from: { id: 555, first_name: 'Hank' },
					text: 'original message',
				},
				date: 1700000007,
			},
		};

		const parsed = TgMessage.parseUpdate(update, 'MyBot');
		expect(parsed.isReply).toBe(true);
		expect(parsed.replyToMessage?.message_id).toBe(88);
	});

	it('非回复消息时 isReply 为 false', () => {
		const update = {
			update_id: 9,
			message: {
				message_id: 108,
				from: { id: 666, first_name: 'Ivy' },
				chat: { id: -100999 },
				text: 'plain text',
				date: 1700000008,
			},
		};

		const parsed = TgMessage.parseUpdate(update, 'MyBot');
		expect(parsed.isReply).toBe(false);
	});
});

describe('TgMessage.parseUpdate — 其他事件类型', () => {
	it('解析 callback_query（JSON callback_data）', () => {
		const update = {
			update_id: 10,
			callback_query: {
				id: 'cb_001',
				from: { id: 777, first_name: 'Jack' },
				message: {
					message_id: 200,
					chat: { id: -100999 },
					text: 'some message',
				},
				data: JSON.stringify({ type: '21', action: 'draw' }),
			},
		};

		const parsed = TgMessage.parseUpdate(update, 'MyBot');
		expect(parsed.type).toBe('callback_query');
		expect(parsed.chatId).toBe(-100999);
		expect(parsed.callbackData).toEqual({ type: '21', action: 'draw' });
	});

	it('解析 inline_query', () => {
		const update = {
			update_id: 11,
			inline_query: {
				id: 'iq_001',
				from: { id: 888, first_name: 'Kate' },
				query: 'hello',
				offset: '',
			},
		};

		const parsed = TgMessage.parseUpdate(update, 'MyBot');
		expect(parsed.type).toBe('inline_query');
		expect(parsed.text).toBe('hello');
		expect(parsed.inlineQueryId).toBe('iq_001');
		expect(parsed.from?.id).toBe(888);
	});

	it('解析 forum_topic_edited', () => {
		const update = {
			update_id: 12,
			message: {
				message_id: 109,
				chat: { id: -100999 },
				from: { id: 999, first_name: 'Admin' },
				message_thread_id: 42,
				forum_topic_edited: { name: 'New Title ❤️' },
				date: 1700000009,
			},
		};

		const parsed = TgMessage.parseUpdate(update, 'MyBot');
		expect(parsed.type).toBe('topic_edited');
		expect(parsed.forumTopicEdited?.name).toBe('New Title ❤️');
	});

	it('解析 edited_message', () => {
		const update = {
			update_id: 13,
			edited_message: {
				message_id: 300,
				from: { id: 101, first_name: 'Leo' },
				chat: { id: -100999 },
				text: 'edited text',
				date: 1700000010,
			},
		};

		const parsed = TgMessage.parseUpdate(update, 'MyBot');
		expect(parsed.type).toBe('edited_message');
		expect(parsed.text).toBe('edited text');
	});

	it('解析 channel_post', () => {
		const update = {
			update_id: 14,
			channel_post: {
				message_id: 400,
				chat: { id: -100777 },
				text: 'channel broadcast',
				date: 1700000011,
			},
		};

		const parsed = TgMessage.parseUpdate(update, 'MyBot');
		expect(parsed.type).toBe('channel_post');
		expect(parsed.chatId).toBe(-100777);
		expect(parsed.text).toBe('channel broadcast');
	});

	it('未知类型返回 unknown', () => {
		const parsed = TgMessage.parseUpdate({}, 'MyBot');
		expect(parsed.type).toBe('unknown');
		expect(parsed.chatId).toBe(0);
	});
});
