import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';

const RUN_LOCAL_E2E = process.env.RUN_E2E_LOCAL_WRANGLER === '1';
const describeLocal = RUN_LOCAL_E2E ? describe : describe.skip;

const ALLOWED_CHAT_ID = -1002848481881;
const BOT_USERNAME = 'lili_DevDiceBot';
const TEST_TOKEN = '7162941597:LOCAL_E2E_TEST_TOKEN';

type TelegramApiCall = {
	method: string;
	path: string;
	body: Record<string, unknown>;
};

function telegramMessageUpdate(text: string, messageId: number) {
	return {
		update_id: messageId + 1000,
		message: {
			message_id: messageId,
			date: 1,
			chat: { id: ALLOWED_CHAT_ID, type: 'supergroup', title: 'Local E2E Group' },
			from: { id: 12345, is_bot: false, first_name: 'Alice', username: 'alice' },
			text,
		},
	};
}

function deleteMessageCallbackUpdate() {
	return {
		update_id: 2000,
		callback_query: {
			id: 'local-delete-callback',
			from: { id: 12345, is_bot: false, first_name: 'Alice' },
			message: {
				message_id: 44,
				chat: { id: ALLOWED_CHAT_ID, type: 'supergroup', title: 'Local E2E Group' },
				text: 'message with delete button',
			},
			data: JSON.stringify({ type: 'delete_message' }),
		},
	};
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
	let raw = '';
	for await (const chunk of request) raw += chunk;
	return raw ? JSON.parse(raw) : {};
}

async function createFakeTelegramApi() {
	const calls: TelegramApiCall[] = [];
	const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
		try {
			const body = await readJsonBody(request);
			const path = request.url ?? '';
			const method = path.split('/').pop() ?? '';
			calls.push({ method, path, body });
			response.writeHead(200, { 'Content-Type': 'application/json' });
			response.end(JSON.stringify({ ok: true, result: method === 'sendMessage' ? { message_id: 999 } : true }));
		} catch (error) {
			response.writeHead(500, { 'Content-Type': 'application/json' });
			response.end(JSON.stringify({ ok: false, description: String(error) }));
		}
	});
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('Fake Telegram API did not bind to a TCP port');
	return {
		url: `http://127.0.0.1:${address.port}`,
		calls,
		close: async () => {
			server.close();
			await once(server, 'close');
		},
	};
}

async function getFreePort(): Promise<number> {
	const server = createServer();
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('Could not allocate a local port');
	const port = address.port;
	server.close();
	await once(server, 'close');
	return port;
}

async function waitForWorker(port: number, worker: ChildProcessWithoutNullStreams) {
	const url = `http://127.0.0.1:${port}/`;
	const startedAt = Date.now();
	let lastError: unknown;
	while (Date.now() - startedAt < 30_000) {
		if (worker.exitCode !== null) {
			throw new Error(`wrangler dev exited before becoming ready with code ${worker.exitCode}`);
		}
		try {
			const response = await fetch(url);
			if (response.status === 200 && (await response.text()) === 'I am alive') return;
		} catch (error) {
			lastError = error;
		}
		await delay(250);
	}
	throw new Error(`wrangler dev did not become ready: ${String(lastError)}`);
}

async function createLocalWorker(apiBaseUrl: string) {
	const port = await getFreePort();
	const worker = spawn(
		'npx',
		[
			'wrangler',
			'dev',
			'--env',
			'dev',
			'--env-file',
			'/dev/null',
			'--local',
			'--ip',
			'127.0.0.1',
			'--port',
			String(port),
			'--persist-to',
			'.wrangler/e2e-state',
			'--log-level',
			'error',
			'--show-interactive-dev-session=false',
			'--var',
			`TOKEN:${TEST_TOKEN}`,
			'--var',
			`BOT_USERNAME:${BOT_USERNAME}`,
			'--var',
			`TELEGRAM_API_BASE_URL:${apiBaseUrl}`,
		],
		{
			cwd: process.cwd(),
			env: {
				...process.env,
				NO_COLOR: '1',
			},
		},
	);

	let stderr = '';
	let stdout = '';
	worker.stderr.on('data', chunk => {
		stderr += String(chunk);
	});
	worker.stdout.on('data', chunk => {
		stdout += String(chunk);
	});

	try {
		await waitForWorker(port, worker);
	} catch (error) {
		worker.kill('SIGTERM');
		throw new Error(`${String(error)}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
	}

	return {
		url: `http://127.0.0.1:${port}`,
		close: async () => {
			if (worker.exitCode !== null) return;
			worker.kill('SIGTERM');
			const exited = await Promise.race([once(worker, 'exit').then(() => true), delay(5_000).then(() => false)]);
			if (!exited && worker.exitCode === null) {
				worker.kill('SIGKILL');
				await once(worker, 'exit');
			}
		},
	};
}

async function postTelegramWebhook(workerUrl: string, update: unknown) {
	return fetch(workerUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'CF-Connecting-IP': '149.154.160.1',
		},
		body: JSON.stringify(update),
	});
}

describeLocal('local Wrangler Telegram webhook e2e', () => {
	it('handles Telegram-shaped webhook updates through local wrangler dev', async () => {
		const telegramApi = await createFakeTelegramApi();
		const worker = await createLocalWorker(telegramApi.url);
		try {
			const helpResponse = await postTelegramWebhook(worker.url, telegramMessageUpdate('/help', 10));
			expect(helpResponse.status).toBe(200);

			const mentionEchoResponse = await postTelegramWebhook(
				worker.url,
				telegramMessageUpdate(`@${BOT_USERNAME} /echo 今天很不错`, 11),
			);
			expect(mentionEchoResponse.status).toBe(200);

			const deleteResponse = await postTelegramWebhook(worker.url, deleteMessageCallbackUpdate());
			expect(deleteResponse.status).toBe(200);

			const sendMessages = telegramApi.calls.filter(call => call.method === 'sendMessage');
			expect(sendMessages[0]?.body).toMatchObject({
				chat_id: ALLOWED_CHAT_ID,
				parse_mode: 'HTML',
			});
			expect(String(sendMessages[0]?.body.text)).toContain('可用命令');
			expect(sendMessages.some(call => String(call.body.text).includes('Alice 说：今天很不错'))).toBe(true);

			expect(telegramApi.calls.find(call => call.method === 'deleteMessage')?.body).toMatchObject({
				chat_id: ALLOWED_CHAT_ID,
				message_id: 44,
			});
			expect(telegramApi.calls.find(call => call.method === 'answerCallbackQuery')?.body).toMatchObject({
				callback_query_id: 'local-delete-callback',
				text: '消息已删除',
				show_alert: true,
			});
		} finally {
			await worker.close();
			await telegramApi.close();
		}
	}, 60_000);
});
