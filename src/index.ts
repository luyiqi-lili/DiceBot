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

import { COMMAND_ROUTES } from './routes';
import { handleWebRequest } from './web/router';

/**
 * 统一定义的 Env 类型 — 所有 handler 均从此处导入。
 * 包含 dev 和 prod 环境的所有 KV / Durable Object / D1 / API 绑定。
 * 在 dev 环境中不存在的绑定标记为 ?，handler 中使用前需判空。
 */
export type Env = {
	TOKEN: string;
	BOT_USERNAME: string;
	// KV 命名空间
	NEWS_STORE: KVNamespace;
	TOPIC_KV: KVNamespace;
	BOOK_STORE: KVNamespace;
	FISHING_RECORD_KV: KVNamespace;
	FISH_KV: KVNamespace;
	TGBOTCOUNT: KVNamespace;
	AFFECTION_KV: KVNamespace;
	ITEM_STORE: KVNamespace;
	COIN_KV: KVNamespace;
	// Durable Objects
	COIN_DO: DurableObjectNamespace;
	LOTTERY_DO: DurableObjectNamespace;
	// D1 数据库（仅 prod）
	DB?: D1Database;
	// 外部 API
	EXTERNAL_API_KEY?: string;
	DEEPSEEK_API_KEY?: string;
	DEEPSEEK_API_KEYS?: string;
	DEEPSEEK_MODEL?: string;
	DEEPSEEK_BASE_URL?: string;
};
export { CoinDO } from './durableObjects/coin_do';
export { LotteryDO } from './durableObjects/lottery_do';

/**
 * 处理外部 API 请求（路径以 /api/ 开头）
 */
async function handleExternalAPI(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const path = url.pathname;

	const apiKey = request.headers.get('X-API-Key') || url.searchParams.get('api_key');
	if (env.EXTERNAL_API_KEY && apiKey !== env.EXTERNAL_API_KEY) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	if (path.startsWith('/api/coin')) {
		return handleCoinAPI(request, env, path);
	}

	if (path.startsWith('/api/wish')) {
		const { handleWishAPI } = await import('./lib/wishApi');
		return handleWishAPI(request, env, path);
	}

	if (path === '/api/health') {
		return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
			headers: { 'Content-Type': 'application/json' },
		});
	}

	return new Response(JSON.stringify({ error: 'Not Found' }), {
		status: 404,
		headers: { 'Content-Type': 'application/json' },
	});
}

/**
 * CoinDO API 处理
 */
