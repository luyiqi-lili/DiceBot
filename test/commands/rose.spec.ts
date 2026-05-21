import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/tgMessage', () => ({
	default: {
		sendText: vi.fn().mockResolvedValue({ ok: true }),
		send: vi.fn().mockResolvedValue({ ok: true }),
		buildInlineKeyboard: vi.fn((b: any) => ({ inline_keyboard: b })),
		fetchChatMember: vi.fn().mockResolvedValue({ first_name: 'RoseTarget' }),
	},
}));

vi.mock('../../src/lib/coinService', () => ({
	getBalance: vi.fn().mockResolvedValue(50),
	addToTreasury: vi.fn().mockResolvedValue({ ok: true }),
	takeFromTreasury: vi.fn().mockResolvedValue({ ok: true }),
	transfer: vi.fn().mockResolvedValue({ ok: true }),
	TREASURY_KEY: '__treasury__',
}));

import TgMessage from '../../src/lib/tgMessage';

function makeMsg(overrides: Record<string, any> = {}): any {
	return {
		type: 'message', chatId: -100999, threadId: undefined,
		from: { id: 1, first_name: 'Admirer' }, isCommand: true, command: 'rose', args: [],
		text: '/rose', message: { message_id: 1, from: { id: 1, first_name: 'Admirer' }, chat: { id: -100999 } },
		...overrides,
	};
}

const MOCK_KV = {
	AFFECTION_KV: {
		get: vi.fn().mockResolvedValue(null),
		put: vi.fn().mockResolvedValue(undefined),
		list: vi.fn().mockResolvedValue({ keys: [] }),
	},
	COIN_DO: {},
	TOKEN: 't',
};

import { handleRose } from '../../src/commands/rose';

describe('/rose', () => {
	beforeEach(() => vi.clearAllMocks());

	it('未回复时提示需要回复', async () => {
		await handleRose(makeMsg(), MOCK_KV as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('回复');
	});

	it('回复时查询好感度', async () => {
		await handleRose(makeMsg({
			isReply: true,
			replyToMessage: { from: { id: 2, first_name: 'Lover' } },
		}), MOCK_KV as any);
		expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalled();
	});

	it('/rose check 查询好感度排行', async () => {
		await handleRose(makeMsg({
			args: ['check'],
			isReply: true,
			replyToMessage: { from: { id: 2, first_name: 'Lover' } },
		}), MOCK_KV as any);
		expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalled();
	});

	it('/rose send 送花', async () => {
		MOCK_KV.AFFECTION_KV.get.mockResolvedValue(null);
		await handleRose(makeMsg({
			args: ['send'],
			isReply: true,
			replyToMessage: { from: { id: 2, first_name: 'Lover' } },
		}), MOCK_KV as any);
		expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalled();
	});
});
