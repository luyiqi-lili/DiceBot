/**
 * @file src/index.ts
 * @description Cloudflare Worker 主入口。处理 Telegram Webhook update、外部 API 请求和 Web 页面请求。
 *   通过 src/routes.ts 路由表分发命令到各 command handler，处理 callback_query、inline_query、topic_edited 等事件类型。
 *   同时导出 DurableObject 类以供 wrangler 绑定。
 */

import { Bot, webhookCallback, type Context } from 'grammy';
import TgMessage, { getTelegramApiClientOptions, parsedUpdateFromContext, type ParsedUpdate } from './lib/telegram';
import { incrementUsageCount } from './commands/like';
import { runCoinCheck } from './cron/cron';
import { handleBackup } from './lib/backup';
import { recordReactionAffection, recordReplyAffection } from './lib/affectionInteractions';

import { COMMAND_ROUTES } from './routes';
import { handleWebRequest } from './web/router';
import { createWebGameAuth, isTelegramWebhookRequest } from './lib/telegramAuth';
import { handleApiCredentialAdmin, handleApiKeyDonation } from './lib/apiKeyDonations';
import { handleModelRoutingApi } from './lib/modelRouting';
import { handleGithubTokenHealthApi, handleSelfEvolutionApi, runSelfEvolutionReview } from './lib/selfEvolution';
import { handlePreCheckoutUpdate, handleSuccessfulPaymentUpdate } from './lib/paymentUpdates';
import { LEGACY_CHAT_ID, scopeKey } from './lib/groupScope';

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
	// D1 数据库（dev/prod 分别绑定独立实例）
	DB?: D1Database;
	// 外部 API
	EXTERNAL_API_KEY?: string;
	DONATION_INTAKE_KEY?: string;
	DONATION_ADMIN_KEY?: string;
	DONATION_ENCRYPTION_KEY?: string;
	TON_DONATION_ADDRESS?: string;
	DEEPSEEK_API_KEY?: string;
	/** Workers AI binding; also provides the AI Gateway URL resolver. */
	AI?: Ai;
	AI_GATEWAY_ID?: string;
	AI_GATEWAY_TOKEN?: string;
	/** AI Gateway/Secrets Store management credential used for donated-key lifecycle. */
	AI_GATEWAY_MANAGEMENT_TOKEN?: string;
	AI_GATEWAY_ACCOUNT_ID?: string;
	GEMINI_API_KEY?: string;
	/** Legacy Google AI Studio secret retained by the production Worker. */
	GOOGLE_API_KEY?: string;
	/** Legacy JSON-encoded Google AI Studio key pool retained by production. */
	GOOGLE_API_KEYS?: string;
	GITHUB_REPOSITORY?: string;
	GITHUB_TOKEN?: string;
	GITHUB_PR_SCAN_LIMIT?: string;
	GITHUB_ISSUE_TOKEN?: string;
	GITHUB_ISSUE_INTAKE_ENABLED?: string;
	GITHUB_ISSUE_COOLDOWN_SECONDS?: string;
	GITHUB_AUTONOMY_LABEL?: string;
	GITHUB_ISSUE_SCAN_LIMIT?: string;
	GITHUB_AI_TRIAGE_ENABLED?: string;
	GITHUB_AI_TRIAGE_SCAN_LIMIT?: string;
	GITHUB_AI_TRIAGE_MIN_CONFIDENCE?: string;
	TELEGRAM_WEBHOOK_SECRET?: string;
	TELEGRAM_API_BASE_URL?: string;
};
export { CoinDO } from './durableObjects/coin_do';
export { LotteryDO } from './durableObjects/lottery_do';

/**
 * 处理外部 API 请求（路径以 /api/ 开头）
 */
