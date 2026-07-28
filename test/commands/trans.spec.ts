import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then((m) => m.mockTgMessageModule));
vi.mock('../../src/lib/aiGateway', () => ({ translateWithGemini: vi.fn() }));

import TgMessage from '../../src/lib/telegram';
import { translateWithGemini } from '../../src/lib/aiGateway';
import { handleTrans } from '../../src/commands/trans';

describe('/trans', () => {
	beforeEach(() => vi.clearAllMocks());

	it('sends an escaped Gemini translation', async () => {
		vi.mocked(translateWithGemini).mockResolvedValue({ status: 'ok', text: '<Hello & welcome>' });
		await handleTrans({ chatId: 123, args: ['English', '你好', '世界'] } as any, {} as any);

		expect(translateWithGemini).toHaveBeenCalledWith(expect.anything(), { targetLanguage: 'English', text: '你好 世界' });
		expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
			chat_id: 123,
			parse_mode: 'HTML',
			text: '🌐 <b>English</b>：\n&lt;Hello &amp; welcome&gt;',
		}));
	});

	it('explains the required target language and text', async () => {
		await handleTrans({ chatId: 123, args: [] } as any, {} as any);
		expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ text: expect.stringContaining('/trans 目标语言') }));
	});
});
