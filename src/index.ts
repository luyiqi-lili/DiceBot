/**
 * @file src/index.ts
 * @description Cloudflare Worker 主入口。处理 Telegram Webhook update、外部 API 请求和 Web 页面请求。
 *   通过 src/routes.ts 路由表分发命令到各 command handler，处理 callback_query、inline_query、topic_edited 等事件类型。
 *   同时导出 DurableObject 类以供 wrangler 绑定。
 */

import TgMessage from './lib/tgMessage';
import { ALLOWED_CHAT_IDS } from './lib/liveConfig';
import { incrementUsageCount } from './commands/like';
import { runCoinCheck } from './cron/cron';
import { handleBackup } from './lib/backup';

import { COMMAND_ROUTES, CALLBACK_ROUTES } from './routes';
import { handleWebRequest } from './web/router';

export type Env = {
	TOKEN: string;
	BOT_USERNAME: string;
	NEWS_STORE: KVNamespace;
	TOPIC_KV: KVNamespace;
	BOOK_STORE: KVNamespace;
	FISHING_RECORD_KV: KVNamespace;
	TGBOTCOUNT: KVNamespace;
	AFFECTION_KV: KVNamespace;
	ITEM_STORE: KVNamespace;
	COIN_DO: any;
	COIN_KV: KVNamespace;
	LOTTERY_DO: DurableObjectNamespace; // 新增
	DB: D1Database; // 添加 D1 数据库
	EXTERNAL_API_KEY?: string; // 添加外部 API 密钥
	AI: any;
};
export { CoinDO } from './durableObjects/coin_do';
export { LotteryDO } from './durableObjects/lottery_do';

/**
 * 处理外部 API 请求（路径以 /api/ 开头）
 * - 验证 API 密钥（通过 X-API-Key 头或 query 参数）
 * - 路由到 Coin API、健康检查等端点
 */
async function handleExternalAPI(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const path = url.pathname;

	// 1. 验证 API 密钥
	const apiKey = request.headers.get('X-API-Key') || url.searchParams.get('api_key');
	if (env.EXTERNAL_API_KEY && apiKey !== env.EXTERNAL_API_KEY) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	// 2. 处理 CoinDO 相关接口
	if (path.startsWith('/api/coin')) {
		return handleCoinAPI(request, env, path);
	}

	// 3. 处理其他 API 端点
	if (path === '/api/health') {
		return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
			headers: { 'Content-Type': 'application/json' },
		});
	}

	// 4. 返回 404
	return new Response(JSON.stringify({ error: 'Not Found' }), {
		status: 404,
		headers: { 'Content-Type': 'application/json' },
	});
}

/**
 * CoinDO API 处理 — 将 /api/coin/... 请求转发到 Coin Durable Object 的单例 stub
 */
async function handleCoinAPI(request: Request, env: Env, path: string): Promise<Response> {
	// 获取 CoinDO 的 stub（单例模式）
	const id = env.COIN_DO.idFromName('coins');
	const stub = env.COIN_DO.get(id);

	// 构造转发到 Durable Object 的请求
	const doPath = path.replace('/api/coin', '');
	const doUrl = new URL(request.url);
	doUrl.pathname = doPath;

	const doRequest = new Request(doUrl, {
		method: request.method,
		headers: request.headers,
		body: request.body,
	});

	return await stub.fetch(doRequest);
}

