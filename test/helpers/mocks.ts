/**
 * @file test/helpers/mocks.ts
 * @description 测试用统一 Mock 工厂。
 *   所有测试文件通过 vi.mock + async import 引用此处的 mock 定义。
 *   修改 Mock 行为时只需改此文件，所有测试文件同步生效。
 */

import { vi } from 'vitest';

// ── TgMessage ──────────────────────────────────────────
export const mockTgMessage = {
	default: {
		sendText: vi.fn().mockResolvedValue({ ok: true }),
		send: vi.fn().mockResolvedValue({ ok: true }),
		buildInlineKeyboard: vi.fn((b: any) => ({ inline_keyboard: b })),
		editMessageText: vi.fn().mockResolvedValue({ ok: true }),
		deleteMessage: vi.fn().mockResolvedValue({ ok: true }),
		answerCallbackQuery: vi.fn().mockResolvedValue({ ok: true }),
		sendPhoto: vi.fn().mockResolvedValue({ ok: true }),
		fetchChatMember: vi.fn().mockResolvedValue({ first_name: 'MockUser' }),
	},
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

// ── 重置所有 mock ──────────────────────────────────────
export function resetMocks(): void {
	for (const fn of Object.values(mockTgMessage.default)) {
		if (typeof fn?.mockReset === 'function') fn.mockReset();
	}
	for (const key of Object.keys(mockCoinService)) {
		const val = (mockCoinService as any)[key];
		if (typeof val?.mockReset === 'function') val.mockReset();
	}
}