async function handleCoinAPI(request: Request, env: Env, path: string): Promise<Response> {
	const id = env.COIN_DO.idFromName('coins');
	const stub = env.COIN_DO.get(id);

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

// Cloudflare Workers 要求 import() 参数必须是静态字符串字面量，
// 否则构建工具无法静态分析依赖，不会将对应模块打包进 Worker。
// 以下两个函数用 switch-case 显式列出所有模块的静态 import 路径，
// 路由元数据（如 deleteMsg）仍从 COMMAND_ROUTES 读取。

async function loadCommand(cmd: string): Promise<((parsed: any, env: any) => Promise<any>) | null> {
	switch (cmd) {
		case '恭喜发财': case '恭喜發財': case '爸爸': case '媽媽': case '妈妈': {
			const { handleCongrats } = await import('./commands/congrats');
			return handleCongrats;
		}
		case 'lottery': { const { handleLottery } = await import('./commands/lottery'); return handleLottery; }
		case 'act':     { const { handleAct } = await import('./commands/act'); return handleAct; }
		case 'report':  { const { handleReport } = await import('./commands/report'); return handleReport; }
		case 'ask':     { const { handleAsk } = await import('./commands/ask'); return handleAsk; }
		case 'book':    { const { handleBook } = await import('./commands/book'); return handleBook; }
		case 'whoami':  { const { handleWhoami } = await import('./commands/whoami'); return handleWhoami; }
		case 'fate':    { const { handleFate } = await import('./commands/fate'); return handleFate; }
		case 'item':    { const { handleItem } = await import('./commands/item'); return handleItem; }
		case 'rose':    { const { handleRose } = await import('./commands/rose'); return handleRose; }
		case 'roll': case 'r': case 'rd': case 'rh': {
			const { handleRoll } = await import('./commands/roll'); return handleRoll;
		}
		case 'em': case 'me': case 'emote': {
			const { handleEmote } = await import('./commands/emote'); return handleEmote;
		}
		case 'help':    { const { handleHelp } = await import('./commands/help'); return handleHelp; }
		case 'fish':    { const { handleFish } = await import('./commands/fish'); return handleFish; }
		case 'wish':    { const { handleWish } = await import('./commands/wish'); return handleWish; }
		case 'coin':    { const { handleCoin } = await import('./commands/coin'); return handleCoin; }
		case 'trans':   { const { handleTrans } = await import('./commands/trans'); return handleTrans; }
		case 'echo':    { const { handleEcho } = await import('./commands/echo'); return handleEcho; }
		case 'like':    { const { handleLike } = await import('./commands/like'); return handleLike; }
		case 'duel':    { const { handleDuel } = await import('./commands/duel'); return handleDuel; }
		case 'groll':   { const { handleGroll } = await import('./commands/groll'); return handleGroll; }
		case '21':      { const { handle21 } = await import('./commands/21'); return handle21; }
		case 'news':    { const { handleNews } = await import('./commands/news'); return handleNews; }
		case 'rule':    { const { handleRule } = await import('./commands/rule'); return handleRule; }
		case 'dnd':     { const { handleDndHelp } = await import('./commands/dndHelp'); return handleDndHelp; }
		case 'new':     { const { handleDndNew } = await import('./commands/dndNew'); return handleDndNew; }
		case 'char':    { const { handleDndChar } = await import('./commands/dndChar'); return handleDndChar; }
		case 'skill':   { const { handleDndSkill } = await import('./commands/dndSkill'); return handleDndSkill; }
		case 'skills':  { const { handleDndSkills } = await import('./commands/dndSkills'); return handleDndSkills; }
		case 'rest':    { const { handleDndRest } = await import('./commands/dndRest'); return handleDndRest; }
		case 'gm':      { const { handleDndGm } = await import('./commands/dndGm'); return handleDndGm; }
		case 'attack':  { const { handleDndAttack } = await import('./commands/dndAttack'); return handleDndAttack; }
		case 'atk':     { const { handleDndAttack } = await import('./commands/dndAttack'); return handleDndAttack; }
		case 'cast':    { const { handleDndCast } = await import('./commands/dndCast'); return handleDndCast; }
		case 'lvup':    { const { handleDndLvUp } = await import('./commands/dndUpgrade'); return handleDndLvUp; }
		case 'level':   { const { handleDndLevel } = await import('./commands/dndUpgrade'); return handleDndLevel; }
		default: return null;
	}
}

async function loadCallback(type: string): Promise<((cq: any, data: any, env: any) => Promise<any>) | null> {
	switch (type) {
		case 'congrats': { const { handleCongratsCallback } = await import('./commands/congrats'); return handleCongratsCallback; }
		case '21':       { const { handle21Callback } = await import('./commands/21'); return handle21Callback; }
		case 'duel':     { const { handleDuelCallback } = await import('./commands/duel'); return handleDuelCallback; }
		case 'fish':     { const { handleFishCallback } = await import('./commands/fish'); return handleFishCallback; }
		case 'groll':    { const { handleGrollCallback } = await import('./commands/groll'); return handleGrollCallback; }
		case 'lottery':  { const { handleLotteryCallback } = await import('./commands/lottery'); return handleLotteryCallback; }
		case 'dnd_reroll':  { const { handleDndRerollCallback } = await import('./commands/dndNew'); return handleDndRerollCallback; }
		case 'dnd_confirm': { const { handleDndConfirmCallback } = await import('./commands/dndNew'); return handleDndConfirmCallback; }
		case 'item_action':{ const { handleItemCallback } = await import('./commands/item'); return handleItemCallback; }
		case 'lu':        { const { handleLvUpCallback } = await import('./commands/dndUpgrade'); return handleLvUpCallback; }
		default: return null;
	}
}

/** Worker 入口：Cron Trigger + HTTP Fetch */
export default {
	async scheduled(controller, env, ctx) {
		ctx.waitUntil(runCoinCheck(env));
	},

	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		// 🌐 0. Web 页面处理
		if (url.pathname.startsWith('/web/')) {
			const webResp = await handleWebRequest(request, env);
			if (webResp) return webResp;
		}

		// 1. 外部 API
		if (url.pathname.startsWith('/api/')) {
			return handleExternalAPI(request, env);
		}

		console.log('index: 收到请求', {
			method: request.method,
			url: request.url,
			headers: Object.fromEntries(request.headers),
		});

		// 2. 非 POST 存活检查
		if (request.method !== 'POST') {
			console.log('index: 非 POST 请求，返回存活内容');
			return new Response('I am alive', { status: 200 });
		}

		// 3. 解析请求
		let parsedMessage;
		try {
			parsedMessage = TgMessage.parseUpdate(await request.json(), env.BOT_USERNAME);
			console.log('index: 解析请求 JSON 成功');
		} catch (e) {
			console.error('index: 无法解析 JSON', e);
			return new Response('Bad Request', { status: 400 });
		}

		// 4. 白名单群组检查
		if (!ALLOWED_CHAT_IDS.has(parsedMessage.chatId)) {
			console.log(`🚫 chatId ${parsedMessage.chatId} 不在允许响应的群组内，跳过处理`);
			return new Response('OK', { status: 200 });
		}

		// 5. 事件分发
		console.log('index:parsedMessage.type', parsedMessage.type);

		switch (parsedMessage.type) {
			// inline_query
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

			// topic_edited
			case 'topic_edited': {
				console.log('index: 检测到 topic_edited');
				try {
					const { handleTopicEdited } = await import('./commands/topicEditHandler');
					const editResponse = await handleTopicEdited(parsedMessage, env);
					if (editResponse) return editResponse;
				} catch (e) {
					console.error('❌ handleTopicEdited 失败', e);
				}
				return new Response('OK', { status: 200 });
			}

			// callback_query
			case 'callback_query': {
				const callbackQuery = parsedMessage.callbackQuery;
				const callbackData = parsedMessage.callbackData;
				console.log('index: callbackData', typeof callbackData, callbackData);

				// game_short_name 游戏启动（hello / fish 网页游戏）
				if (callbackQuery.game_short_name) {
					const game = callbackQuery.game_short_name;
					console.log('index: game_short_name', game);
					if (game === 'hello') {
						const userId = callbackQuery.from.id;
						const userName = callbackQuery.from.first_name || 'User';
						const gameUrl = new URL('https://telegram-bot.luyiqi-lili.workers.dev/web/hello');
						gameUrl.searchParams.set('user_id', userId.toString());
						gameUrl.searchParams.set('username', encodeURIComponent(userName));
						gameUrl.searchParams.set('user_last_name', encodeURIComponent(callbackQuery.from.last_name || ''));
						gameUrl.searchParams.set('user_username', callbackQuery.from.username || '');
						gameUrl.searchParams.set('start_param', callbackQuery.start_param);
						gameUrl.searchParams.set('chat_id', parsedMessage.chatId?.toString() || '');
						gameUrl.searchParams.set('message_id', callbackQuery.message?.message_id?.toString() || '');
						gameUrl.searchParams.set('inline_message_id', callbackQuery.inline_message_id || '');
						await fetch(`https://api.telegram.org/bot${env.TOKEN}/answerCallbackQuery`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ callback_query_id: callbackQuery.id, url: gameUrl.toString() }),
						});
						return new Response('ok');
					}
					if (game === 'fish') {
						const userId = callbackQuery.from.id;
						const userName = callbackQuery.from.first_name || 'User';
						const gameUrl = new URL('https://telegram-bot.luyiqi-lili.workers.dev/web/fish');
						gameUrl.searchParams.set('user_id', userId.toString());
						gameUrl.searchParams.set('username', encodeURIComponent(userName));
						if (callbackQuery.inline_message_id) {
							gameUrl.searchParams.set('inline_message_id', callbackQuery.inline_message_id);
						}
						await TgMessage.answerCallbackQuery(env, callbackQuery.id, { url: gameUrl.toString() });
						return new Response('ok');
					}
				}

				// JSON 格式 callback — 静态 import 分发
				if (typeof callbackData === 'object' && callbackData.type) {
					const cbType = callbackData.type;
					console.log('index: callbackData.type', cbType);

					// delete_message 内联
					if (cbType === 'delete_message') {
						await TgMessage.deleteMessage(env, callbackQuery.message.chat.id, callbackQuery.message.message_id);
						await TgMessage.answerCallbackQuery(env, callbackQuery.id, { text: '消息已删除', show_alert: true });
						return new Response('OK', { status: 200 });
					}

					const handler = await loadCallback(cbType);
					if (handler) {
						console.log(`➡️ 处理 ${cbType} 回调`);
						await handler(parsedMessage.callbackQuery, callbackData, env);
						return new Response('OK', { status: 200 });
					}

					console.log('ℹ️ 未知 callback type，忽略', callbackData);
					return new Response('OK', { status: 200 });
				}
			}

			// message
			case 'message': {
				console.log('main:isCommand', parsedMessage.isCommand);
				if (parsedMessage.isCommand) {
					console.log('main:command', parsedMessage.command);
					ctx.waitUntil(incrementUsageCount(parsedMessage, env));

					const cmd = parsedMessage.command;
					if (cmd) {
						const handler = await loadCommand(cmd);
						if (handler) {
							console.log(`index: 检测到 /${cmd} 命令`);
							await handler(parsedMessage, env);
							const route = COMMAND_ROUTES[cmd];
							if (!route || route.deleteMsg !== false) {
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
					const { handleWishApproval } = await import('./commands/wish');
					const wishHandled = await handleWishApproval(parsedMessage, env);
					if (wishHandled) {
						return new Response('OK', { status: 200 });
					}

					// *技能名 / *武器名 → 优先武器，降级技能
					const rawText = (parsedMessage.text ?? parsedMessage.message?.text ?? '').trim();
					if (rawText.startsWith('*') && !rawText.startsWith('**')) {
						const starName = rawText.slice(1).trim();
						if (starName) {
							const chatId = parsedMessage.chatId!;
							const threadId = parsedMessage.threadId;
							const userId = String(parsedMessage.from?.id ?? '');
							const opts: any = {};
							if (parsedMessage.isReply && parsedMessage.replyToMessage?.from && !parsedMessage.replyToMessage.from.is_bot) {
								opts.replyToMessageId = parsedMessage.replyToMessage.message_id;
								opts.targetUserId = String(parsedMessage.replyToMessage.from.id);
								opts.targetName = parsedMessage.replyToMessage.from.first_name || opts.targetUserId;
							}
							opts.deleteMsgId = parsedMessage.message?.message_id;

							// 优先级: 武器 > 魔法 > 技能
							const { getEquippedWeapon } = await import('./lib/itemCore');
							const weapon = await getEquippedWeapon(env, String(chatId), userId);
							if (weapon && weapon.damage && (weapon.name === starName || starName === '攻击' || starName === '')) {
								const { performAttack } = await import('./commands/dndAttack');
								await performAttack(env, chatId, threadId, userId, starName, opts);
							} else {
								// 检查是否是有 damage/mana 的魔法
								const starSkill = env.DB ? await env.DB.prepare(
									`SELECT damage, mana_cost FROM dnd_skills WHERE chat_id = ? AND skill_name = ?`
								).bind(String(chatId), starName).first<{ damage: string; mana_cost: number }>() : null;
								if (starSkill && (starSkill.damage || starSkill.mana_cost > 0)) {
									const { performCast } = await import('./commands/dndCast');
									await performCast(env, chatId, threadId, userId, starName, opts);
								} else {
									const { performSkillCheck } = await import('./commands/dndSkill');
									await performSkillCheck(env, chatId, threadId, userId, starName, opts);
								}
							}
						}
					}
					await handleBackup(parsedMessage, env);
				}
			}
		}

		return new Response('OK', { status: 200 });
	},
} satisfies ExportedHandler<Env>;
