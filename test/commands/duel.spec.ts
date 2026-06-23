import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));
import TgMessage from '../../src/lib/telegram';

function makeMsg(o: any = {}): any {
	return { type: 'message', chatId: -100999, from: { id: 1, first_name: 'Challenger' }, isCommand: true, command: 'duel', args: ['一杯奶茶'], message: { message_id: 1, chat: { id: -100999 } }, ...o };
}
import { handleDuel } from '../../src/commands/duel';
describe('/duel', () => {
	beforeEach(() => vi.clearAllMocks());
	it('无回复提示', async () => { await handleDuel(makeMsg(), { TOKEN: 't', BOT_USERNAME: 'Bot' } as any); const c = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]; expect(c?.text).toContain('回复'); });
	it('回复自己提示', async () => { await handleDuel(makeMsg({ isReply: true, replyToMessage: { message_id: 5, from: { id: 1 } } }), { TOKEN: 't', BOT_USERNAME: 'Bot' } as any); const c = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]; expect(c?.text).toContain('不能与自己决斗'); });
	it('回复机器人提示且不查询成员', async () => {
		await handleDuel(makeMsg({
			isReply: true,
			replyToMessage: { message_id: 5, from: { id: 1087968824, is_bot: true, first_name: 'Group' } }
		}), { TOKEN: 't', BOT_USERNAME: 'Bot' } as any);
		const c = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1];
		expect(c?.text).toContain('不能与机器人决斗');
		expect(vi.mocked(TgMessage.fetchChatMember)).not.toHaveBeenCalled();
		expect(vi.mocked(TgMessage.sendPhoto)).not.toHaveBeenCalled();
	});
	it('回复他人 sendPhoto', async () => { await handleDuel(makeMsg({ isReply: true, replyToMessage: { message_id: 5, from: { id: 2 } } }), { TOKEN: 't', BOT_USERNAME: 'Bot' } as any); expect(vi.mocked(TgMessage.sendPhoto)).toHaveBeenCalled(); });
});
