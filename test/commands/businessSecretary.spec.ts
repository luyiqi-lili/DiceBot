import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));

import TgMessage from '../../src/lib/telegram';
import { handleBusinessSecretary } from '../../src/commands/businessSecretary';

function makeBusinessMessage(overrides: Record<string, unknown> = {}): any {
	return {
		type: 'business_message',
		chatId: 200,
		businessConnectionId: 'bc_123',
		text: '你好，今天可以预约吗？',
		message: {
			message_id: 22,
			business_connection_id: 'bc_123',
			chat: { id: 200, type: 'private', first_name: 'Customer' },
			from: { id: 200, is_bot: false, first_name: 'Customer' },
			text: '你好，今天可以预约吗？',
		},
		...overrides,
	};
}

describe('business secretary', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('sends a secretary reply on behalf of the connected business account', async () => {
		await handleBusinessSecretary(makeBusinessMessage(), { TOKEN: 'token' } as any);

		expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalledWith(
			expect.objectContaining({ TOKEN: 'token' }),
			expect.objectContaining({
				chat_id: 200,
				business_connection_id: 'bc_123',
				text: expect.stringContaining('秘书模式已接入'),
			}),
		);
	});

	it('acknowledges connection updates without sending messages', async () => {
		await handleBusinessSecretary({
			type: 'business_connection',
			chatId: 100,
			businessConnectionId: 'bc_owner',
			businessConnection: { id: 'bc_owner', is_enabled: true },
		} as any, { TOKEN: 'token' } as any);

		expect(vi.mocked(TgMessage.sendText)).not.toHaveBeenCalled();
	});

	it('does not send without a business connection id', async () => {
		await handleBusinessSecretary(makeBusinessMessage({ businessConnectionId: undefined }), { TOKEN: 'token' } as any);

		expect(vi.mocked(TgMessage.sendText)).not.toHaveBeenCalled();
	});
});