/** Worker 入口：Cron Trigger + HTTP Fetch */
export default {
	/**
	 * 定时任务入口（Cron Trigger）：每日执行 Coin 余额检查并发送汇总
	 */
	async scheduled(controller, env, ctx) {
		ctx.waitUntil(runCoinCheck(env));
	},

	/**
	 * HTTP 请求入口（Webhook / API / Web页面）。
	 * 流程：Web 页面 → 外部 API → POST 验证 → JSON 解析 → 白名单检查 → 事件分发
	 */
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		// 🌐 0. Web 页面处理（放最前）
		if (url.pathname.startsWith('/web/')) {
			const webResp = await handleWebRequest(request, env);
			if (webResp) return webResp;
		}

		// 1. 处理外部 API 请求（路径以 /api/ 开头）
		if (url.pathname.startsWith('/api/')) {
			return handleExternalAPI(request, env);
		}

		// 1. 记录原始请求
		console.log('index: 收到请求', {
			method: request.method,
			url: request.url,
			headers: Object.fromEntries(request.headers),
		});

		// 2. 直接响应非 POST 请求（存活检查）
		if (request.method !== 'POST') {
			console.log('index: 非 POST 请求，返回存活内容');
			return new Response('I am alive', { status: 200 });
		}

		//3. 解析请求
		let parsedMessage;
		try {
			parsedMessage = TgMessage.parseUpdate(await request.json(), env.BOT_USERNAME);
			console.log('index: 解析请求 JSON 成功');
		} catch (e) {
			console.error('index: 无法解析 JSON', e);
			return new Response('Bad Request', { status: 400 });
		}

		// 4.白名单群组检查
		if (!ALLOWED_CHAT_IDS.has(parsedMessage.chatId)) {
			console.log(`🚫 chatId ${parsedMessage.chatId} 不在允许响应的群组内，跳过处理`);
			return new Response('OK', { status: 200 });
		}

		//5. 分别处理 callback_query 和 message 和 topic_edited
		console.log('index:parsedMessage.type', parsedMessage.type);

		switch (parsedMessage.type) {
			//5.1 处理房间修改

			// 5.1.5 处理 inline_query（AI 辅助聊天）
			case 'inline_query': {
				console.log('index: 检测到 inline_query，进入 AI 辅助逻辑');
				try {
					const { handleInlineAI } = await import('./commands/aiAssistInline');
					await handleInlineAI(parsedMessage, env);
				} catch (e) {
					console.error('❌ handleInlineAI 失败', e);
				}
				return new Response('OK', { status: 200 });
			}

			case 'topic_edited': {
				console.log('index: 检测到 topic_edited，尝试处理话题标题编辑');
				try {
					const { handleTopicEdited } = await import('./commands/topicEditHandler');
					const editResponse = await handleTopicEdited(parsedMessage, env);
					if (editResponse) {
						return editResponse; // 如果 handler 返回 Response（按需），则直接返回
					}
				} catch (e) {
					console.error('❌ handleTopicEdited(topic_edited) 失败', e);
				}
				// 如果没有被 handleTopicEdited 消化，继续不做其它处理（返回 OK）
				return new Response('OK', { status: 200 });
			}

			//5.2 处理 callback_query
			case 'callback_query': {
				const callbackQuery = parsedMessage.callbackQuery;
				console.log('index:parsedMessage.callbackQuery', callbackQuery);
				const callbackData = parsedMessage.callbackData;
				console.log('index:parsedMessage.callbackData', callbackData);

				if (callbackQuery.game_short_name) {
					console.log('index:parsedMessage.callbackQuery.game_short_name', callbackQuery.game_short_name);
					switch (callbackQuery.game_short_name) {
						case 'hello': {
							// 获取用户信息
							const userId = callbackQuery.from.id;
							const userName = callbackQuery.from.first_name || 'User';
							const userLastName = callbackQuery.from.last_name || '';
							const userUsername = callbackQuery.from.username || '';

							// 构建游戏 URL，传递用户信息
							const gameUrl = new URL('https://telegram-bot.luyiqi-lili.workers.dev/web/hello');
							gameUrl.searchParams.set('user_id', userId.toString());
							gameUrl.searchParams.set('username', encodeURIComponent(userName));
							gameUrl.searchParams.set('user_last_name', encodeURIComponent(userLastName));
							gameUrl.searchParams.set('user_username', userUsername);
							gameUrl.searchParams.set('start_param', callbackQuery.start_param);
							gameUrl.searchParams.set('chat_id', parsedMessage.chatId?.toString() || '');
							gameUrl.searchParams.set('message_id', callbackQuery.message?.message_id?.toString() || '');
							gameUrl.searchParams.set('inline_message_id', callbackQuery.inline_message_id || '');

							// 必须 answerCallbackQuery
							await fetch(`https://api.telegram.org/bot${env.TOKEN}/answerCallbackQuery`, {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({
									callback_query_id: callbackQuery.id,
									url: gameUrl.toString(),
								}),
							});

							return new Response('ok');
						}

						case 'fish': {
							// 钓鱼游戏启动
							const userId = callbackQuery.from.id;
							const userName = callbackQuery.from.first_name || 'User';

							// 构建游戏URL
							const gameUrl = new URL('https://telegram-bot.luyiqi-lili.workers.dev/web/fish');
							gameUrl.searchParams.set('user_id', userId.toString());
							gameUrl.searchParams.set('username', encodeURIComponent(userName));

							// 如果是inline游戏，传递 inline_message_id
							if (callbackQuery.inline_message_id) {
								gameUrl.searchParams.set('inline_message_id', callbackQuery.inline_message_id);
							}

							// 必须 answerCallbackQuery
							await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
								url: gameUrl.toString(),
							});

							return new Response('ok');
						}
					}
				}
				// 处理回调命令 — 路由表分发
				if (typeof callbackData === 'object' && callbackData.type) {
					const cbType = callbackData.type;
					console.log('index: callbackData.type', cbType);

					// delete_message 内联处理（逻辑特殊、仅 3 行）
					if (cbType === 'delete_message') {
						const chat_id = callbackQuery.message.chat.id;
						const message_id = callbackQuery.message.message_id;
						await TgMessage.deleteMessage(env, chat_id, message_id);
						await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
							text: '消息已删除',
							show_alert: true,
						});
						return new Response('OK', { status: 200 });
					}

					const route = CALLBACK_ROUTES[cbType];
					if (route) {
						console.log(`➡️ 处理 ${cbType} 回调`);
						const mod = await import(route.module);
						await (mod as any)[route.handler](parsedMessage.callbackQuery, callbackData, env);
						return new Response('OK', { status: 200 });
					}

					console.log('ℹ️ 未知 callback type，忽略', callbackData);
					return new Response('OK', { status: 200 });
				}
			}

			//5.3 处理消息
			case 'message': {
				console.log('main:isCommand', parsedMessage.isCommand);
				if (parsedMessage.isCommand) {
					//5.3.0 首先添加用户调用计数
					console.log('main:command', parsedMessage.command);
					//await incrementUsageCount(parsedMessage, env);

					const cmd = parsedMessage.command;
					if (cmd) {
						const route = COMMAND_ROUTES[cmd];
						if (route) {
							console.log(`index: 检测到 /${cmd} 命令，进入 ${route.handler} 逻辑`);
							const mod = await import(route.module);
							await (mod as any)[route.handler](parsedMessage, env);
							if (route.deleteMsg !== false) {
								ctx.waitUntil(TgMessage.deleteMessageWithDelay(env, parsedMessage.message.chat.id, parsedMessage.message.message_id));
							}
							console.log(`index: /${cmd} 处理完成`);
							return new Response('OK', { status: 200 });
						}

						// 未知命令 → 默认帮助
						console.log('index: 未知命令，发送默认帮助提示');
						const { handleDefaultHelp } = await import('./commands/help');
						await handleDefaultHelp(parsedMessage, env);
						return new Response('OK', { status: 200 });
					}
				} else {
					await handleBackup(parsedMessage, env);
				}
			}
		}

		return new Response('OK', { status: 200 });
	},
} satisfies ExportedHandler<Env>;