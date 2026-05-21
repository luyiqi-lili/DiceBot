import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/lib/tgMessage', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));
import TgMessage from '../../src/lib/tgMessage';
import { handle21, handle21Callback } from '../../src/commands/21';

function makeMsg(o: any = {}): any {
	return { type: 'message', chatId: -100999, from: { id: 1, first_name: 'Alice' }, isCommand: true, command: '21', message: { message_id: 1, chat: { id: -100999 } }, ...o };
}
function makeCb(o: any = {}): any {
	return { type: 'callback_query', chatId: -100999, from: { id: 1 }, callbackQuery: { id: 'cb1', from: { id: 1 }, message: { message_id: 10, chat: { id: -100999 }, text: '🎴 Alice 发起了21点游戏\n当前是第1轮次' } }, callbackData: { type: '21', action: 'draw' }, ...o };
}

describe('/21', () => {
	beforeEach(() => vi.clearAllMocks());
	it('发起游戏', async () => { await handle21(makeMsg(), {} as any); expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalled(); });
	it('draw 回调', async () => { await handle21Callback(makeCb().callbackQuery, makeCb().callbackData, { TOKEN: 't' } as any); expect(vi.mocked(TgMessage.editMessageText)).toHaveBeenCalled(); });
	it('draw 回调抽牌', async () => { const cb = makeCb({ callbackData: { type: '21', action: 'draw' } }); await handle21Callback(cb.callbackQuery, cb.callbackData, { TOKEN: 't' } as any); expect(vi.mocked(TgMessage.editMessageText)).toHaveBeenCalled(); });
});
