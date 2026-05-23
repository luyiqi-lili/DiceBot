/**
 * @file src/index.ts
 * @description Cloudflare Worker 主入口。处理 Telegram Webhook update、外部 API 请求和 Web 页面请求。
 *   通过 switch-case 分发命令到各 command handler，处理 callback_query、inline_query、topic_edited 等事件类型。
 *   同时导出 DurableObject 类以供 wrangler 绑定。
 */

import TgMessage from './lib/tgMessage';
import { ALLOWED_CHAT_IDS } from './lib/liveConfig';
import { incrementUsageCount } from './commands/like';
import { runCoinCheck } from './cron/cron';
import { handleBackup } from './lib/backup';

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
				// 处理回调命令
				// TODO 回调都改成json格式
				// ✅ 新逻辑：JSON 格式 callback
				if (typeof callbackData === 'object' && callbackData.type) {
					console.log('index:parsedMessage.callbackData.type', callbackData.type);
					switch (callbackData.type) {
						// 在index.ts的callback_query处理部分添加
						case 'congrats': {
							console.log('➡️ 处理恭喜发财回调', callbackData);
							const { handleCongratsCallback } = await import('./commands/congrats');
							await handleCongratsCallback(parsedMessage.callbackQuery, callbackData, env);
							return new Response('OK', { status: 200 });
						}
						case '21': {
							// callbackQuery 为 parsedMessage.callbackQuery
							// callbackData 为 解析后的对象，例如 { type: "21", action: "draw" }
							console.log('➡️ 处理 21 点回调', callbackData);
							// 引入新的 handler
							const { handle21Callback } = await import('./commands/21');
							await handle21Callback(parsedMessage.callbackQuery, callbackData, env);
							return new Response('OK', { status: 200 });
						}
						case 'duel': {
							// callbackQuery 为 parsedMessage.callbackQuery
							// callbackData 为 解析后的对象，例如 { type: "21", action: "draw" }
							console.log('➡️ 处理 duel 点回调', callbackData);
							// 引入新的 handler
							const { handleDuelCallback } = await import('./commands/duel');
							await handleDuelCallback(parsedMessage.callbackQuery, callbackData, env);
							return new Response('OK', { status: 200 });
						}
						case 'fish': {
							// callbackQuery 为 parsedMessage.callbackQuery
							// callbackData 为 解析后的对象，例如 { type: "21", action: "draw" }
							console.log('➡️ 处理 fish 点回调', callbackData);
							// 引入新的 handler
							const { handleFishCallback } = await import('./commands/fish');
							await handleFishCallback(parsedMessage.callbackQuery, callbackData, env);
							return new Response('OK', { status: 200 });
						}
						case 'groll': {
							// callbackQuery 为 parsedMessage.callbackQuery
							// callbackData 为 解析后的对象，例如 { type: "21", action: "draw" }
							console.log('➡️ 处理 groll回调', callbackData);
							// 引入新的 handler
							const { handleGrollCallback } = await import('./commands/groll');
							await handleGrollCallback(parsedMessage.callbackQuery, callbackData, env);
							return new Response('OK', { status: 200 });
						}
						case 'lottery': {
							console.log('➡️ 处理 lottery 回调', callbackData);
							const { handleLotteryCallback } = await import('./commands/lottery');
							await handleLotteryCallback(parsedMessage.callbackQuery, callbackData, env);
							return new Response('OK', { status: 200 });
						}

						case 'delete_message': {
							const chat_id = callbackQuery.message.chat.id;
							const message_id = callbackQuery.message.message_id;

							await TgMessage.deleteMessage(env, chat_id, message_id);
							await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
								text: '消息已删除',
								show_alert: true,
							});

							// 已处理完成，直接返回
							return new Response('OK', { status: 200 });
						}

						default:
							console.log('ℹ️ 未知 callback type，忽略', callbackData);
							return new Response('OK', { status: 200 });
					}
				}
			}

			//5.3 处理消息
			case 'message': {
				console.log('main:isCommand', parsedMessage.isCommand);
				if (parsedMessage.isCommand) {
					//5.3.0 首先添加用户调用计数
					console.log('main:command', parsedMessage.command);
					//await incrementUsageCount(parsedMessage, env);

					switch (parsedMessage.command) {
						//书签

						/*    case "migrate": {
                  console.log("index: 检测到 /book 命令，进入 book逻辑");
                  const { handleMigrate } = await import("./commands/migrate");
                  await handleMigrate(parsedMessage, env);
                  await TgMessage.deleteMessage(env, parsedMessage.message.chat.id, parsedMessage.message.message_id);
                  console.log(`index: /migrate 处理完成`);
                  return new Response("OK", { status: 200 });
                }
                  */
						// 在index.ts的message命令处理switch中添加
						case '恭喜发财':
						case '恭喜發財':
						case '爸爸':
						case '恭喜發財':
						case '媽媽':
						case '妈妈': {
							console.log('index: 检测到 /恭喜发财，红包拿来 或 /妈妈 命令');
							const { handleCongrats } = await import('./commands/congrats');
							await handleCongrats(parsedMessage, env);
							//await TgMessage.deleteMessage(env, parsedMessage.message.chat.id, parsedMessage.message.message_id);
							console.log(`index: /恭喜发财，红包拿来 处理完成`);
							return new Response('OK', { status: 200 });
						}
						case 'lottery': {
							console.log('index: 检测到 /lottery 命令，进入 lottery 逻辑');
							const { handleLottery } = await import('./commands/lottery');
							await handleLottery(parsedMessage, env);
							ctx.waitUntil(TgMessage.deleteMessageWithDelay(env, parsedMessage.message.chat.id, parsedMessage.message.message_id));
							console.log(`index: /lottery 处理完成`);
							return new Response('OK', { status: 200 });
						}
						case 'act': {
							console.log('index: 检测到 /act 命令，进入 act 逻辑');
							const { handleAct } = await import('./commands/act');
							await handleAct(parsedMessage, env);
							ctx.waitUntil(TgMessage.deleteMessageWithDelay(env, parsedMessage.message.chat.id, parsedMessage.message.message_id));
							console.log(`index: /act 处理完成`);
							return new Response('OK', { status: 200 });
						}
						case 'report': {
							console.log('index: 检测到 /report 命令，进入 report 逻辑');
							const { handleReport } = await import('./commands/report');
							await handleReport(parsedMessage, env);
							ctx.waitUntil(TgMessage.deleteMessageWithDelay(env, parsedMessage.message.chat.id, parsedMessage.message.message_id));
							console.log(`index: /report 处理完成`);
							return new Response('OK', { status: 200 });
						}
						case 'book': {
							console.log('index: 检测到 /book 命令，进入 book逻辑');
							const { handleBook } = await import('./commands/book');
							await handleBook(parsedMessage, env);
							ctx.waitUntil(TgMessage.deleteMessageWithDelay(env, parsedMessage.message.chat.id, parsedMessage.message.message_id));
							console.log(`index: /book 处理完成`);
							return new Response('OK', { status: 200 });
						}
						//UID查询
						case 'whoami': {
							console.log('index: 检测到 / whoami 命令，进入 whoami 逻辑');
							const { handleWhoami } = await import('./commands/whoami');
							await handleWhoami(parsedMessage, env);
							ctx.waitUntil(TgMessage.deleteMessageWithDelay(env, parsedMessage.message.chat.id, parsedMessage.message.message_id));
							console.log(`index: / whoami 处理完成`);
							return new Response('OK', { status: 200 });
						}
						//抽卡
						case 'fate': {
							console.log('index: 检测到 /fate 命令，进入 fate逻辑');
							const { handleFate } = await import('./commands/fate');
							await handleFate(parsedMessage, env);
							ctx.waitUntil(TgMessage.deleteMessageWithDelay(env, parsedMessage.message.chat.id, parsedMessage.message.message_id));
							console.log(`index: /fate 处理完成`);
							return new Response('OK', { status: 200 });
						}

						case 'item': {
							console.log('index: 检测到 / item 命令，进入 item 逻辑');
							const { handleItem } = await import('./commands/item');
							await handleItem(parsedMessage, env);
							ctx.waitUntil(TgMessage.deleteMessageWithDelay(env, parsedMessage.message.chat.id, parsedMessage.message.message_id));
							console.log(`index: /fate 处理完成`);
							return new Response('OK', { status: 200 });
						}

						//送花
						case 'rose': {
							console.log('index: 检测到 /rose 命令，进入 rose逻辑');
							const { handleRose } = await import('./commands/rose');
							await handleRose(parsedMessage, env);
							ctx.waitUntil(TgMessage.deleteMessageWithDelay(env, parsedMessage.message.chat.id, parsedMessage.message.message_id));
							console.log(`index: /rose 处理完成`);
							return new Response('OK', { status: 200 });
						}
						//骰点
						case 'roll':
						case 'r':
						case 'rd':
						case 'rh': {
							console.log('index: 检测到 /roll 命令，进入 roll逻辑');
							const { handleRoll } = await import('./commands/roll');
							await handleRoll(parsedMessage, env);
							ctx.waitUntil(TgMessage.deleteMessageWithDelay(env, parsedMessage.message.chat.id, parsedMessage.message.message_id));
							console.log(`index: /roll 处理完成`);
							return new Response('OK', { status: 200 });
						}

						//骰点
						case 'em':
						case 'me':
						case 'emote': {
							console.log('index: 检测到 /emote 命令，进入 emote逻辑');
							const { handleEmote } = await import('./commands/emote');
							await handleEmote(parsedMessage, env);
							ctx.waitUntil(TgMessage.deleteMessageWithDelay(env, parsedMessage.message.chat.id, parsedMessage.message.message_id));
							console.log(`index: /emote 处理完成`);
							return new Response('OK', { status: 200 });
						}

						//帮助
						case 'help': {
							console.log('index: 检测到 /help 命令，进入 help逻辑');
							const { handleHelp } = await import('./commands/help');
							await handleHelp(parsedMessage, env);
							ctx.waitUntil(TgMessage.deleteMessageWithDelay(env, parsedMessage.message.chat.id, parsedMessage.message.message_id));
							console.log(`index: /help 处理完成`);
							return new Response('OK', { status: 200 });
						}
						//钓鱼
						case 'fish': {
							console.log('index: 检测到 /fish 命令，进入 fish 逻辑');
							const { handleFish } = await import('./commands/fish');
							await handleFish(parsedMessage, env);
							ctx.waitUntil(TgMessage.deleteMessageWithDelay(env, parsedMessage.message.chat.id, parsedMessage.message.message_id));
							console.log(`index: /fish 处理完成`);
							return new Response('OK', { status: 200 });
						}
						//货币
						case 'coin': {
							console.log('index: 检测到 /coin 命令，进入 coin逻辑');
							const { handleCoin } = await import('./commands/coin');
							await handleCoin(parsedMessage, env);
							ctx.waitUntil(TgMessage.deleteMessageWithDelay(env, parsedMessage.message.chat.id, parsedMessage.message.message_id));
							console.log(`index: /coin 处理完成`);
							return new Response('OK', { status: 200 });
						}
						//翻译
						case 'trans': {
							console.log('index: 检测到 /trans 命令，进入 trans逻辑');
							const { handleTrans } = await import('./commands/trans');
							await handleTrans(parsedMessage, env);
							ctx.waitUntil(TgMessage.deleteMessageWithDelay(env, parsedMessage.message.chat.id, parsedMessage.message.message_id));
							console.log(`index: /trans 处理完成`);
							return new Response('OK', { status: 200 });
						}
						//回声
						case 'echo': {
							console.log('index: 检测到 /echo 命令，进入 echo逻辑');
							const { handleEcho } = await import('./commands/echo');
							await handleEcho(parsedMessage, env);
							ctx.waitUntil(TgMessage.deleteMessageWithDelay(env, parsedMessage.message.chat.id, parsedMessage.message.message_id));
							console.log(`index: /echo 处理完成`);
							return new Response('OK', { status: 200 });
						}
						//调用次数查询
						case 'like': {
							console.log('index: 检测到 /like 命令，进入 like 逻辑');
							const { handleLike } = await import('./commands/like');
							await handleLike(parsedMessage, env);
							ctx.waitUntil(TgMessage.deleteMessageWithDelay(env, parsedMessage.message.chat.id, parsedMessage.message.message_id));
							console.log(`index: /like 处理完成`);
							return new Response('OK', { status: 200 });
						}
						//决斗
						case 'duel': {
							console.log('index: 检测到 /duel 命令，进入 duel 逻辑');
							const { handleDuel } = await import('./commands/duel');
							await handleDuel(parsedMessage, env);
							ctx.waitUntil(TgMessage.deleteMessageWithDelay(env, parsedMessage.message.chat.id, parsedMessage.message.message_id));
							console.log(`index: /duel 处理完成`);
							return new Response('OK', { status: 200 });
						}
						// groll
						case 'groll': {
							console.log('index: 检测到 /groll 命令，进入 groll 逻辑');
							const { handleGroll } = await import('./commands/groll');
							await handleGroll(parsedMessage, env);
							ctx.waitUntil(TgMessage.deleteMessageWithDelay(env, parsedMessage.message.chat.id, parsedMessage.message.message_id));
							console.log(`index: /groll 处理完成`);
							return new Response('OK', { status: 200 });
						}
						// 21点游戏
						case '21': {
							console.log('index: 检测到 /21点 命令，进入 21 逻辑');
							const { handle21 } = await import('./commands/21');
							await handle21(parsedMessage, env);
							ctx.waitUntil(TgMessage.deleteMessageWithDelay(env, parsedMessage.message.chat.id, parsedMessage.message.message_id));
							console.log(`index: 21处理完成`);
							return new Response('OK', { status: 200 });
						}
						// 新闻
						case 'news': {
							console.log(`index: 检查到news命令`);
							const { handleNews } = await import('./commands/news');
							await handleNews(parsedMessage, env);
							ctx.waitUntil(TgMessage.deleteMessageWithDelay(env, parsedMessage.message.chat.id, parsedMessage.message.message_id));
							console.log(`index: news处理完成`);
							return new Response('OK', { status: 200 });
						}
						case 'rule': {
							console.log('index: 检测到 /rule 命令，进入 rule 逻辑');
							const { handleRule } = await import('./commands/rule');
							await handleRule(parsedMessage, env);
							ctx.waitUntil(TgMessage.deleteMessageWithDelay(env, parsedMessage.message.chat.id, parsedMessage.message.message_id));
							console.log(`index: /rule 处理完成`);
							return new Response('OK', { status: 200 });
						}
						// 默认提示
						default: {
							console.log('index: 未知命令，发送默认帮助提示');
							const { handleDefaultHelp } = await import('./commands/help');
							await handleDefaultHelp(parsedMessage, env);
							try {
								//               await TgMessage.deleteMessage(env, parsedMessage.message.chat.id, parsedMessage.message.message_id);
							} catch (e) {
								console.warn('index: 删除触发命令消息失败（可忽略）', e);
							}

							return new Response('OK', { status: 200 });
						}
					}
				} else {
					await handleBackup(parsedMessage, env);
				}
			}
		}

		return new Response('OK', { status: 200 });
	},
} satisfies ExportedHandler<Env>;