import { Api, type Context } from 'grammy';
import { GrammyError } from 'grammy';

export type EnvLike = { TOKEN: string; BOT_USERNAME?: string };
export type CallbackJson = { type: string; [k: string]: any };

export type ParsedUpdate = {
	update: any;
	type: string;
	message?: any;
	callbackQuery?: any;
	chatId: number;
	threadId?: number | undefined;
	from?: any;
	text?: string;
	callbackData?: string | CallbackJson;
	isReply?: boolean;
	replyToMessage?: any;
	isCommand?: boolean;
	command?: string | undefined;
	args?: string[];
	textPreview?: string | undefined;
	forumTopicEdited?: any;
	inlineQuery?: any;
	inlineQueryId?: string;
	offset?: string;
};

type CommandParseResult =
	| { isCommand: true; command: string; args: string[] }
	| { isCommand: false; command?: undefined; args?: undefined };

interface TelegramApiResponse<T = any> {
	ok: boolean;
	result?: T;
	description?: string;
	error_code?: number;
}

function log(prefix: string, ...args: any[]) {
	console.log(`[telegram] ${prefix}`, ...args);
}

function getApi(env: EnvLike): Api {
	return new Api(env.TOKEN);
}

function parseCommandFromText(text: string, botUsername?: string): CommandParseResult {
	const tokens = text.trim().split(/\s+/);
	if (tokens.length === 0) return { isCommand: false };

	const first = tokens[0];
	const splitUnderscore = (namePart: string) => {
		const idx = namePart.indexOf('_');
		if (idx === -1) return { cmd: namePart, suffix: '' };
		return { cmd: namePart.slice(0, idx), suffix: namePart.slice(idx + 1) };
	};

	const parseDotRollShortcut = (token: string, rest: string[]): CommandParseResult | null => {
		if (token.toLowerCase() === '.r') return { isCommand: true, command: 'r', args: rest };
		if (/^\.r(?:\d|d)/i.test(token)) {
			const suffix = token.slice(2);
			return { isCommand: true, command: 'r', args: suffix ? [suffix, ...rest] : rest };
		}
		return null;
	};

	const dotRoll = parseDotRollShortcut(first, tokens.slice(1));
	if (dotRoll) return dotRoll;

	if (first.startsWith('/')) {
		const withoutSlash = first.slice(1);
		const [namePart] = withoutSlash.split('@');
		if (!namePart) return { isCommand: false };

		if (/^r(?:\d|d)/i.test(namePart)) {
			const suffix = namePart.slice(1);
			return { isCommand: true, command: 'r', args: suffix ? [suffix, ...tokens.slice(1)] : tokens.slice(1) };
		}

		const { cmd, suffix } = splitUnderscore(namePart);
		return { isCommand: true, command: cmd, args: suffix ? [suffix, ...tokens.slice(1)] : tokens.slice(1) };
	}

	if (first.startsWith('@')) {
		const mention = first.slice(1).toLowerCase();
		if (botUsername && mention === botUsername.toLowerCase()) {
			const rest = tokens.slice(1);
			if (rest.length === 0) return { isCommand: false };
			const second = rest[0];
			const secondDotRoll = parseDotRollShortcut(second, rest.slice(1));
			if (secondDotRoll) return secondDotRoll;
			const namePart = second.startsWith('/') ? second.slice(1).split('@')[0] : second;
			if (!namePart) return { isCommand: false };
			if (/^r(?:\d|d)/i.test(namePart)) {
				const suffix = namePart.slice(1);
				return { isCommand: true, command: 'r', args: suffix ? [suffix, ...rest.slice(1)] : rest.slice(1) };
			}
			const { cmd, suffix } = splitUnderscore(namePart);
			return { isCommand: true, command: cmd, args: suffix ? [suffix, ...rest.slice(1)] : rest.slice(1) };
		}
	}

	return { isCommand: false };
}