async function handleExternalAPI(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const path = url.pathname;
	if (path === '/api/donations/api-keys' && request.method === 'POST') {
		return handleApiKeyDonation(request, env);
	}
	if (path.startsWith('/api/donations/api-keys')) return handleApiCredentialAdmin(request, env);

	const apiKey = request.headers.get('X-API-Key') || url.searchParams.get('api_key');
	if (!env.EXTERNAL_API_KEY || apiKey !== env.EXTERNAL_API_KEY) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	if (path.startsWith('/api/coin')) {
		return handleCoinAPI(request, env, path);
	}

	if (path.startsWith('/api/lottery')) {
		return handleLotteryAPI(request, env, path);
	}
	if (path.startsWith('/api/ai/')) return handleModelRoutingApi(request, env);
	if (path === '/api/evolution/candidate') return handleSelfEvolutionApi(request, env);
	if (path === '/api/evolution/github-auth') return handleGithubTokenHealthApi(request, env);

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
	const queryChatId = doUrl.searchParams.get('chat_id');
	doUrl.searchParams.delete('chat_id');

	// External clients historically supplied only a Telegram user ID. Keep those
	// requests pointed at the group that owns the migrated legacy balances, while
	// allowing callers to opt into another group with chat_id.
	const scopeAccountKey = (chatId: string | number, key: string): string => {
		if (key.includes('||') || /^-?\d+:.+$/.test(key)) return key;
		return scopeKey(chatId, key);
	};
	const defaultChatId = queryChatId || String(LEGACY_CHAT_ID);

	if (doPath === '/get' && request.method === 'GET') {
		const key = doUrl.searchParams.get('key');
		if (key) doUrl.searchParams.set('key', scopeAccountKey(defaultChatId, key));
	}

	let scopedBody: string | undefined;
	if (request.method === 'POST' && ['/transfer', '/incr', '/put'].includes(doPath)) {
		try {
			const data = await request.clone().json() as Record<string, unknown>;
			const chatId = queryChatId || (typeof data.chat_id === 'string' || typeof data.chat_id === 'number' ? String(data.chat_id) : String(LEGACY_CHAT_ID));
			delete data.chat_id;
			if (doPath === '/transfer') {
				if (typeof data.from === 'string') data.from = scopeAccountKey(chatId, data.from);
				if (typeof data.to === 'string') data.to = scopeAccountKey(chatId, data.to);
			} else if (typeof data.key === 'string') {
				data.key = scopeAccountKey(chatId, data.key);
			}
			scopedBody = JSON.stringify(data);
		} catch {
			// Preserve the Durable Object's existing invalid-body response.
		}
	}

	const doRequest = new Request(doUrl, {
		method: request.method,
		headers: request.headers,
		body: scopedBody ?? request.body,
	});

	return await stub.fetch(doRequest);
}

