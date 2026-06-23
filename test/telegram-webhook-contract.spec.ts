import { env, createExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;
const ALLOWED_CHAT_ID = -1002848481881;

function makeEnv(overrides: Record<string, unknown> = {}) {
	return Object.assign(Object.create(env), {
		TOKEN: 'test-token',
		BOT_USERNAME: 'DiceBot',
		...overrides,
	});
}

function messageUpdate(text: string, extra: Record<string, unknown> = {}) {
	return {
		update_id: 1000,
		message: {
			message_id: 10,
			date: 1,
			chat: { id: ALLOWED_CHAT_ID, type: 'supergroup', title: 'Test Group' },
			from: { id: 12345, is_bot: false, first_name: 'Alice', username: 'alice' },
			text,
			...extra,
		},
	};
}

async function postTelegramUpdate(update: unknown, testEnv = makeEnv()) {
	const request = new IncomingRequest('http://example.com', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'CF-Connecting-IP': '149.154.160.1',
		},
		body: JSON.stringify(update),
	});
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, testEnv as any, ctx);
	return { response, ctx };
}

function telegramCalls(fetchMock: ReturnType<typeof vi.fn>) {
	return fetchMock.mock.calls
		.map(([url, init]) => ({ url: String(url), body: JSON.parse(String((init as RequestInit)?.body ?? '{}')) }))
		.filter(call => call.url.includes('api.telegram.org'));
}

describe('Telegram webhook user-facing contract', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.useFakeTimers();
		fetchMock = vi.fn(async () => ({
			ok: true,
			status: 200,
			json: async () => ({ ok: true, result: { message_id: 99 } }),
		}));
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('/help replies with the command help from a real Telegram message update', async () => {
		const { response } = await postTelegramUpdate(messageUpdate('/help'));

		expect(response.status).toBe(200);
		const calls = telegramCalls(fetchMock);
		const sendMessage = calls.find(call => call.url.endsWith('/sendMessage'));
		expect(sendMessage?.body).toMatchObject({
			chat_id: ALLOWED_CHAT_ID,
			parse_mode: 'HTML',
		});
		expect(sendMessage?.body.text).toContain('可用命令');
		expect(sendMessage?.body.text).toContain('/roll');
		expect(sendMessage?.body.reply_markup.inline_keyboard.at(-1)[0].text).toBe('删除消息');
	});

	it('/rd10 is parsed as a roll shortcut and replies with a one-die result', async () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);

		const { response } = await postTelegramUpdate(messageUpdate('/rd10'));

		expect(response.status).toBe(200);
		const sendMessage = telegramCalls(fetchMock).find(call => call.url.endsWith('/sendMessage'));
		expect(sendMessage?.body.text).toContain('Alice 执行 /roll 1d10 结果是');
		expect(sendMessage?.body.text).toContain('1d10');
	});

	it('delete_message callback deletes the message and answers the button click', async () => {
		const { response } = await postTelegramUpdate({
			update_id: 1001,
			callback_query: {
				id: 'callback-delete',
				from: { id: 12345, is_bot: false, first_name: 'Alice' },
				message: {
					message_id: 44,
					chat: { id: ALLOWED_CHAT_ID, type: 'supergroup' },
					text: 'message with delete button',
				},
				data: JSON.stringify({ type: 'delete_message' }),
			},
		});

		expect(response.status).toBe(200);
		const calls = telegramCalls(fetchMock);
		expect(calls.find(call => call.url.endsWith('/deleteMessage'))?.body).toMatchObject({
			chat_id: ALLOWED_CHAT_ID,
			message_id: 44,
		});
		expect(calls.find(call => call.url.endsWith('/answerCallbackQuery'))?.body).toMatchObject({
			callback_query_id: 'callback-delete',
			text: '消息已删除',
			show_alert: true,
		});
	});

	it('hello game callback answers with a signed game URL', async () => {
		const { response } = await postTelegramUpdate({
			update_id: 1002,
			callback_query: {
				id: 'callback-game',
				from: { id: 12345, is_bot: false, first_name: 'Alice', username: 'alice' },
				message: { message_id: 45, chat: { id: ALLOWED_CHAT_ID, type: 'supergroup' } },
				game_short_name: 'hello',
				start_param: 'start',
			},
		});

		expect(response.status).toBe(200);
		const answer = telegramCalls(fetchMock).find(call => call.url.endsWith('/answerCallbackQuery'));
		expect(answer?.body.callback_query_id).toBe('callback-game');
		expect(answer?.body.url).toContain('/web/hello');
		expect(answer?.body.url).toContain('user_id=12345');
		expect(answer?.body.url).toContain('auth=');
	});

	it('ignores Telegram messages from chats outside the allowlist', async () => {
		const { response } = await postTelegramUpdate(
			messageUpdate('/help', {
				chat: { id: -1001111111111, type: 'supergroup', title: 'Other Group' },
			}),
		);

		expect(response.status).toBe(200);
		expect(telegramCalls(fetchMock)).toHaveLength(0);
	});
});
