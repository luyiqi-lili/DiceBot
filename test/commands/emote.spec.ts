import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/lib/tgMessage', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));
import TgMessage from '../../src/lib/tgMessage';

function makeMsg(o: any = {}): any {
	return { type: 'message', chatId: -100999, from: { id: 1, first_name: 'Actor' }, isCommand: true, command: 'em', args: ['开心地跳了起来'], message: { message_id: 1, chat: { id: -100999 } }, ...o };
}
import { handleEmote } from '../../src/commands/emote';
describe('/em', () => {
	beforeEach(() => vi.clearAllMocks());
	it('格式化动作', async () => { await handleEmote(makeMsg(), {} as any); const c = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]; expect(c?.text).toContain('<em>'); expect(c?.text).toContain('Actor'); });
	it('空内容提示', async () => { await handleEmote(makeMsg({ args: [], text: '/em' }), {} as any); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('错误'); });
});
