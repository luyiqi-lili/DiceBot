import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));
import TgMessage from '../../src/lib/telegram';

function makeMsg(o: any = {}): any {
	return { type: 'message', chatId: -100999, from: { id: 1, first_name: 'Actor' }, isCommand: true, command: 'em', args: ['开心地跳了起来'], message: { message_id: 1, chat: { id: -100999 } }, ...o };
}
function makeApi() {
	return { sendMessage: vi.fn().mockResolvedValue({ message_id: 10 }) };
}
import { handleEmote } from '../../src/commands/emote';
describe('/em', () => {
	beforeEach(() => vi.clearAllMocks());
	it('格式化动作并通过 grammY API 发送', async () => {
		const api = makeApi();
		await handleEmote(makeMsg(), {} as any, api as any);
		const c = api.sendMessage.mock.calls[0];
		expect(c?.[1]).toContain('<em>');
		expect(c?.[1]).toContain('Actor');
		expect(vi.mocked(TgMessage.sendText)).not.toHaveBeenCalled();
		expect(vi.mocked(TgMessage.send)).not.toHaveBeenCalled();
	});
	it('空内容提示通过 grammY API 发送', async () => {
		const api = makeApi();
		await handleEmote(makeMsg({ args: [], text: '/em' }), {} as any, api as any);
		expect(api.sendMessage.mock.calls[0]?.[1]).toContain('错误');
		expect(vi.mocked(TgMessage.sendText)).not.toHaveBeenCalled();
	});
});
