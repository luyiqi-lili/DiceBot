import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));

vi.mock('../../src/lib/wishCore', () => ({
	WISH_ADMIN_UID: 8080375150,
	isMeaningfulWish: vi.fn((text: string) => text.trim().length >= 4 && text !== 'test'),
	createWish: vi.fn().mockResolvedValue({ id: 42 }),
	approveWishSummaryItems: vi.fn().mockResolvedValue([{ id: 7, item_number: 1, title: '新增签到' }]),
}));

import TgMessage from '../../src/lib/telegram';
import { handleWish, handleWishApproval } from '../../src/commands/wish';
import * as wishCore from '../../src/lib/wishCore';

function makeParsed(o: any = {}): any {
	return {
		type: 'message',
		chatId: -1001,
		threadId: 89,
		from: { id: 12345, first_name: 'Alice' },
		isCommand: true,
		command: 'wish',
		args: ['增加', '签到'],
		message: { message_id: 10, chat: { id: -1001 }, message_thread_id: 89 },
		...o,
	};
}

describe('/wish', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(wishCore.isMeaningfulWish).mockImplementation((text: string) => text.trim().length >= 4 && text !== 'test');
		vi.mocked(wishCore.createWish).mockResolvedValue({ id: 42 } as any);
		vi.mocked(wishCore.approveWishSummaryItems).mockResolvedValue([{ id: 7, item_number: 1, title: '新增签到' }] as any);
	});

	it('stores a meaningful wish and replies with the wish id', async () => {
		await handleWish(makeParsed(), { DB: {} } as any);

		expect(wishCore.createWish).toHaveBeenCalledWith(expect.anything(), {
			chatId: -1001,
			threadId: 89,
			userId: 12345,
			firstName: 'Alice',
			body: '增加 签到',
		});
		expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('#42');
	});

	it('ignores obviously meaningless wishes', async () => {
		await handleWish(makeParsed({ args: ['test'] }), { DB: {} } as any);

		expect(wishCore.createWish).not.toHaveBeenCalled();
		expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('具体一点');
	});

	it('ignores non-admin approval replies', async () => {
		const handled = await handleWishApproval(makeParsed({
			isCommand: false,
			text: '1',
			replyToMessage: { message_id: 500, from: { is_bot: true } },
		}), { DB: {} } as any);

		expect(handled).toBe(false);
		expect(wishCore.approveWishSummaryItems).not.toHaveBeenCalled();
	});

	it('admin reply approves selected summary items', async () => {
		const handled = await handleWishApproval(makeParsed({
			isCommand: false,
			text: '1 2',
			from: { id: 8080375150, first_name: 'Admin' },
			replyToMessage: { message_id: 500, from: { is_bot: true } },
		}), { DB: {} } as any);

		expect(handled).toBe(true);
		expect(wishCore.approveWishSummaryItems).toHaveBeenCalledWith(expect.anything(), {
			messageId: 500,
			chatId: -1001,
			threadId: 89,
			itemNumbers: [1, 2],
			approvedBy: 8080375150,
		});
		expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('已批准');
	});
});
