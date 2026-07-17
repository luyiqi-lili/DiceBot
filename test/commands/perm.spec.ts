import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));

vi.mock('../../src/lib/permissions', async importActual => {
	const actual = await importActual<typeof import('../../src/lib/permissions')>();
	return {
		...actual,
		isChatOwner: vi.fn(),
		grantPermission: vi.fn().mockResolvedValue(true),
		revokePermission: vi.fn().mockResolvedValue(true),
		listUserGrants: vi.fn().mockResolvedValue([]),
	};
});

import TgMessage from '../../src/lib/telegram';
import { handlePerm } from '../../src/commands/perm';
import {
	isChatOwner,
	grantPermission,
	revokePermission,
	listUserGrants,
	PERMISSION_KEYS,
} from '../../src/lib/permissions';

const CHAT_ID = -100999;
const OWNER_ID = 1;
const TARGET_ID = 42;

function makeMsg(o: any = {}): any {
	return {
		type: 'message',
		chatId: CHAT_ID,
		from: { id: OWNER_ID, first_name: 'Owner' },
		isCommand: true,
		command: 'perm',
		message: {
			message_id: 1,
			chat: { id: CHAT_ID },
			reply_to_message: { message_id: 5, from: { id: TARGET_ID, first_name: 'Target' } },
		},
		...o,
	};
}

const env = () => ({ TOKEN: 't', DB: {} }) as any;

function lastReply(): string {
	const calls = vi.mocked(TgMessage.sendText).mock.calls;
	return String(calls.at(-1)?.[1]?.text ?? '');
}

beforeEach(() => {
	vi.mocked(TgMessage.sendText).mockClear();
	vi.mocked(TgMessage.fetchChatMember).mockClear().mockResolvedValue({ first_name: 'Target' } as any);
	vi.mocked(grantPermission).mockClear();
	vi.mocked(revokePermission).mockClear();
	vi.mocked(listUserGrants).mockClear().mockResolvedValue([]);
	vi.mocked(isChatOwner).mockReset();
});

describe('/perm', () => {
	it('keys 子命令对所有人开放，无需群主', async () => {
		vi.mocked(isChatOwner).mockResolvedValue(false);
		await handlePerm(makeMsg({ args: ['keys'] }), env());
		expect(lastReply()).toContain('可用权限名');
		expect(isChatOwner).not.toHaveBeenCalled();
	});

	it('非群主执行 grant 被拒绝', async () => {
		vi.mocked(isChatOwner).mockResolvedValue(false);
		await handlePerm(makeMsg({ args: ['grant', 'coin_take'] }), env());
		expect(lastReply()).toContain('只有群主');
		expect(grantPermission).not.toHaveBeenCalled();
	});

	it('群主回复用户 grant 某权限', async () => {
		vi.mocked(isChatOwner).mockResolvedValue(true);
		await handlePerm(makeMsg({ args: ['grant', 'coin_take'] }), env());
		expect(grantPermission).toHaveBeenCalledWith(expect.anything(), CHAT_ID, TARGET_ID, 'coin_take', OWNER_ID);
		expect(lastReply()).toContain('已授予');
	});

	it('群主 grant all 授予全部权限', async () => {
		vi.mocked(isChatOwner).mockResolvedValue(true);
		await handlePerm(makeMsg({ args: ['grant', 'all'] }), env());
		expect(vi.mocked(grantPermission).mock.calls).toHaveLength(PERMISSION_KEYS.length);
		expect(lastReply()).toContain('全部权限');
	});

	it('群主 revoke 某权限', async () => {
		vi.mocked(isChatOwner).mockResolvedValue(true);
		await handlePerm(makeMsg({ args: ['revoke', 'lottery'] }), env());
		expect(revokePermission).toHaveBeenCalledWith(expect.anything(), CHAT_ID, TARGET_ID, 'lottery');
		expect(lastReply()).toContain('已移除');
	});

	it('未知权限名被拒绝，不落库', async () => {
		vi.mocked(isChatOwner).mockResolvedValue(true);
		await handlePerm(makeMsg({ args: ['grant', 'nope'] }), env());
		expect(lastReply()).toContain('未知权限名');
		expect(grantPermission).not.toHaveBeenCalled();
	});

	it('未回复且无数字 UID 时提示指定目标', async () => {
		vi.mocked(isChatOwner).mockResolvedValue(true);
		const msg = makeMsg({ args: ['grant', 'coin_take'] });
		msg.message.reply_to_message = undefined;
		await handlePerm(msg, env());
		expect(lastReply()).toContain('请回复目标用户');
		expect(grantPermission).not.toHaveBeenCalled();
	});

	it('可用命令末尾的数字 UID 指定目标', async () => {
		vi.mocked(isChatOwner).mockResolvedValue(true);
		const msg = makeMsg({ args: ['grant', 'coin_take', '777'] });
		msg.message.reply_to_message = undefined;
		await handlePerm(msg, env());
		expect(grantPermission).toHaveBeenCalledWith(expect.anything(), CHAT_ID, 777, 'coin_take', OWNER_ID);
	});

	it('无 D1 时提示不可用', async () => {
		vi.mocked(isChatOwner).mockResolvedValue(true);
		await handlePerm(makeMsg({ args: ['grant', 'coin_take'] }), { TOKEN: 't' } as any);
		expect(lastReply()).toContain('D1');
		expect(grantPermission).not.toHaveBeenCalled();
	});
});
