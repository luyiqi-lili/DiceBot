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

	it('说明源码需求、bot:ready 审核和安全 Token 捐赠规则', async () => {
		await handleHelp({ chatId: -100999 }, {} as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		const buttons = c.reply_markup?.inline_keyboard.flat() ?? [];

		expect(c.text).toContain('源码共创与 AI 审核');
		expect(c.text).toContain('/wish 具体需求');
		expect(c.text).toContain('Workers AI 会经 AI Gateway 用免费额度复核');
		expect(c.text).toContain('/trans [目标语言]');
		expect(c.text).toContain('安全捐赠 AI Token');
		expect(c.text).toContain('/donatetoken deepseek shared_inference YOUR_TOKEN');
		expect(c.text).toContain('/revoketoken');
		expect(c.text).toContain('撤销后密文不可恢复');
		expect(c.text).toContain('POST /api/donations/api-keys');
		expect(c.text).toContain('shared_inference');
		expect(c.text).toContain('AES-GCM');
		expect(c.text).toContain('Stars / TON 捐赠');
		expect(c.text).toContain('/donate stars 25');
		expect(c.text).toContain('/donate ton 0.5');
		expect(c.text).toContain('/paysupport');
		expect(c.text).toContain('bot:ready');
		expect(Array.from(c.text).length).toBeLessThanOrEqual(4096);
		expect(buttons).toEqual(expect.arrayContaining([
			expect.objectContaining({ text: '/wish 提需求', switch_inline_query_current_chat: '/wish ' }),
			expect.objectContaining({
				text: '私聊捐赠',
				url: 'https://t.me/lili_DiceBot',
			}),
		]));
	});
});
