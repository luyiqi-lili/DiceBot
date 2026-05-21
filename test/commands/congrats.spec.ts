import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/lib/tgMessage', () => import('../helpers/mocks').then(m => m.mockTgMessage));
vi.mock('../../src/lib/coinService', () => import('../helpers/mocks').then(m => m.mockCoinService));
import TgMessage from '../../src/lib/tgMessage';
import { handleCongrats } from '../../src/commands/congrats';

function makeMsg(o: any = {}): any {
	return { type: 'message', chatId: -100999, from: { id: 1, first_name: 'Red' }, isCommand: true, command: 'congrats', message: { message_id: 1, chat: { id: -100999 } }, ...o };
}
describe('/congrats', () => {
	beforeEach(() => vi.clearAllMocks());
	it('无回复', async () => { await handleCongrats(makeMsg(), {} as any); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('回复'); });
	it('回复自己', async () => { await handleCongrats(makeMsg({ isReply: true, replyToMessage: { from: { id: 1 } } }), { TOKEN: 't' } as any); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('不能自己回复自己'); });
	it('回复他人', async () => { await handleCongrats(makeMsg({ isReply: true, replyToMessage: { from: { id: 2 } } }), { TOKEN: 't' } as any); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('恭喜发财'); });
});
