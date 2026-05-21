import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── 模块 mock ──

vi.mock('../../src/lib/tgMessage', () => ({
	default: {
		sendText: vi.fn().mockResolvedValue({ ok: true }),
		send: vi.fn().mockResolvedValue({ ok: true }),
		buildInlineKeyboard: vi.fn((buttons: any) => ({ inline_keyboard: buttons })),
		editMessageText: vi.fn().mockResolvedValue({ ok: true }),
		deleteMessage: vi.fn().mockResolvedValue({ ok: true }),
		answerCallbackQuery: vi.fn().mockResolvedValue({ ok: true }),
		fetchChatMember: vi.fn().mockResolvedValue({ first_name: 'MockUser' }),
	},
}));

vi.mock('../../src/lib/coinService', () => ({
	getBalance: vi.fn().mockResolvedValue(500),
	getTreasury: vi.fn().mockResolvedValue(9999),
	transfer: vi.fn().mockResolvedValue({ ok: true, fromNew: 450, toNew: 550 }),
	addToTreasury: vi.fn().mockResolvedValue({ ok: true }),
	takeFromTreasury: vi.fn().mockResolvedValue({ ok: true }),
	sumAllUserBalances: vi.fn().mockResolvedValue(10000),
	TREASURY_KEY: '__treasury__',
}));

// ── 导入被测试模块 ──

import TgMessage from '../../src/lib/tgMessage';
import * as coinService from '../../src/lib/coinService';
import { handleCoin } from '../../src/commands/coin';

const MOCK_ENV = { COIN_DO: {} } as any;

/** 构造 ParsedUpdate */
function makeParsed(overrides: Record<string, any> = {}): any {
	const base: any = {
		type: 'message',
		chatId: -100999,
		threadId: undefined,
		from: { id: 12345, first_name: '测试用户' },
		isCommand: true,
		command: 'coin',
		args: [],
		text: '/coin',
		message: {
			message_id: 1,
			from: { id: 12345, first_name: '测试用户' },
			chat: { id: -100999 },
		},
	};
	return { ...base, ...overrides };
}

describe('handleCoin — /coin 无参数（余额查询）', () => {
	beforeEach(() => vi.clearAllMocks());

	it('查询余额并发送包含余额信息的文本', async () => {
		vi.mocked(coinService.getBalance).mockResolvedValue(888);
		await handleCoin(makeParsed(), MOCK_ENV);

		expect(coinService.getBalance).toHaveBeenCalledOnce();
		expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalledOnce();
		const call = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(call.chat_id).toBe(-100999);
		expect(call.text).toContain('888');
	});

	it('余额为 0 时正确显示', async () => {
		vi.mocked(coinService.getBalance).mockResolvedValue(0);
		await handleCoin(makeParsed(), MOCK_ENV);
		const call = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(call.text).toContain('0');
	});
});

describe('handleCoin — /coin pray', () => {
	beforeEach(() => vi.clearAllMocks());

	it('发送消息且不报错', async () => {
		vi.mocked(coinService.getBalance).mockResolvedValue(200);
		await handleCoin(makeParsed({ args: ['pray'] }), MOCK_ENV);
		expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalled();
	});
});

describe('handleCoin — /coin send <金额>', () => {
	beforeEach(() => vi.clearAllMocks());

	it('回复消息 → 有足够余额 → 调用 transfer', async () => {
		vi.mocked(coinService.getBalance).mockResolvedValue(500);
		// handler 使用 parsedMessage.message.reply_to_message 检查回复
		await handleCoin(
			makeParsed({
				args: ['send', '50'],
				message: {
					message_id: 1,
					from: { id: 12345, first_name: '测试用户' },
					chat: { id: -100999 },
					reply_to_message: {
						message_id: 99,
						from: { id: 67890, first_name: '收款人' },
						text: 'msg',
					},
				},
				isReply: true,
			}),
			MOCK_ENV,
		);
		// 通过 atomicTransferUserToUser → transfer
		expect(coinService.transfer).toHaveBeenCalled();
	});

	it('回复消息 → 余额不足 → 提示且不调 transfer', async () => {
		vi.mocked(coinService.getBalance).mockResolvedValue(10);
		await handleCoin(
			makeParsed({
				args: ['send', '50'],
				message: {
					message_id: 1,
					from: { id: 12345, first_name: '测试用户' },
					chat: { id: -100999 },
					reply_to_message: {
						message_id: 88,
						from: { id: 67890, first_name: '收款人' },
						text: 'msg',
					},
				},
				isReply: true,
			}),
			MOCK_ENV,
		);
		expect(coinService.transfer).not.toHaveBeenCalled();
		const call = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(call.text).toContain('转账失败');
		expect(call.text).toContain('insufficient');
	});

	it('未回复消息 → 提示回复', async () => {
		await handleCoin(makeParsed({ args: ['send', '50'] }), MOCK_ENV);
		const call = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(call.text).toContain('回复');
	});
});

describe('handleCoin — /coin check（管理员查询）', () => {
	beforeEach(() => vi.clearAllMocks());

	it('管理员查询国库 + 用户合计', async () => {
		vi.mocked(coinService.getTreasury).mockResolvedValue(5000);
		vi.mocked(coinService.sumAllUserBalances).mockResolvedValue(3000);
		await handleCoin(
			makeParsed({
				args: ['check'],
				from: { id: 8080375150, first_name: 'Admin' },
			}),
			MOCK_ENV,
		);
		expect(coinService.getTreasury).toHaveBeenCalled();
		expect(coinService.sumAllUserBalances).toHaveBeenCalled();
		const call = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(call.text).toContain('5000');
		expect(call.text).toContain('3000');
	});

	it('非管理员 → 权限提示', async () => {
		await handleCoin(makeParsed({ args: ['check'] }), MOCK_ENV);
		const call = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(call.text).toContain('权限');
	});
});

describe('handleCoin — /coin take <金额>（管理员取款）', () => {
	beforeEach(() => vi.clearAllMocks());

	it('管理员可从国库取款', async () => {
		vi.mocked(coinService.getTreasury).mockResolvedValue(10000);
		await handleCoin(
			makeParsed({
				args: ['take', '100'],
				from: { id: 8080375150, first_name: 'Admin' },
			}),
			MOCK_ENV,
		);
		expect(coinService.takeFromTreasury).toHaveBeenCalled();
	});
});