export function parsedUpdateFromContext(ctx: Context, botUsername?: string): ParsedUpdate {
	const update = ctx.update as any;
	const parsed: ParsedUpdate = {
		update,
		type: 'unknown',
		chatId: 0,
		isCommand: false,
		args: [],
	};

	if (ctx.callbackQuery) {
		const callbackQuery = ctx.callbackQuery as any;
		parsed.type = 'callback_query';
		parsed.callbackQuery = callbackQuery;
		parsed.chatId = callbackQuery.message?.chat?.id ?? 0;
		parsed.threadId = callbackQuery.message?.message_thread_id;
		parsed.from = callbackQuery.from;
		if (typeof callbackQuery.data === 'string') {
			try {
				parsed.callbackData = JSON.parse(callbackQuery.data);
			} catch {
				parsed.callbackData = callbackQuery.data;
			}
		}
		return parsed;
	}

	if (ctx.inlineQuery) {
		const inlineQuery = ctx.inlineQuery as any;
		parsed.type = 'inline_query';
		parsed.inlineQuery = inlineQuery;
		parsed.inlineQueryId = inlineQuery.id;
		parsed.from = inlineQuery.from;
		parsed.text = inlineQuery.query ?? '';
		parsed.offset = inlineQuery.offset ?? '';
		parsed.chatId = 0;
		return parsed;
	}

	const message = (ctx.message ?? ctx.channelPost ?? ctx.editedMessage) as any;
	if (message) {
		parsed.type = ctx.editedMessage ? 'edited_message' : ctx.channelPost ? 'channel_post' : 'message';
		parsed.message = message;
		parsed.chatId = message.chat?.id ?? 0;
		parsed.threadId = message.message_thread_id ?? message.reply_to_message?.message_thread_id;
		parsed.from = message.from;
		parsed.text = message.text ?? message.caption ?? '';
		parsed.textPreview = parsed.text?.slice(0, 80);
		parsed.isReply = Boolean(message.reply_to_message);
		parsed.replyToMessage = message.reply_to_message;
		if (message.forum_topic_edited) {
			parsed.type = 'topic_edited';
			parsed.forumTopicEdited = message.forum_topic_edited;
		}
		if (typeof parsed.text === 'string' && parsed.text.trim()) {
			const command = parseCommandFromText(parsed.text, botUsername);
			parsed.isCommand = command.isCommand;
			parsed.command = command.command;
			parsed.args = command.args ?? [];
		}
	}

	return parsed;
}

export async function callTelegramApi(env: EnvLike, method: string, body: any): Promise<TelegramApiResponse> {
	log(`调用 Telegram API -> ${method}`, body);
	try {
		const result = await (getApi(env).raw as any)[method](body);
		return { ok: true, result };
	} catch (error: any) {
		if (error instanceof GrammyError || typeof error?.error_code !== 'undefined') {
			return {
				ok: false,
				error_code: error.error_code,
				description: error.description ?? error.message,
			};
		}
		throw error;
	}
}

