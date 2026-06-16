import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/lib/tgMessage', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));
import TgMessage from '../../src/lib/tgMessage';

function makeMsg(o: any = {}): any {
	return { type: 'message', chatId: -100999, from: { id: 1, first_name: 'Dice' }, isCommand: true, command: 'roll', message: { message_id: 1, chat: { id: -100999 } }, ...o };
}
function makeApi() {
	return { sendMessage: vi.fn().mockResolvedValue({ message_id: 10 }) };
}
import { handleRoll } from '../../src/commands/roll';
describe('/roll', () => {
	beforeEach(() => vi.clearAllMocks());
	it('默认', async () => {
		const api = makeApi();
		await handleRoll(makeMsg(), {} as any, api as any);
		expect(api.sendMessage.mock.calls[0]?.[1]).toContain('点');
		expect(vi.mocked(TgMessage.sendText)).not.toHaveBeenCalled();
	});
	it('.r 默认骰点', async () => {
		const api = makeApi();
		await handleRoll(makeMsg({ command: 'r', text: '.r', args: [] }), {} as any, api as any);
		expect(api.sendMessage.mock.calls[0]?.[1]).toContain('点');
		expect(api.sendMessage.mock.calls[0]?.[1]).not.toContain('无效');
		expect(vi.mocked(TgMessage.sendText)).not.toHaveBeenCalled();
	});
	it('.rd10 按 1d10 掷骰', async () => {
		const api = makeApi();
		await handleRoll(makeMsg({ command: 'r', text: '.rd10', args: ['d10'] }), {} as any, api as any);
		expect(api.sendMessage.mock.calls[0]?.[1]).toContain('/roll 1d10');
		expect(api.sendMessage.mock.calls[0]?.[1]).toContain('1d10');
		expect(api.sendMessage.mock.calls[0]?.[1]).not.toContain('无效');
		expect(vi.mocked(TgMessage.sendText)).not.toHaveBeenCalled();
	});
	it('.r2d10 按 2d10 掷骰', async () => {
		const api = makeApi();
		await handleRoll(makeMsg({ command: 'r', text: '.r2d10', args: ['2d10'] }), {} as any, api as any);
		expect(api.sendMessage.mock.calls[0]?.[1]).toContain('/roll 2d10');
		expect(api.sendMessage.mock.calls[0]?.[1]).toContain('2d10');
		expect(api.sendMessage.mock.calls[0]?.[1]).not.toContain('无效');
		expect(vi.mocked(TgMessage.sendText)).not.toHaveBeenCalled();
	});
	it('2d6', async () => {
		const api = makeApi();
		await handleRoll(makeMsg({ args: ['2d6'] }), {} as any, api as any);
		expect(api.sendMessage.mock.calls[0]?.[1]).toContain('d6');
		expect(vi.mocked(TgMessage.sendText)).not.toHaveBeenCalled();
	});
	it('rh 隐藏', async () => {
		const api = makeApi();
		await handleRoll(makeMsg({ command: 'rh', text: '/rh' }), {} as any, api as any);
		expect(api.sendMessage).toHaveBeenCalledTimes(2);
		expect(api.sendMessage.mock.calls[0]?.[1]).toContain('私聊');
		expect(api.sendMessage.mock.calls[1]?.[0]).toBe(1);
		expect(vi.mocked(TgMessage.sendText)).not.toHaveBeenCalled();
	});
	it('无效', async () => {
		const api = makeApi();
		await handleRoll(makeMsg({ args: ['abc'] }), {} as any, api as any);
		expect(api.sendMessage.mock.calls[0]?.[1]).toContain('无效');
		expect(vi.mocked(TgMessage.sendText)).not.toHaveBeenCalled();
	});
});