async function handleLotteryAPI(request: Request, env: Env, path: string): Promise<Response> {
	const id = env.LOTTERY_DO.idFromName('lottery');
	const stub = env.LOTTERY_DO.get(id);

	const doPath = path.replace('/api/lottery', '') || '/';
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
		case 'top':     { const { handleTop } = await import('./commands/top'); return handleTop; }
		case 'book':    { const { handleBook } = await import('./commands/book'); return handleBook; }
		case 'whoami':  { const { handleWhoami } = await import('./commands/whoami'); return handleWhoami; }
		case 'perm':    { const { handlePerm } = await import('./commands/perm'); return handlePerm; }
		case 'topic':   { const { handleTopic } = await import('./commands/topic'); return handleTopic; }
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
		case 'status':  { const { handleStatus } = await import('./commands/status'); return handleStatus; }
		case 'trans':   { const { handleTrans } = await import('./commands/trans'); return handleTrans; }
		case 'quota':   { const { handleQuota } = await import('./commands/quota'); return handleQuota; }
		case 'check':   { const { handleCheck } = await import('./commands/check'); return handleCheck; }
		case 'f': case 'fish': { const { handleFish } = await import('./commands/fish'); return handleFish; }
		case 'coin':    { const { handleCoin } = await import('./commands/coin'); return handleCoin; }
		case 'echo':    { const { handleEcho } = await import('./commands/echo'); return handleEcho; }
		case 'like':    { const { handleLike } = await import('./commands/like'); return handleLike; }
		case 'duel':    { const { handleDuel } = await import('./commands/duel'); return handleDuel; }
		case 'groll':   { const { handleGroll } = await import('./commands/groll'); return handleGroll; }
		case '21':      { const { handle21 } = await import('./commands/21'); return handle21; }
		case 'news':    { const { handleNews } = await import('./commands/news'); return handleNews; }
		case 'rule':    { const { handleRule } = await import('./commands/rule'); return handleRule; }
		case 'wish': case 'issue': { const { handleWish } = await import('./commands/wish'); return handleWish; }
		case 'donatetoken': { const { handleDonateToken } = await import('./commands/donateToken'); return handleDonateToken; }
		case 'revoketoken': case 'revoke': { const { handleRevokeToken } = await import('./commands/revokeToken'); return handleRevokeToken; }
		case 'donate': { const { handleDonate } = await import('./commands/donateMoney'); return handleDonate; }
		case 'paysupport': { const { handlePaySupport } = await import('./commands/paymentSupport'); return handlePaySupport; }
		case 'terms': case 'donateterms': { const { handleDonationTerms } = await import('./commands/paymentSupport'); return handleDonationTerms; }
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
		case 'donation': { const { handleDonationCallback } = await import('./commands/donateMoney'); return handleDonationCallback; }
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

async function handleTelegramContext(botCtx: Context, env: Env, executionCtx: ExecutionContext): Promise<void> {
	if (await handlePreCheckoutUpdate(botCtx, env)) return;
	if (await handleSuccessfulPaymentUpdate(botCtx, env)) return;
	const parsedMessage = parsedUpdateFromContext(botCtx, env.BOT_USERNAME);

	if (
		parsedMessage.type === 'business_connection'
		|| parsedMessage.type === 'business_message'
		|| parsedMessage.type === 'edited_business_message'
		|| parsedMessage.type === 'deleted_business_messages'
	) {
		const { handleBusinessSecretary } = await import('./commands/businessSecretary');
		await handleBusinessSecretary(parsedMessage, env);
		return;
	}

	// 群组白名单已放开：机器人在其被加入的任意群组均可使用。
	// 数据按 chat_id 隔离存储，无需再对 chatId 做准入过滤。

	console.log('index:parsedMessage.type', parsedMessage.type);

	switch (parsedMessage.type) {
		case 'topic_created':
		case 'topic_edited': {
			console.log('index: 检测到 topic 事件', parsedMessage.type);
			try {
				const { handleTopicEdited } = await import('./commands/topicEditHandler');
				await handleTopicEdited(parsedMessage, env);
			} catch (e) {
				console.error('❌ handleTopicEdited 失败', e);
			}
			return;
		}

		case 'message_reaction': {
			await recordReactionAffection(parsedMessage, env);
			return;
		}

		case 'callback_query': {
			const callbackQuery = parsedMessage.callbackQuery;
			const callbackData = parsedMessage.callbackData;
			console.log('index: callbackData', typeof callbackData, callbackData);

			if (callbackQuery.game_short_name) {
				const game = callbackQuery.game_short_name;
				console.log('index: game_short_name', game);
				if (game === 'hello') {
					const userId = callbackQuery.from.id;
					const userName = callbackQuery.from.first_name || 'User';
					const authTs = Math.floor(Date.now() / 1000);
					const gameUrl = new URL('https://telegram-bot.luyiqi-lili.workers.dev/web/hello');
					gameUrl.searchParams.set('user_id', userId.toString());
					gameUrl.searchParams.set('auth_ts', authTs.toString());
					gameUrl.searchParams.set('auth', await createWebGameAuth(env, { userId: userId.toString(), game: 'hello', issuedAt: authTs }));
					gameUrl.searchParams.set('username', encodeURIComponent(userName));
					gameUrl.searchParams.set('user_last_name', encodeURIComponent(callbackQuery.from.last_name || ''));
					gameUrl.searchParams.set('user_username', callbackQuery.from.username || '');
					gameUrl.searchParams.set('start_param', callbackQuery.start_param);
					gameUrl.searchParams.set('chat_id', parsedMessage.chatId?.toString() || '');
					gameUrl.searchParams.set('message_id', callbackQuery.message?.message_id?.toString() || '');
					gameUrl.searchParams.set('inline_message_id', callbackQuery.inline_message_id || '');
					await botCtx.api.answerCallbackQuery(callbackQuery.id, { url: gameUrl.toString() });
					return;
				}
				if (game === 'fish') {
					const userId = callbackQuery.from.id;
					const userName = callbackQuery.from.first_name || 'User';
					const authTs = Math.floor(Date.now() / 1000);
					const gameUrl = new URL('https://telegram-bot.luyiqi-lili.workers.dev/web/fish');
					gameUrl.searchParams.set('user_id', userId.toString());
					gameUrl.searchParams.set('auth_ts', authTs.toString());
					gameUrl.searchParams.set('auth', await createWebGameAuth(env, { userId: userId.toString(), game: 'fish', issuedAt: authTs }));
					gameUrl.searchParams.set('username', encodeURIComponent(userName));
					if (callbackQuery.inline_message_id) {
						gameUrl.searchParams.set('inline_message_id', callbackQuery.inline_message_id);
					}
					await botCtx.api.answerCallbackQuery(callbackQuery.id, { url: gameUrl.toString() });
					return;
				}
			}

			if (typeof callbackData === 'object' && callbackData.type) {
				const cbType = callbackData.type;
				console.log('index: callbackData.type', cbType);

				if (cbType === 'delete_message') {
					await botCtx.api.deleteMessage(callbackQuery.message.chat.id, callbackQuery.message.message_id);
					await botCtx.api.answerCallbackQuery(callbackQuery.id, { text: '消息已删除', show_alert: true });
					return;
				}

				const handler = await loadCallback(cbType);
				if (handler) {
					console.log(`➡️ 处理 ${cbType} 回调`);
					await handler(parsedMessage.callbackQuery, callbackData, env);
					return;
				}

				console.log('ℹ️ 未知 callback type，忽略', callbackData);
			}
			return;
		}

		case 'message': {
			await recordReplyAffection(parsedMessage, env);
			console.log('main:isCommand', parsedMessage.isCommand);
			if (parsedMessage.isCommand) {
				console.log('main:command', parsedMessage.command);
				executionCtx.waitUntil(incrementUsageCount(parsedMessage, env));

				const cmd = parsedMessage.command;
				if (cmd) {
					const handler = await loadCommand(cmd);
					if (handler) {
						console.log(`index: 检测到 /${cmd} 命令`);
						await handler(parsedMessage, env);
						const route = COMMAND_ROUTES[cmd];
						if (!route || route.deleteMsg !== false) {
							executionCtx.waitUntil(TgMessage.deleteMessageWithDelay(env, parsedMessage.message.chat.id, parsedMessage.message.message_id));
						}
						console.log(`index: /${cmd} 处理完成`);
						return;
					}

					console.log('index: 未知命令，发送默认帮助提示');
					const { handleDefaultHelp } = await import('./commands/help');
					await handleDefaultHelp(parsedMessage, env);
					return;
				}
			} else {
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

						const { getEquippedWeapon } = await import('./lib/itemCore');
						const weapon = await getEquippedWeapon(env, String(chatId), userId);
						if (weapon && weapon.damage && (weapon.name === starName || starName === '攻击' || starName === '')) {
							const { performAttack } = await import('./commands/dndAttack');
							await performAttack(env, chatId, threadId, userId, starName, opts);
						} else {
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
}

function createTelegramBot(env: Env, executionCtx: ExecutionContext): Bot {
	const botId = Number(String(env.TOKEN).split(':')[0]) || 0;
	const bot = new Bot(env.TOKEN, {
		client: getTelegramApiClientOptions(env),
		botInfo: {
			id: botId,
			is_bot: true,
			first_name: env.BOT_USERNAME || 'Bot',
			username: env.BOT_USERNAME || 'Bot',
			can_join_groups: true,
			can_read_all_group_messages: false,
			supports_inline_queries: true,
			can_connect_to_business: true,
			has_main_web_app: false,
		} as any,
	});
	bot.use(async (ctx) => {
		await handleTelegramContext(ctx, env, executionCtx);
	});
	return bot;
}

/** Worker 入口：Cron Trigger + HTTP Fetch */
export default {
	async scheduled(controller, env, ctx) {
		ctx.waitUntil(runCoinCheck(env));
		ctx.waitUntil(runSelfEvolutionReview(env));
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

		if (request.method === 'POST' && !isTelegramWebhookRequest(request, env)) {
			console.warn('index: 拒绝非 Telegram 来源 webhook 请求', {
				ip: request.headers.get('CF-Connecting-IP') ?? '',
			});
			return new Response('Forbidden', { status: 403 });
		}

		console.log('index: 收到请求', { method: request.method, url: request.url });

		// 2. 非 POST 存活检查
		if (request.method !== 'POST') {
			console.log('index: 非 POST 请求，返回存活内容');
			return new Response('I am alive', { status: 200 });
		}

		try {
			await request.clone().json();
			const bot = createTelegramBot(env, ctx);
			return await webhookCallback(bot, 'cloudflare-mod', {
				timeoutMilliseconds: 30000,
			})(request);
		} catch (e) {
			if (e instanceof SyntaxError) {
				console.error('index: 无法解析 JSON', e);
				return new Response('Bad Request', { status: 400 });
			}
			console.error('index: Telegram webhook 处理失败，已确认 update 避免重试堆积', e);
			return new Response('OK', { status: 200 });
		}
	},
} satisfies ExportedHandler<Env>;
