import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/lib/tgMessage', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));
import TgMessage from '../../src/lib/tgMessage';

function makeMsg(o: any = {}): any {
	return { type: 'message', chatId: -100999, from: { id: 1, first_name: 'Echo' }, isCommand: true, command: 'echo', args: ['今天天气不错'], message: { message_id: 1, chat: { id: -100999 } }, ...o };
}
import { handleEcho } from '../../src/commands/echo';
describe('/echo', () => {
	beforeEach(() => vi.clearAllMocks());
	it('正常', async () => { await handleEcho(makeMsg(), {} as any); const c = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]; expect(c?.text).toContain('骰娘'); expect(c?.text).toContain('今天天气不错'); });
	it('空内容', async () => { await handleEcho(makeMsg({ args: [], text: '/echo' }), {} as any); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('没有内容'); });
});
