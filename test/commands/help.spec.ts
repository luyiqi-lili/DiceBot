import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/tgMessage', () => import('../helpers/mocks').then(m => m.mockTgMessage));

import TgMessage from '../../src/lib/tgMessage';
import { handleHelp } from '../../src/commands/help';

describe('/help', () => {
	beforeEach(() => vi.clearAllMocks());

	it('发送帮助文本包含常用命令', async () => {
		await handleHelp({ chatId: -100999 }, {} as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
		expect(c.text).toContain('可用命令');
	});
});
