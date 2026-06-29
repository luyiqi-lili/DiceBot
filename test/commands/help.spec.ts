import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));

import TgMessage from '../../src/lib/telegram';
import { handleHelp } from '../../src/commands/help';

describe('/help', () => {
	beforeEach(() => vi.clearAllMocks());

	it('发送帮助文本包含掷骰和货币分组', async () => {
		await handleHelp({ chatId: -100999 }, {} as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('可用命令');
		expect(c.text).toContain('🎲');
		expect(c.text).toContain('💰');
		expect(c.text).toContain('/roll');
		expect(c.text).toContain('/coin');
		expect(c.text).toContain('/check');
	});

	it('帮助文本和快捷按钮使用 /f 钓鱼指令', async () => {
		await handleHelp({ chatId: -100999 }, {} as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		const buttons = c.reply_markup?.inline_keyboard.flat() ?? [];

		expect(c.text).toContain('/f X');
		expect(c.text).toContain('/f check');
		expect(c.text).not.toContain('/fish');
		expect(buttons).toEqual(expect.arrayContaining([
			expect.objectContaining({ text: '/f', switch_inline_query_current_chat: '/f 3' }),
			expect.objectContaining({ text: '/f add', switch_inline_query_current_chat: '/f add 🐟新鱼 1' }),
			expect.objectContaining({ text: '/f list', switch_inline_query_current_chat: '/f list' }),
		]));
	});
});
