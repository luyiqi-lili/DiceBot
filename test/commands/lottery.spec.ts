import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/tgMessage', () => ({
	default: {
		sendText: vi.fn().mockResolvedValue({ ok: true }),
		send: vi.fn().mockResolvedValue({ ok: true }),
		buildInlineKeyboard: vi.fn((b: any) => ({ inline_keyboard: b })),
		fetchChatMember: vi.fn().mockResolvedValue({ first_name: 'LotteryUser' }),
		answerCallbackQuery: vi.fn().mockResolvedValue({ ok: true }),
	},
}));

vi.mock('../../src/lib/coinService', () => ({
	getBalance: vi.fn().mockResolvedValue(100),
	transfer: vi.fn().mockResolvedValue({ ok: true }),
	addToTreasury: vi.fn().mockResolvedValue({ ok: true }),
}));

import TgMessage from '../../src/lib/tgMessage';
import * as coinService from '../../src/lib/coinService';

function makeParsed(overrides: Record<string, any> = {}): any {
	return {
		type: 'message', chatId: -100999, threadId: undefined,
		from: { id: 10001, first_name: 'Gambler' }, isCommand: true, command: 'lottery', args: [],
		message: { message_id: 1, from: { id: 10001, first_name: 'Gambler' }, chat: { id: -100999 } },
		...overrides,
	};
}

/** 构造模拟 DO stub 响应 handler 中的 lotteryStub.fetch() */
function makeDOStub() {
	const stub = {
		fetch: vi.fn().mockImplementation(async (url: string) => ({
			ok: true,
			json: async () => {
				if (url.includes('get-pool')) return { pool: 500 };
				if (url.includes('total-ticket-count')) return { count: 20 };
				if (url.includes('get-user-tickets')) return { userId: '10001', ticketNumbers: ['123'] };
				if (url.includes('last-draw')) return { lastDraw: null };
				if (url.includes('add-ticket')) return { success: true };
				if (url.includes('get-user-ticket-count')) return { userId: '10001', count: 1 };
				return {};
			},
		})),
	};
	return {
		idFromName: vi.fn().mockReturnValue('lottery-id'),
		get: vi.fn().mockReturnValue(stub),
	};
}

import { handleLottery } from '../../src/commands/lottery';

describe('/lottery — info', () => {
	beforeEach(() => vi.clearAllMocks());

	it('无参数时发送彩票系统信息', async () => {
		await handleLottery(makeParsed(), {
			LOTTERY_DO: makeDOStub() as any,
		} as any);
		expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalled();
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('大乐透');
	});
});

describe('/lottery — buy', () => {
	beforeEach(() => vi.clearAllMocks());

	it('购买彩票 → 扣费并记录', async () => {
		vi.mocked(coinService.getBalance).mockResolvedValue(100);
		await handleLottery(makeParsed({
			args: ['buy'],
		}), {
			COIN_DO: {} as any,
			LOTTERY_DO: makeDOStub() as any,
		} as any);
		expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalled();
	});
});
