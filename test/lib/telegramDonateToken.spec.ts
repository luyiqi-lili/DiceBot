import { describe, expect, it } from 'vitest';
import { parsedUpdateFromContext } from '../../src/lib/telegram';

describe('Telegram donation command parsing', () => {
	it('parses /donate_token through the donate compatibility route without losing arguments', () => {
		const message = {
			message_id: 1,
			chat: { id: 123, type: 'private' },
			from: { id: 123, first_name: 'Donor' },
			text: '/donate_token gemini validation_only AIza-private-token',
		};
		const parsed = parsedUpdateFromContext({ update: { update_id: 1, message }, message } as any, 'DiceBot');

		expect(parsed.command).toBe('donate');
		expect(parsed.args).toEqual(['token', 'gemini', 'validation_only', 'AIza-private-token']);
		expect(parsed.message?.chat?.type).toBe('private');
	});
});
