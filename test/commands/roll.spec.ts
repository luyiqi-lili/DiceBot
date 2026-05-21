import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/lib/tgMessage', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));
import TgMessage from '../../src/lib/tgMessage';

function makeMsg(o: any = {}): any {
	return { type: 'message', chatId: -100999, from: { id: 1, first_name: 'Dice' }, isCommand: true, command: 'roll', message: { message_id: 1, chat: { id: -100999 } }, ...o };
}
import { handleRoll } from '../../src/commands/roll';
describe('/roll', () => {
	beforeEach(() => vi.clearAllMocks());
	it('默认', async () => { await handleRoll(makeMsg(), {} as any); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('点'); });
	it('2d6', async () => { await handleRoll(makeMsg({ args: ['2d6'] }), {} as any); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('d6'); });
	it('rh 隐藏', async () => { await handleRoll(makeMsg({ command: 'rh', text: '/rh' }), {} as any); expect(vi.mocked(TgMessage.sendText)).toHaveBeenCalledTimes(2); });
	it('无效', async () => { await handleRoll(makeMsg({ args: ['abc'] }), {} as any); expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('无效'); });
});
