import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));
import TgMessage from '../../src/lib/telegram';

globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) } as any);

import { handleDeleteMessage } from '../../src/commands/deleteMessage';
describe('handleDeleteMessage', () => {
	it('返回 answerCallbackQuery', async () => {
		const result = await handleDeleteMessage({ id: 'cb123', message: { chat: { id: -1 }, message_id: 42 }, from: { id: 1 } }, { TOKEN: 't' } as any);
		expect(result).toHaveProperty('method', 'answerCallbackQuery');
		expect(result).toHaveProperty('text', '消息已删除');
	});
});
