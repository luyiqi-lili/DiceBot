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
		expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ text: expect.stringContaining('请回复一条带有文本的消息') }));
	});

	it('restores reply-based translation with Simplified Chinese as the default target', async () => {
		vi.mocked(translateWithGemini).mockResolvedValue({ status: 'ok', text: '你好' });
		await handleTrans({ chatId: 123, args: [], replyToMessage: { text: 'Hello' } } as any, {} as any);

		expect(translateWithGemini).toHaveBeenCalledWith(expect.anything(), { targetLanguage: '简体中文', text: 'Hello' });
		expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
			text: '骰娘刚刚听到： 「Hello」\n翻译一下就是： 「你好」', parse_mode: 'HTML',
		}));
	});

	it('accepts a custom target language when translating a replied message', async () => {
		vi.mocked(translateWithGemini).mockResolvedValue({ status: 'ok', text: 'Hello' });
		await handleTrans({ chatId: 123, args: ['English'], replyToMessage: { text: '你好' } } as any, {} as any);

		expect(translateWithGemini).toHaveBeenCalledWith(expect.anything(), { targetLanguage: 'English', text: '你好' });
	});
});
