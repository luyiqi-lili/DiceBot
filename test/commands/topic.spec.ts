import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));

vi.mock('../../src/lib/permissions', async importActual => {
	const actual = await importActual<typeof import('../../src/lib/permissions')>();
	return { ...actual, isChatOwner: vi.fn() };
});

vi.mock('../../src/lib/topicAccess', async importActual => {
	const actual = await importActual<typeof import('../../src/lib/topicAccess')>();
	return {
		...actual,
		allowTopic: vi.fn().mockResolvedValue(true),
		disallowTopic: vi.fn().mockResolvedValue(true),
		setAnywhere: vi.fn().mockResolvedValue(true),
		resetFeature: vi.fn().mockResolvedValue(true),
		getFeatureConfig: vi.fn().mockResolvedValue({ source: 'default', anywhere: false, topics: [66] }),
	};
});

import TgMessage from '../../src/lib/telegram';
import { handleTopic } from '../../src/commands/topic';
import { isChatOwner } from '../../src/lib/permissions';
import { allowTopic, disallowTopic, setAnywhere, resetFeature } from '../../src/lib/topicAccess';

const CHAT_ID = -100999;
const OWNER_ID = 1;
const THREAD = 66;

function makeMsg(o: any = {}): any {
	return {
		type: 'message',
		chatId: CHAT_ID,
		threadId: THREAD,
		from: { id: OWNER_ID, first_name: 'Owner' },
		isCommand: true,
		command: 'topic',
		message: { message_id: 1, chat: { id: CHAT_ID }, message_thread_id: THREAD },
		...o,
	};
}

const env = () => ({ TOKEN: 't', DB: {} }) as any;

function lastReply(): string {
	return String(vi.mocked(TgMessage.sendText).mock.calls.at(-1)?.[1]?.text ?? '');
}

beforeEach(() => {
	vi.mocked(TgMessage.sendText).mockClear();
	vi.mocked(allowTopic).mockClear();
	vi.mocked(disallowTopic).mockClear();
	vi.mocked(setAnywhere).mockClear();
	vi.mocked(resetFeature).mockClear();
	vi.mocked(isChatOwner).mockReset();
});

describe('/topic', () => {
	it('features 对所有人开放', async () => {
		vi.mocked(isChatOwner).mockResolvedValue(false);
		await handleTopic(makeMsg({ args: ['features'] }), env());
		expect(lastReply()).toContain('可配置的功能');
		expect(isChatOwner).not.toHaveBeenCalled();
	});

	it('list 对所有人开放并展示生效配置', async () => {
		vi.mocked(isChatOwner).mockResolvedValue(false);
		await handleTopic(makeMsg({ args: ['list', 'pray'] }), env());
		expect(lastReply()).toContain('本群主题可用配置');
		expect(allowTopic).not.toHaveBeenCalled();
	});

	it('非群主改配置被拒绝', async () => {
		vi.mocked(isChatOwner).mockResolvedValue(false);
		await handleTopic(makeMsg({ args: ['allow', 'pray'] }), env());
		expect(lastReply()).toContain('只有群主');
		expect(allowTopic).not.toHaveBeenCalled();
	});

	it('群主 allow 当前主题', async () => {
		vi.mocked(isChatOwner).mockResolvedValue(true);
		await handleTopic(makeMsg({ args: ['allow', 'fish'] }), env());
		expect(allowTopic).toHaveBeenCalledWith(expect.anything(), CHAT_ID, 'fish', THREAD);
		expect(lastReply()).toContain('已允许');
	});

	it('群主 disallow 当前主题', async () => {
		vi.mocked(isChatOwner).mockResolvedValue(true);
		await handleTopic(makeMsg({ args: ['disallow', 'fate'] }), env());
		expect(disallowTopic).toHaveBeenCalledWith(expect.anything(), CHAT_ID, 'fate', THREAD);
		expect(lastReply()).toContain('已取消');
	});

	it('群主 anywhere 放开所有主题', async () => {
		vi.mocked(isChatOwner).mockResolvedValue(true);
		await handleTopic(makeMsg({ args: ['anywhere', 'pray'] }), env());
		expect(setAnywhere).toHaveBeenCalledWith(expect.anything(), CHAT_ID, 'pray');
		expect(lastReply()).toContain('所有主题');
	});

	it('群主 reset 恢复默认', async () => {
		vi.mocked(isChatOwner).mockResolvedValue(true);
		await handleTopic(makeMsg({ args: ['reset', 'pray'] }), env());
		expect(resetFeature).toHaveBeenCalledWith(expect.anything(), CHAT_ID, 'pray');
		expect(lastReply()).toContain('恢复默认');
	});

	it('未知功能名被拒绝', async () => {
		vi.mocked(isChatOwner).mockResolvedValue(true);
		await handleTopic(makeMsg({ args: ['allow', 'nope'] }), env());
		expect(lastReply()).toContain('未知功能名');
		expect(allowTopic).not.toHaveBeenCalled();
	});

	it('无 D1 时提示不可用', async () => {
		vi.mocked(isChatOwner).mockResolvedValue(true);
		await handleTopic(makeMsg({ args: ['allow', 'pray'] }), { TOKEN: 't' } as any);
		expect(lastReply()).toContain('D1');
		expect(allowTopic).not.toHaveBeenCalled();
	});
});
