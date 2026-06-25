import { describe, expect, it } from 'vitest';
import { parsedUpdateFromContext } from '../../src/lib/telegram';

describe('parsedUpdateFromContext business updates', () => {
	it('parses business_connection updates', () => {
		const businessConnection = {
			id: 'bc_1',
			user: { id: 100, is_bot: false, first_name: 'Owner' },
			user_chat_id: 100,
			date: 1782270000,
			can_reply: true,
			is_enabled: true,
		};

		const parsed = parsedUpdateFromContext({ update: { update_id: 1, business_connection: businessConnection }, businessConnection } as any);

		expect(parsed.type).toBe('business_connection');
		expect(parsed.chatId).toBe(100);
		expect(parsed.from?.id).toBe(100);
		expect(parsed.businessConnectionId).toBe('bc_1');
		expect(parsed.businessConnection).toBe(businessConnection);
	});

	it('parses business_message updates and commands', () => {
		const businessMessage = {
			message_id: 22,
			business_connection_id: 'bc_2',
			date: 1782270001,
			chat: { id: 200, type: 'private', first_name: 'Customer' },
			from: { id: 200, is_bot: false, first_name: 'Customer' },
			text: '/echo hello',
		};

		const parsed = parsedUpdateFromContext({ update: { update_id: 2, business_message: businessMessage }, businessMessage } as any, 'DiceBot');

		expect(parsed.type).toBe('business_message');
		expect(parsed.chatId).toBe(200);
		expect(parsed.from?.id).toBe(200);
		expect(parsed.message).toBe(businessMessage);
		expect(parsed.businessConnectionId).toBe('bc_2');
		expect(parsed.isCommand).toBe(true);
		expect(parsed.command).toBe('echo');
		expect(parsed.args).toEqual(['hello']);
	});

	it('parses deleted_business_messages updates', () => {
		const deletedBusinessMessages = {
			business_connection_id: 'bc_3',
			chat: { id: 300, type: 'private', first_name: 'Customer' },
			message_ids: [7, 8],
		};

		const parsed = parsedUpdateFromContext({ update: { update_id: 3, deleted_business_messages: deletedBusinessMessages }, deletedBusinessMessages } as any);

		expect(parsed.type).toBe('deleted_business_messages');
		expect(parsed.chatId).toBe(300);
		expect(parsed.businessConnectionId).toBe('bc_3');
		expect(parsed.deletedBusinessMessages).toBe(deletedBusinessMessages);
	});
});

describe('parsedUpdateFromContext message reactions', () => {
	it('parses message_reaction updates', () => {
		const messageReaction = {
			chat: { id: -100999, type: 'supergroup', title: 'Dice' },
			message_id: 42,
			user: { id: 100, is_bot: false, first_name: 'Reactor' },
			date: 1782270002,
			old_reaction: [],
			new_reaction: [{ type: 'emoji', emoji: '🔥' }],
		};

		const parsed = parsedUpdateFromContext({ update: { update_id: 5, message_reaction: messageReaction }, messageReaction } as any);

		expect(parsed.type).toBe('message_reaction');
		expect(parsed.chatId).toBe(-100999);
		expect(parsed.from?.id).toBe(100);
		expect(parsed.messageReaction).toBe(messageReaction);
	});
});

describe('parsedUpdateFromContext forum topic replies', () => {
	it('parses forum topic creation service messages', () => {
		const message = {
			message_id: 210,
			message_thread_id: 210,
			is_topic_message: true,
			date: 1782270001,
			chat: { id: -100999, type: 'supergroup' },
			from: { id: 222, is_bot: false, first_name: 'Admin' },
			forum_topic_created: { name: '酒馆', icon_color: 0x6fb9f0 },
		};

		const parsed = parsedUpdateFromContext({ update: { update_id: 6, message }, message } as any, 'DiceBot');

		expect(parsed.type).toBe('topic_created');
		expect(parsed.chatId).toBe(-100999);
		expect(parsed.threadId).toBe(210);
		expect(parsed.forumTopicCreated).toEqual({ name: '酒馆', icon_color: 0x6fb9f0 });
	});

	it('does not treat the implicit forum topic root reply as a user reply', () => {
		const topicRoot = {
			message_id: 89,
			from: { id: 111, is_bot: false, first_name: 'Topic Creator' },
			chat: { id: -100999, type: 'supergroup' },
			date: 1782270000,
			forum_topic_created: { name: 'Dice', icon_color: 0x6fb9f0 },
		};
		const message = {
			message_id: 120,
			message_thread_id: 89,
			is_topic_message: true,
			date: 1782270001,
			chat: { id: -100999, type: 'supergroup' },
			from: { id: 222, is_bot: false, first_name: 'Admin' },
			text: '/coin check',
			reply_to_message: topicRoot,
		};

		const parsed = parsedUpdateFromContext({ update: { update_id: 4, message }, message } as any, 'DiceBot');

		expect(parsed.threadId).toBe(89);
		expect(parsed.isCommand).toBe(true);
		expect(parsed.command).toBe('coin');
		expect(parsed.args).toEqual(['check']);
		expect(parsed.isReply).toBe(false);
		expect(parsed.replyToMessage).toBeUndefined();
	});
});
