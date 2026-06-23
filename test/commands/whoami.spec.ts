import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));
import TgMessage from '../../src/lib/telegram';

function makeMsg(o: any = {}): any {
	return { type: 'message', chatId: -100999, from: { id: 1, first_name: 'User' }, isCommand: true, command: 'whoami', message: { message_id: 1, chat: { id: -100999, title: 'G' } }, ...o };
}
function makeApi() {
	return { sendMessage: vi.fn().mockResolvedValue({ message_id: 10 }) };
}
import { handleWhoami } from '../../src/commands/whoami';
describe('/whoami', () => {
	beforeEach(() => vi.clearAllMocks());
	it('自己', async () => {
		const api = makeApi();
		await handleWhoami(makeMsg(), { TOKEN: 't' } as any, api as any);
		expect(api.sendMessage.mock.calls[0]?.[1]).toContain('用户信息');
		expect(vi.mocked(TgMessage.sendText)).not.toHaveBeenCalled();
		expect(vi.mocked(TgMessage.send)).not.toHaveBeenCalled();
	});
	it('回复他人', async () => {
		const api = makeApi();
		await handleWhoami(makeMsg({ isReply: true, replyToMessage: { message_id: 5, from: { id: 999, first_name: 'T' } } }), { TOKEN: 't' } as any, api as any);
		expect(api.sendMessage.mock.calls[0]?.[1]).toContain('999');
		expect(vi.mocked(TgMessage.sendText)).not.toHaveBeenCalled();
	});
});
