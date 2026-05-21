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
		fetchChatMember: vi.fn().mockResolvedValue({ first_name: 'MockFish' }),
	},
}));

vi.mock('../../src/lib/coinService', () => ({
	getBalance: vi.fn().mockResolvedValue(100),
	addToTreasury: vi.fn().mockResolvedValue({ ok: true }),
	takeFromTreasury: vi.fn().mockResolvedValue({ ok: true }),
	transfer: vi.fn().mockResolvedValue({ ok: true }),
	getTreasury: vi.fn().mockResolvedValue(5000),
	TREASURY_KEY: '__treasury__',
}));

// ── 导入被测试模块 ──

import TgMessage from '../../src/lib/tgMessage';
import * as coinService from '../../src/lib/coinService';
import { handleFish } from '../../src/commands/fish';

/**
 * 构造 ParsedUpdate。
 * 钓鱼功能检查允许的房间组合，这里使用允许的 chatId / threadId
 */
function makeParsed(overrides: Record<string, any> = {}): any {
	return {
		type: 'message',
		chatId: -1002848481881,
		threadId: 66,
		from: { id: 12345, first_name: '钓鱼佬' },
		isCommand: true,
		command: 'fish',
		args: [],
		text: '/fish',
		message: {
			message_id: 1,
			from: { id: 12345, first_name: '钓鱼佬' },
			chat: { id: -1002848481881 },
			message_thread_id: 66,
		},
		...overrides,
	};
}

describe('handleFish — 命令识别', () => {
	beforeEach(() => vi.clearAllMocks());

	it('非 /fish 命令直接返回不发送消息', async () => {
		await handleFish(
			makeParsed({ command: 'roll', isCommand: true }),
			{} as any,
		);
		expect(vi.mocked(TgMessage.sendText)).not.toHaveBeenCalled();
	});
});

describe('handleFish — /fish check', () => {
	beforeEach(() => vi.clearAllMocks());

	it('发送池塘汇总', async () => {
		await handleFish(
			makeParsed({ args: ['check'] }),
			{ FISHING_RECORD_KV: { get: vi.fn().mockResolvedValue(null) } } as any,
		);
		expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalled();
		const call = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(call.chat_id).toBe(-1002848481881);
	});

	it('非法日期格式给出提示', async () => {
		await handleFish(
			makeParsed({ args: ['check', 'abcd'] }),
			{ FISHING_RECORD_KV: { get: vi.fn().mockResolvedValue(null) } } as any,
		);
		const call = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(call.text).toContain('日期格式错误');
	});
});

describe('handleFish — /fish allow（允许的房间检查）', () => {
	beforeEach(() => vi.clearAllMocks());

	it('不允许的房间返回提示', async () => {
		await handleFish(
			makeParsed({ chatId: -100111, threadId: 1, args: ['3'] }),
			{} as any,
		);
		// 不允许的房间对应的 chat 不会发提示（只有 -1002970430696 有提示）
		expect(vi.mocked(TgMessage.sendText)).not.toHaveBeenCalled();
	});
});

describe('handleFish — /fish <数量>（抛竿）', () => {
	beforeEach(() => vi.clearAllMocks());

	it('余额充足时进入钓鱼流程', async () => {
		vi.mocked(coinService.getBalance).mockResolvedValue(50);

		await handleFish(
			makeParsed({ args: ['3'] }),
			{
				COIN_DO: {} as any,
				FISHING_RECORD_KV: {
					get: vi.fn().mockResolvedValue(null),
					put: vi.fn().mockResolvedValue(undefined),
				},
			} as any,
		);

		// 应调用 coinService 扣费
		expect(coinService.addToTreasury).toHaveBeenCalled();
		// 应发送消息
		expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalled();
	});

	it('余额不足时提示余额', async () => {
		vi.mocked(coinService.getBalance).mockResolvedValue(0);

		await handleFish(
			makeParsed({ args: ['10'] }),
			{
				COIN_DO: {} as any,
				FISHING_RECORD_KV: {
					get: vi.fn().mockResolvedValue(null),
					put: vi.fn().mockResolvedValue(undefined),
				},
			} as any,
		);

		// 不应调用扣费
		expect(coinService.addToTreasury).not.toHaveBeenCalled();
		// 应发送余额不足提示
		const call = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(call.text).toContain('不足');
	});

	it('达到今日上限时提示', async () => {
		vi.mocked(coinService.getBalance).mockResolvedValue(100);

		// 模拟已有20次记录
		const existingRecord = JSON.stringify({
			date: new Date().toISOString().split('T')[0],
			count: 20,
			results: [{ baitCost: 1, hooked: false, fishValue: 0 }],
		});

		await handleFish(
			makeParsed({ args: ['1'] }),
			{
				COIN_DO: {} as any,
				FISHING_RECORD_KV: {
					get: vi.fn().mockResolvedValue(existingRecord),
					put: vi.fn().mockResolvedValue(undefined),
				},
			} as any,
		);

		expect(coinService.addToTreasury).not.toHaveBeenCalled();
		const call = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(call.text).toContain('20');
	});
});
