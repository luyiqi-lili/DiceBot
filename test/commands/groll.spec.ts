import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/lib/tgMessage', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));
import TgMessage from '../../src/lib/tgMessage';

function makeMsg(o: any = {}): any {
	return { type: 'message', chatId: -100999, from: { id: 1, first_name: 'Bob' }, isCommand: true, command: 'groll', message: { message_id: 1, chat: { id: -100999 } }, ...o };
}
function makeCb(text: string, o: any = {}): any {
	return { type: 'callback_query', chatId: -100999, from: { id: 2, first_name: 'Carol' }, callbackQuery: { id: 'cb1', from: { id: 2 }, message: { message_id: 10, chat: { id: -100999 }, text } }, callbackData: { type: 'groll', action: 'accept' }, ...o };
}
import { handleGroll, handleGrollCallback } from '../../src/commands/groll';
describe('/groll', () => {
	beforeEach(() => vi.clearAllMocks());
	it('发起', async () => { await handleGroll(makeMsg(), {} as any); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('群骰'); });
	it('加入', async () => { await handleGrollCallback(makeCb('🎲 群骰\n\n其他玩家点击按钮加入掷点：').callbackQuery, makeCb('x').callbackData, { TOKEN: 't' } as any); expect(vi.mocked(TgMessage.editMessageText)).toHaveBeenCalled(); });
	it('结束', async () => { const cb = makeCb('🎲 群骰\n- Alice：30\n- Bob：50\n\n其他玩家点击按钮加入掷点：', { callbackData: { type: 'groll', action: 'end' }, from: { id: 1, first_name: 'Bob' }, callbackQuery: { id: 'cb2', from: { id: 1, first_name: 'Bob' }, message: { message_id: 10, chat: { id: -100999 }, text: '🎲 群骰\n- Alice：30\n- Bob：50\n\n其他玩家点击按钮加入掷点：' } } }); await handleGrollCallback(cb.callbackQuery, cb.callbackData, { TOKEN: 't' } as any); expect(vi.mocked(TgMessage.editMessageText).mock.calls[0]?.[1]?.text).toContain('胜利者'); });
});
