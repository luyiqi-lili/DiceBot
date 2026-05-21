import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/tgMessage', () => ({
	default: { answerCallbackQuery: vi.fn().mockResolvedValue({}) },
}));

// 模拟 globalThis.fetch 防止超时
const origFetch = globalThis.fetch;
globalThis.fetch = vi.fn().mockResolvedValue({
	ok: true,
	json: vi.fn().mockResolvedValue({ ok: true, result: {} }),
} as any);

import { handleDeleteMessage } from '../../src/commands/deleteMessage';

describe('handleDeleteMessage', () => {
	it('返回 answerCallbackQuery 响应对象', async () => {
		const cq = {
			id: 'cb123',
			message: { chat: { id: -100999 }, message_id: 42 },
			from: { id: 1 },
		};
		const result = await handleDeleteMessage(cq, { TOKEN: 't' } as any);
		expect(result).toHaveProperty('method', 'answerCallbackQuery');
		expect(result).toHaveProperty('callback_query_id', 'cb123');
		expect(result).toHaveProperty('text', '消息已删除');
	});
});
