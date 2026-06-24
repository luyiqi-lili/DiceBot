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
