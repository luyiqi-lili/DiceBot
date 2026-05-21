/**
 * @file test/helpers/mocks.ts
 * @description 测试用统一 Mock 工厂。
 *   所有测试文件通过 vi.mock + async import 引用此处的 mock 定义。
 *   修改 Mock 行为时只需改此文件，所有测试文件同步生效。
 */

import { vi } from 'vitest';

// ── TgMessage 对象（default export）──────────────────────
export const mockTgMessageObj = {
	sendText: vi.fn().mockResolvedValue({ ok: true }),
	send: vi.fn().mockResolvedValue({ ok: true }),
	buildInlineKeyboard: vi.fn((b: any) => ({ inline_keyboard: b })),
	editMessageText: vi.fn().mockResolvedValue({ ok: true }),
	deleteMessage: vi.fn().mockResolvedValue({ ok: true }),
	answerCallbackQuery: vi.fn().mockResolvedValue({ ok: true }),
	sendPhoto: vi.fn().mockResolvedValue({ ok: true }),
	fetchChatMember: vi.fn().mockResolvedValue({ first_name: 'MockUser' }),
};

// ── coinService ──────────────────────────────────────────
export const mockCoinService = {
	getBalance: vi.fn().mockResolvedValue(500),
	getTreasury: vi.fn().mockResolvedValue(9999),
	transfer: vi.fn().mockResolvedValue({ ok: true, fromNew: 450, toNew: 550 }),
	addToTreasury: vi.fn().mockResolvedValue({ ok: true }),
	takeFromTreasury: vi.fn().mockResolvedValue({ ok: true }),
	sumAllUserBalances: vi.fn().mockResolvedValue(10000),
	TREASURY_KEY: '__treasury__',
};

/** extractCmdContext 纯函数实现 — 保持与 src/lib/tgMessage 一致 */
export function mockExtractCmdContext(parsed: any) {
	return {
		chatId: parsed.chatId ?? parsed.message?.chat?.id ?? 0,
		threadId: parsed.threadId ?? parsed.message?.message_thread_id ?? undefined,
		from: parsed.from ?? parsed.message?.from,
		args: Array.isArray(parsed.args) ? parsed.args.slice() : [],
	};
}

/** 完整模块 mock — 包含 default 和 named exports，供 test 文件通过 vi.mock async import 使用 */
export const mockTgMessageModule = {
	default: mockTgMessageObj,
	extractCmdContext: mockExtractCmdContext,
};

// ── 重置所有 mock ──────────────────────────────────────
export function resetMocks(): void {
	for (const fn of Object.values(mockTgMessageObj)) {
		if (typeof fn?.mockReset === 'function') fn.mockReset();
	}
	for (const key of Object.keys(mockCoinService)) {
		const val = (mockCoinService as any)[key];
		if (typeof val?.mockReset === 'function') val.mockReset();
	}
}
