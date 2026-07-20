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

	it('creates, validates, and records a private Telegram Stars donation', async () => {
		const privateMessage = {
			update_id: 1090,
			message: {
				message_id: 90,
				date: 1,
				chat: { id: 7654321, type: 'private', first_name: 'Donor' },
				from: { id: 7654321, is_bot: false, first_name: 'Donor' },
				text: '/donate stars 50',
			},
		};
		const { response: invoiceResponse } = await postTelegramUpdate(privateMessage);
		expect(invoiceResponse.status).toBe(200);
		const invoice = telegramCalls(fetchMock).find(call => call.url.endsWith('/sendInvoice'));
		expect(invoice?.body).toMatchObject({
			chat_id: 7654321,
			currency: 'XTR',
			provider_token: '',
			prices: [{ label: 'DiceBot 捐赠', amount: 50 }],
		});
		const payload = invoice?.body.payload;
		expect(payload).toMatch(/^dicebot-stars:v1:/);

		fetchMock.mockClear();
		await postTelegramUpdate({
			update_id: 1091,
			pre_checkout_query: {
				id: 'pre-checkout-webhook-1',
				from: { id: 7654321, is_bot: false, first_name: 'Donor' },
				currency: 'XTR', total_amount: 50, invoice_payload: payload,
			},
		});
		expect(telegramCalls(fetchMock).find(call => call.url.endsWith('/answerPreCheckoutQuery'))?.body)
			.toMatchObject({ pre_checkout_query_id: 'pre-checkout-webhook-1', ok: true });

		fetchMock.mockClear();
		await postTelegramUpdate({
			update_id: 1092,
			message: {
				message_id: 91, date: 1,
				chat: { id: 7654321, type: 'private', first_name: 'Donor' },
				from: { id: 7654321, is_bot: false, first_name: 'Donor' },
				successful_payment: {
					currency: 'XTR', total_amount: 50, invoice_payload: payload,
					telegram_payment_charge_id: 'tg-charge-webhook-1',
					provider_payment_charge_id: '',
				},
			},
		});
		const receipt = telegramCalls(fetchMock).find(call => call.url.endsWith('/sendMessage'));
		expect(receipt?.body.text).toContain('已收到 <b>50 Telegram Stars</b>');
	});

	it('opens the private donation menu and creates an invoice from a Stars button', async () => {
		await postTelegramUpdate({
			update_id: 1088,
			message: {
				message_id: 88, date: 1,
				chat: { id: 7654320, type: 'private', first_name: 'Menu Donor' },
				from: { id: 7654320, is_bot: false, first_name: 'Menu Donor' },
				text: '/donate',
			},
		});
		const menu = telegramCalls(fetchMock).find(call => call.url.endsWith('/sendMessage'));
		const callbackData = menu?.body.reply_markup.inline_keyboard[0][1].callback_data;
		expect(JSON.parse(callbackData)).toEqual({ type: 'donation', action: 'stars', amount: 50 });

		fetchMock.mockClear();
		await postTelegramUpdate({
			update_id: 1089,
			callback_query: {
				id: 'donation-stars-button',
				from: { id: 7654320, is_bot: false, first_name: 'Menu Donor' },
				message: { message_id: 89, chat: { id: 7654320, type: 'private', first_name: 'Menu Donor' } },
				data: callbackData,
			},
		});
		const calls = telegramCalls(fetchMock);
		expect(calls.find(call => call.url.endsWith('/answerCallbackQuery'))?.body)
			.toMatchObject({ callback_query_id: 'donation-stars-button' });
		expect(calls.find(call => call.url.endsWith('/sendInvoice'))?.body)
			.toMatchObject({ chat_id: 7654320, currency: 'XTR', prices: [{ label: 'DiceBot 捐赠', amount: 50 }] });
	});

	it('creates a tracked TON transfer intent with copy buttons', async () => {
		const address = 'UQ0123456789012345678901234567890123456789012345';
		const { response } = await postTelegramUpdate({
			update_id: 1093,
			message: {
				message_id: 92, date: 1,
				chat: { id: 7654322, type: 'private', first_name: 'TON Donor' },
				from: { id: 7654322, is_bot: false, first_name: 'TON Donor' },
				text: '/donate ton 0.5',
			},
		}, makeEnv({ TON_DONATION_ADDRESS: address }));
		expect(response.status).toBe(200);
		const instructions = telegramCalls(fetchMock).find(call => call.url.endsWith('/sendMessage'));
		expect(instructions?.body.text).toContain('<b>0.5 TON</b>');
		expect(instructions?.body.text).toMatch(/dicebot-[0-9a-f]{8}/);
		expect(instructions?.body.reply_markup.inline_keyboard[0]).toEqual([
			{ text: '复制 TON 地址', copy_text: { text: address } },
			expect.objectContaining({ text: '复制备注' }),
		]);
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

	it('acknowledges webhook updates when a Telegram API call fails', async () => {
		fetchMock.mockRejectedValueOnce(new Error('Telegram API unavailable'));

		const { response } = await postTelegramUpdate(messageUpdate('/help'));

		expect(response.status).toBe(200);
		const sendMessage = telegramCalls(fetchMock).find(call => call.url.endsWith('/sendMessage'));
		expect(sendMessage?.body.text).toContain('可用命令');
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

	it('responds to Telegram messages from any group (allowlist removed)', async () => {
		const OTHER_CHAT_ID = -1001111111111;
		const { response } = await postTelegramUpdate(
			messageUpdate('/help', {
				chat: { id: OTHER_CHAT_ID, type: 'supergroup', title: 'Other Group' },
			}),
		);

		expect(response.status).toBe(200);
		const sendMessage = telegramCalls(fetchMock).find(call => call.url.endsWith('/sendMessage'));
		expect(sendMessage?.body.chat_id).toBe(OTHER_CHAT_ID);
		expect(sendMessage?.body.text).toContain('可用命令');
	});

	it('handles Business private messages with a business_connection_id', async () => {
		const { response } = await postTelegramUpdate({
			update_id: 1003,
			business_message: {
				message_id: 55,
				business_connection_id: 'bc_live',
				date: 1,
				chat: { id: 98765, type: 'private', first_name: 'Customer' },
				from: { id: 98765, is_bot: false, first_name: 'Customer' },
				text: '你好',
			},
		});

		expect(response.status).toBe(200);
		const sendMessage = telegramCalls(fetchMock).find(call => call.url.endsWith('/sendMessage'));
		expect(sendMessage?.body).toMatchObject({
			chat_id: 98765,
			business_connection_id: 'bc_live',
		});
		expect(sendMessage?.body.text).toContain('秘书模式已接入');
	});

	it('acknowledges Business messages even when Telegram rejects the secretary reply', async () => {
		fetchMock.mockResolvedValueOnce({
			ok: false,
			status: 403,
			json: async () => ({ ok: false, error_code: 403, description: 'Forbidden: can not reply' }),
		});

		const { response } = await postTelegramUpdate({
			update_id: 1004,
			business_message: {
				message_id: 56,
				business_connection_id: 'bc_denied',
				date: 1,
				chat: { id: 98766, type: 'private', first_name: 'Customer' },
				from: { id: 98766, is_bot: false, first_name: 'Customer' },
				text: '你好',
			},
		});

		expect(response.status).toBe(200);
		const sendMessage = telegramCalls(fetchMock).find(call => call.url.endsWith('/sendMessage'));
		expect(sendMessage?.body.business_connection_id).toBe('bc_denied');
	});
});
