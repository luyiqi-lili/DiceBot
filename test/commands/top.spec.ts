import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/lib/telegram', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));

import TgMessage from '../../src/lib/telegram';
import { handleTop } from '../../src/commands/top';

function makeParsed(o: any = {}): any {
	return {
		type: 'message',
		chatId: -100999,
		threadId: 66,
		from: { id: 12345, first_name: '测试用户' },
		isCommand: true,
		command: 'top',
		message: { message_id: 1, chat: { id: -100999 }, message_thread_id: 66 },
		...o,
	};
}

function makeDb(results: any[]) {
	const all = vi.fn().mockResolvedValue({ results });
	const bind = vi.fn(() => ({ all }));
	const prepare = vi.fn(() => ({ bind }));
	return { prepare, bind, all };
}

describe('/top', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-06-25T12:00:00.000Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('拒绝非白名单管理员', async () => {
		const db = makeDb([]);

		await handleTop(makeParsed(), { DB: db } as any);

		expect(db.prepare).not.toHaveBeenCalled();
		expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]).toMatchObject({
			chat_id: -100999,
			message_thread_id: 66,
		});
		expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('没有权限');
	});

	it('白名单管理员可以查看最近 7 天主题消息排行', async () => {
		const db = makeDb([
			{ thread_id: 184, topic_name: '音', message_count: 12 },
			{ thread_id: 205, topic_name: null, message_count: 7 },
			{ thread_id: 382, topic_name: '耀阳', message_count: 3 },
		]);

		await handleTop(makeParsed({ from: { id: 8080375150, first_name: 'Admin' } }), { DB: db } as any);

		expect(db.bind).toHaveBeenCalledWith(-100999, '2026-06-18T12:00:00.000Z', 10);
		const reply = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1];
		expect(reply).toMatchObject({ chat_id: -100999, message_thread_id: 66, parse_mode: 'HTML' });
		expect(reply?.text).toContain('最近 7 天');
		expect(reply?.text).toContain('消息最多的主题：<b>音</b>');
		expect(reply?.text).toContain('1. 音：12 条');
		expect(reply?.text).toContain('2. 主题 205：7 条');
		expect(reply?.text).toContain('3. 耀阳：3 条');
	});

	it('D1 没有 topic_name 时使用已知房间名称', async () => {
		const db = makeDb([
			{ thread_id: 210, topic_name: null, message_count: 19238 },
			{ thread_id: 162, topic_name: '', message_count: 2133 },
			{ thread_id: 161, topic_name: null, message_count: 1815 },
		]);

		await handleTop(makeParsed({
			chatId: -1002970430696,
			threadId: 210,
			from: { id: 8080375150, first_name: 'Admin' },
			message: { message_id: 1, chat: { id: -1002970430696 }, message_thread_id: 210 },
		}), { DB: db } as any);

		const reply = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1];
		expect(reply?.text).toContain('消息最多的主题：<b>酒馆</b>');
		expect(reply?.text).toContain('1. 酒馆：19238 条');
		expect(reply?.text).toContain('2. 耀阳：2133 条');
		expect(reply?.text).toContain('3. 电竞：1815 条');
	});

	it('没有最近消息时返回空数据提示', async () => {
		const db = makeDb([]);

		await handleTop(makeParsed({ from: { id: 8080375150, first_name: 'Admin' } }), { DB: db } as any);

		expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('最近 7 天还没有可统计的主题消息');
	});
});