const Telegram = {
	isAllowedChat(parsed: ParsedUpdate, allowed: Set<number>) {
		return Boolean(parsed.chatId && allowed.has(parsed.chatId));
	},

	async answerCallbackQuery(
		env: EnvLike,
		callbackQueryId: string,
		opts: { text?: string; show_alert?: boolean; url?: string; cache_time?: number } = {},
	) {
		return await getApi(env).answerCallbackQuery(callbackQueryId, opts);
	},

	async send(env: EnvLike, method: string = 'sendMessage', body: any = {}) {
		return await callTelegramApi(env, method, body);
	},

	async sendText(
		env: EnvLike,
		opts: {
			chat_id: number | string;
			text: string;
			parse_mode?: string;
			reply_markup?: any;
			message_thread_id?: number;
			reply_to_message_id?: number;
			disable_web_page_preview?: boolean;
		},
	) {
		const { chat_id, text, ...other } = opts;
		return await getApi(env).sendMessage(chat_id, text, other as any);
	},

	async sendInline(env: EnvLike, chat_id: number, text: string, replyMarkup: any, threadId?: number) {
		return await getApi(env).sendMessage(chat_id, text, {
			reply_markup: replyMarkup,
			...(threadId ? { message_thread_id: threadId } : {}),
		} as any);
	},

	async sendMediaGroup(env: EnvLike, body: { chat_id: number; media: any[]; message_thread_id?: number }) {
		const { chat_id, media, ...other } = body;
		return await getApi(env).sendMediaGroup(chat_id, media as any, other as any);
	},

	async editMessageText(
		env: EnvLike,
		opts: { text: string; chat_id?: number; message_id?: number; inline_message_id?: string; parse_mode?: string; reply_markup?: any },
	) {
		return await getApi(env).raw.editMessageText(opts as any);
	},

	async deleteMessage(env: EnvLike, chat_id: number, message_id: number) {
		return await getApi(env).deleteMessage(chat_id, message_id);
	},

	async deleteMessageWithDelay(env: EnvLike, chat_id: number, message_id: number, delayMs: number = 3000) {
		return new Promise<void>((resolve) => {
			setTimeout(async () => {
				try {
					await getApi(env).deleteMessage(chat_id, message_id);
				} catch (e) {
					console.warn('延迟删除消息失败（可忽略）', e);
				}
				resolve();
			}, delayMs);
		});
	},

	async sendChatAction(env: EnvLike, chat_id: number, action: string) {
		return await getApi(env).sendChatAction(chat_id, action as any);
	},

	async sendNotice(
		env: EnvLike,
		opts: { chat_id: number; text: string; parse_mode?: string; message_thread_id?: number },
	) {
		return await Telegram.sendText(env, {
			...opts,
			reply_markup: { inline_keyboard: [[{ text: '删除消息', callback_data: JSON.stringify({ type: 'delete_message' }) }]] },
		});
	},

	buildInlineKeyboard(
		buttons: Array<
			Array<{ text: string; callback_data?: string; url?: string; switch_inline_query?: string; switch_inline_query_current_chat?: string }>
		>,
	) {
		return { inline_keyboard: buttons };
	},

	async sendPhoto(
		env: EnvLike,
		opts: {
			chat_id: number;
			photo: string;
			caption?: string;
			parse_mode?: string;
			reply_markup?: any;
			message_thread_id?: number;
			reply_to_message_id?: number;
		},
	) {
		const { chat_id, photo, ...other } = opts;
		return await getApi(env).sendPhoto(chat_id, photo, other as any);
	},

	async editMessageCaption(
		env: EnvLike,
		opts: { caption: string; chat_id?: number; message_id?: number; inline_message_id?: string; parse_mode?: string; reply_markup?: any },
	) {
		return await getApi(env).raw.editMessageCaption(opts as any);
	},

	async checkChatMemberStatus(env: EnvLike, chatId: number | string, userId: number): Promise<any> {
		return await getApi(env).getChatMember(chatId, userId);
	},

	async isUserInChat(env: EnvLike, chatId: number | string, userId: number): Promise<boolean> {
		try {
			const memberInfo = await Telegram.checkChatMemberStatus(env, chatId, userId);
			return ['member', 'restricted', 'administrator', 'creator'].includes(memberInfo.status);
		} catch (error) {
			log(`检查用户 ${userId} 是否在群组失败，默认返回 false`, error);
			return false;
		}
	},

	async getDetailedChatMemberInfo(env: EnvLike, chatId: number | string, userId: number): Promise<any> {
		const memberInfo = await Telegram.checkChatMemberStatus(env, chatId, userId);
		return {
			...memberInfo,
			_isInChat: ['member', 'restricted', 'administrator', 'creator'].includes(memberInfo.status),
			_isAdmin: ['administrator', 'creator'].includes(memberInfo.status),
			_isRestricted: memberInfo.status === 'restricted',
			_hasLeft: memberInfo.status === 'left',
			_isKicked: memberInfo.status === 'kicked',
			_statusDescription: getStatusDescription(memberInfo.status),
		};
	},

	async fetchChatMember(env: EnvLike, chatId: number | string, userId: number) {
		try {
			const member = await getApi(env).getChatMember(chatId, userId);
			const user = (member as any)?.user;
			if (user) {
				const cleanFirstName = String(user.first_name ?? '').replace(/[\(（].*?[\)）]/g, '').trim();
				return {
					first_name: `<a href="tg://user?id=${userId}">${cleanFirstName || userId}</a>`,
					username: String(user.username ?? ''),
				};
			}
			return { first_name: `${userId}`, username: '' };
		} catch (e) {
			log('fetchChatMember 异常', e);
			return { first_name: `${userId}`, username: '' };
		}
	},
};

export function extractCmdContext(parsed: ParsedUpdate): {
	chatId: number;
	threadId: number | undefined;
	from: any;
	args: string[];
} {
	const chatId = parsed.chatId ?? parsed.message?.chat?.id ?? 0;
	const threadId = parsed.threadId ?? parsed.message?.message_thread_id ?? parsed.message?.reply_to_message?.message_thread_id ?? undefined;
	const from = parsed.from ?? parsed.message?.from;
	const args = Array.isArray(parsed.args) ? parsed.args.slice() : [];
	return { chatId, threadId, from, args };
}

function getStatusDescription(status: any) {
	const descriptions: Record<string, string> = {
		creator: '群主',
		administrator: '管理员',
		member: '成员',
		restricted: '受限成员',
		left: '已离开',
		kicked: '已移除',
	};
	return descriptions[String(status)] ?? String(status ?? '未知');
}

export default Telegram;
