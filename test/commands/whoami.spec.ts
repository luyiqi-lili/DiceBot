import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/lib/tgMessage', () => import('../helpers/mocks').then(m => m.mockTgMessage));
import TgMessage from '../../src/lib/tgMessage';

function makeMsg(o: any = {}): any {
	return { type: 'message', chatId: -100999, from: { id: 1, first_name: 'User' }, isCommand: true, command: 'whoami', message: { message_id: 1, chat: { id: -100999, title: 'G' } }, ...o };
}
import { handleWhoami } from '../../src/commands/whoami';
describe('/whoami', () => {
	beforeEach(() => vi.clearAllMocks());
	it('自己', async () => { await handleWhoami(makeMsg(), { TOKEN: 't' } as any); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('用户信息'); });
	it('回复他人', async () => { await handleWhoami(makeMsg({ isReply: true, replyToMessage: { message_id: 5, from: { id: 999, first_name: 'T' } } }), { TOKEN: 't' } as any); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('999'); });
});
