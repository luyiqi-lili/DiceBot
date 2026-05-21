/*
  lib/tgMessage.ts

  目标：
    - 负责分析收到的 update（来自 Telegram webhook）的类型
    - 抽象出常用判断（是否为 callback_query、是否为 reply、是否为命令、是否定向给 bot 等）
    - 提供统一的发送/编辑消息能力（sendMessage, editMessageText, sendMediaGroup, answerCallbackQuery 等）
    - 提供详细日志（console.log）与中文注释，便于在 Cloudflare Workers 环境调试

  使用方式示例：
    import TgMessage, { ParsedUpdate } from './lib/tgMessage';

    const parsed = TgMessage.parseUpdate(update);
    if (parsed.type === 'callback_query') {
      await TgMessage.answerCallbackQuery(env, parsed.callbackQuery!.id);
      // 然后处理 callback
    } else if (parsed.type === 'message') {
      if (parsed.isCommand) {
        // 处理命令
      }
    }

    // 发送文本
    await TgMessage.sendText(env, { chat_id: 123, text: 'hello' });

    // 发送媒体组
    await TgMessage.sendMediaGroup(env, {
      chat_id: 123,
      media: [ { type: 'photo', media: 'https://...' } ]
    });

  说明：此模块只做消息解析与 Telegram HTTP API 封装，不直接管理业务逻辑（如命令分发）。
*/

// Types
export type EnvLike = { TOKEN: string; BOT_USERNAME?: string };
export type CallbackJson = { type: string; [k: string]: any };

export type ParsedUpdate = {
	// 原始 update
	update: any;
	// 类型：'message' | 'channel_post' | 'callback_query' | 'edited_message' | 'unknown'
	type: string;
	// 消息主体（当 type 为 message/channel_post/edited_message 时）
	message?: any;
	// callback_query（当 type 为 callback_query 时）
	callbackQuery?: any;
	// 来源 chat id（优先 message.chat.id -> callback_query.message.chat.id）
	chatId: number;
	// 线程 id（存在则填充）
	threadId?: number | undefined;
	// 来自用户的基本信息（如果有）
	from?: any;
	// 文本（如果存在）
	text?: string;
	// callback_data（如果是 callback_query）
	callbackData?: string | CallbackJson;
	// 是否是 reply（针对 message）
	isReply?: boolean;
	// 被回复的 message（如果存在）
	replyToMessage?: any;
	// 是否以命令/提及形式定向给机器人
	isCommand?: boolean;
	// 命令名称（不含斜线），如果有
	command?: string | undefined;
	// 命令参数数组
	args?: string[];
	// 原始 update 中的文本首段（方便短文本判断）
	textPreview?: string | undefined;

	forumTopicEdited?: any;
	inlineQuery?: any;
	inlineQueryId?: string;
	offset?: string;
};
interface TelegramApiResponse<T = any> {
	ok: boolean;
	result?: T;
	description?: string;
	error_code?: number;
}
// 简单的 logger，统一格式
function log(prefix: string, ...args: any[]) {
	console.log(`🔔 [tgMessage] ${prefix}`, ...args);
}

// 将 fetch 请求封装为一个函数，便于复用并输出详细日志
export async function callTelegramApi(env: EnvLike, method: string, body: any) {
	const url = `https://api.telegram.org/bot${env.TOKEN}/${method}`;
	log(`调用 Telegram API -> ${method}`, body);
	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
		const json: TelegramApiResponse = await res.json();
		if (!json.ok) {
			log(`⚠️ ${method} 返回失败`, json);
		} else {
			log(`✅ ${method} 成功`, json);
		}
		return json;
	} catch (err) {
		log(`❌ ${method} 调用异常`, err);
		throw err;
	}
}

// 解析命令文本（例如 "/roll 1d6+1" 或 "@Bot roll 1d6"）
// 这个函数做了几个增强：
// 1. 保持原有对 "/cmd"、"/cmd@Bot"、"@Bot cmd" 的支持
// 2. 额外识别像 "/rd10"、"/r2d10" 这类快捷写法 —— 将视作命令名 "r" 并把后缀作为第一个参数
// 例如: "/rd10" -> command: "r", args: ["d10"]; "/r2d10" -> command: "r", args: ["2d10"]
// 3. 对大小写不敏感地处理 bot username 比对
function parseCommandFromText(text: string, botUsername?: string) {
	log('解析命令');
	const tokens = text.trim().split(/\s+/);
	log('分割字符', tokens);
	if (tokens.length === 0) return { isCommand: false };

	const first = tokens[0];

	// 辅助：把像 "coin_check_more" -> { command: "coin", suffix: "check_more" }
	const splitUnderscore = (namePart: string) => {
		const idx = namePart.indexOf('_');
		if (idx === -1) return { cmd: namePart, suffix: '' };
		const cmd = namePart.slice(0, idx);
		const suffix = namePart.slice(idx + 1);
		return { cmd, suffix };
	};

	// 1. 以斜线开头的常规命令，例如 "/roll"、"/roll@Bot"、"/rd10"、"/r2d10"、"/coin_check"
	if (first.startsWith('/')) {
		// 去掉起始的 '/'
		// 并且移除尾随的 @username 部分（如果存在）
		const withoutSlash = first.slice(1);
		const [namePart] = withoutSlash.split('@'); // e.g. 'rd10' 或 'r2d10' 或 'roll' 或 'coin_check'

		if (!namePart) return { isCommand: false };

		// 优先处理 /r2d10 /rd10 这种快捷写法 —— 仍然保留原行为
		if (/^r(?:\d|d)/i.test(namePart)) {
			const suffix = namePart.slice(1); // 'd10' | '2d10' | '123'
			const args: string[] = [];
			if (suffix) args.push(suffix);
			args.push(...tokens.slice(1));
			return { isCommand: true, command: 'r', args };
		}

		// 支持用下划线把命令名和第一个参数连写的形式：/coin_check -> command: 'coin', args: ['check', ...]
		const { cmd, suffix } = splitUnderscore(namePart);
		if (suffix) {
			const args = [] as string[];
			args.push(suffix);
			args.push(...tokens.slice(1));
			return { isCommand: true, command: cmd, args };
		}

		// 普通的 '/cmd' 或 '/cmd@Bot' 处理（拆 @）
		const [nameOnly] = namePart.split('@');
		return { isCommand: true, command: nameOnly, args: tokens.slice(1) };
	}

	// 2. 形如 "@BotUsername cmd ..." 的情况（或者 "@BotUsername coin_check ..."）
	if (botUsername && first.toLowerCase() === `@${botUsername.toLowerCase()}`) {
		const second = tokens[1] || '';
		if (!second) return { isCommand: false };

		if (second.startsWith('/')) {
			const [name] = second.slice(1).split('@');
			// 这里也支持 /coin_check 这种情况
			const { cmd, suffix } = splitUnderscore(name);
			const args: string[] = [];
			if (suffix) args.push(suffix);
			args.push(...tokens.slice(2));
			return { isCommand: true, command: cmd, args };
		}

		// second 本身可能是 coin_check（不带斜线）
		if (second.includes('_')) {
			const idx = second.indexOf('_');
			const cmd = second.slice(0, idx);
			const suffix = second.slice(idx + 1);
			const args = [] as string[];
			if (suffix) args.push(suffix);
			args.push(...tokens.slice(2));
			return { isCommand: true, command: cmd, args };
		}

		return { isCommand: true, command: second, args: tokens.slice(2) };
	}

	// 3. 兼容以 "/r" 或其他常规命令直接出现（不带 bot username） — 已在上面处理过，但保留兜底
	if (first.startsWith('/')) {
		const [name] = first.slice(1).split('@');
		return { isCommand: true, command: name, args: tokens.slice(1) };
	}

	return { isCommand: false };
}

function parseCallbackData(raw: unknown): string | CallbackJson | undefined {
	if (typeof raw !== 'string') return undefined;
	try {
		const obj = JSON.parse(raw);
		if (obj && typeof obj === 'object') {
			return obj as CallbackJson;
		}
		return raw;
	} catch {
		return raw;
	}
}

const TgMessage = {
	// 将 webhook 收到的完整 update 解析为统一结构
	parseUpdate(update: any, botUsername?: string): ParsedUpdate {
		const parsed: ParsedUpdate = {
			update,
			chatId: 0,
			type: 'unknown',
		};

		// callback_query 优先判断
		if (update.callback_query) {
			parsed.type = 'callback_query';
			parsed.callbackQuery = update.callback_query;
			parsed.callbackData = update.callback_query.data;
			parsed.from = update.callback_query.from;

			parsed.callbackData = parseCallbackData(update.callback_query.data);

			// callback 可能来自内联消息（inline_message_id）或者 message
			if (update.callback_query.message) {
				parsed.message = update.callback_query.message;
				parsed.chatId = update.callback_query.message.chat?.id;
				parsed.threadId = update.callback_query.message.message_thread_id ?? update.callback_query.message?.message_thread_id;
			}
			log('解析到 callback_query', { callbackData: parsed.callbackData, chatId: parsed.chatId });
			return parsed;
		}
		// 添加 inline_query 类型解析
		if (update.inline_query) {
			parsed.type = 'inline_query';
			parsed.inlineQuery = update.inline_query; // 新增字段
			parsed.from = update.inline_query.from;

			// inline_query 没有 chatId，但我们需要用户 ID 来查询历史
			parsed.chatId = 0; // 设为 0，后续通过数据库查询
			parsed.text = update.inline_query.query; // 用户输入的查询内容

			// 记录 inline_query 的 id 和 offset（用于分页）
			parsed.inlineQueryId = update.inline_query.id;
			parsed.offset = update.inline_query.offset || '';

			log('解析到 inline_query', {
				from: parsed.from,
				query: parsed.text,
				inlineQueryId: parsed.inlineQueryId,
			});
			return parsed;
		}
		// 普通消息（message / edited_message / channel_post）
		if (update.message) {
			parsed.message = update.message;
			// 如果 message 含有 forum_topic_edited 字段，优先把类型标为 topic_edited
			if (update.message.forum_topic_edited) {
				parsed.type = 'topic_edited';
				parsed.forumTopicEdited = update.message.forum_topic_edited;
			} else {
				parsed.type = 'message';
			}
		} else if (update.edited_message) {
			parsed.type = 'edited_message';
			parsed.message = update.edited_message;
		} else if (update.channel_post) {
			parsed.type = 'channel_post';
			parsed.message = update.channel_post;
		}

		if (parsed.message) {
			parsed.chatId = parsed.message.chat?.id;
			// Telegram 论坛/主题支持 message_thread_id
			parsed.threadId = parsed.message.message_thread_id ?? parsed.message?.message_thread_id;
			parsed.from = parsed.message.from;
			parsed.text = parsed.message.text ?? parsed.message.caption ?? undefined;
			parsed.textPreview = parsed.text ? parsed.text.slice(0, 200) : undefined;

			// 判断是否为 reply —— 按照你的规则：
			// 只要存在 reply_to_message.message_id，并且该 message_id 与 message_thread_id 不相等，就认定为 reply
			parsed.isReply = false;
			parsed.replyToMessage = undefined;

			const rt = parsed.message.reply_to_message;
			if (rt && typeof rt === 'object' && typeof rt.message_id === 'number') {
				// parsed.threadId 在上面已经从 parsed.message.message_thread_id 填充过（如果存在）
				const threadId = parsed.threadId; // 可能为 undefined
				log('reply 判断 threadId', threadId);
				log('reply 判断 message_id', rt.message_id);

				if (rt.message_id !== threadId) {
					parsed.isReply = true;
					parsed.replyToMessage = rt;
				} else {
					parsed.isReply = false;
					parsed.replyToMessage = undefined;
				}
			}
			log('reply 判断 parsed', parsed);
			log('reply 判断 parsed.message', parsed.message);
			log('reply 判断 reply_to_message', rt);
			log('reply 判断', parsed.isReply);

			// 判断是否为命令 / 是否定向给 bot（@BotUsername）
			if (parsed.text) {
				const cmd = parseCommandFromText(parsed.text, botUsername);
				parsed.isCommand = !!cmd.isCommand;
				parsed.command = cmd.command;
				parsed.args = cmd.args || [];
			} else {
				parsed.isCommand = false;
			}

			log(`解析到 ${parsed.type}`, {
				chatId: parsed.chatId,
				threadId: parsed.threadId,
				from: parsed.from && parsed.from.id,
				isReply: parsed.isReply,
				isCommand: parsed.isCommand,
				command: parsed.command,
			});

			return parsed;
		}

		log('未识别的 update 类型', update);
		return parsed;
	},

	// 快速检查：是否为来自某些允许的群组
	// 用法：if (!TgMessage.isAllowedChat(parsed, new Set([-1001, -1002]))) return;
	isAllowedChat(parsed: ParsedUpdate, allowed: Set<number>) {
		if (!parsed.chatId) return false;
		return allowed.has(parsed.chatId);
	},

	// 回答 callback_query（结束客户端 loading 状态）
	async answerCallbackQuery(
		env: EnvLike,
		callbackQueryId: string,
		opts: { text?: string; show_alert?: boolean; url?: string; cache_time?: number } = {},
	) {
		const body = { callback_query_id: callbackQueryId, ...opts };
		return await callTelegramApi(env, 'answerCallbackQuery', body);
	},

	// 发送通用消息（封装）
	// 支持传入 sendMessage 的参数（包括 reply_markup）以及其他 method
	async send(env: EnvLike, method: string = 'sendMessage', body: any = {}) {
		// 统一打印日志
		return await callTelegramApi(env, method, body);
	},

	/**
	 * 发送文本消息的便捷函数（更宽松的参数，支持 reply_to_message_id 等）
	 * opts: { chat_id, text, parse_mode, reply_markup, message_thread_id, reply_to_message_id, disable_web_page_preview }
	 */
	async sendText(
		env: EnvLike,
		opts: {
			chat_id: number;
			text: string;
			parse_mode?: string;
			reply_markup?: any;
			message_thread_id?: number;
			reply_to_message_id?: number;
			disable_web_page_preview?: boolean;
		},
	) {
		const body: any = { chat_id: opts.chat_id, text: opts.text };

		if (opts.parse_mode) body.parse_mode = opts.parse_mode;
		if (opts.reply_markup) body.reply_markup = opts.reply_markup;
		if (typeof opts.message_thread_id !== 'undefined') body.message_thread_id = opts.message_thread_id;
		if (typeof opts.reply_to_message_id !== 'undefined') body.reply_to_message_id = opts.reply_to_message_id;
		if (typeof opts.disable_web_page_preview !== 'undefined') body.disable_web_page_preview = opts.disable_web_page_preview;

		return await TgMessage.send(env, 'sendMessage', body);
	},

	/**
	 * 发送带 inline_keyboard 的消息
	 * replyMarkup: 与 Telegram API 的 reply_markup 格式一致
	 */
	async sendInline(env: EnvLike, chat_id: number, text: string, replyMarkup: any, threadId?: number) {
		const body: any = { chat_id, text, reply_markup: replyMarkup };
		if (threadId) body.message_thread_id = threadId;
		return await TgMessage.send(env, 'sendMessage', body);
	},

	/**
	 * 发送媒体组（支持 photos / videos）
	 * body 示例： { chat_id: 123, media: [ { type: 'photo', media: 'file_id|http_url' , caption?: '' } ] }
	 */
	async sendMediaGroup(env: EnvLike, body: { chat_id: number; media: any[]; message_thread_id?: number }) {
		const payload: any = { chat_id: body.chat_id, media: body.media };
		if (body.message_thread_id) payload.message_thread_id = body.message_thread_id;
		return await TgMessage.send(env, 'sendMediaGroup', payload);
	},

	/**
	 * 编辑消息文本（支持 inline message id 或 chat/message）
	 * opts 可包含 chat_id/message_id 或 inline_message_id
	 */
	async editMessageText(
		env: EnvLike,
		opts: { text: string; chat_id?: number; message_id?: number; inline_message_id?: string; parse_mode?: string; reply_markup?: any },
	) {
		const body: any = { text: opts.text };
		if (opts.chat_id) body.chat_id = opts.chat_id;
		if (opts.message_id) body.message_id = opts.message_id;
		if (opts.inline_message_id) body.inline_message_id = opts.inline_message_id;
		if (opts.parse_mode) body.parse_mode = opts.parse_mode;
		if (opts.reply_markup) body.reply_markup = opts.reply_markup;
		return await TgMessage.send(env, 'editMessageText', body);
	},

	// 删除消息便捷函数
	async deleteMessage(env: EnvLike, chat_id: number, message_id: number) {
		return await TgMessage.send(env, 'deleteMessage', { chat_id, message_id });
	},

	// 发 chat action（typing、upload_photo 等）
	async sendChatAction(env: EnvLike, chat_id: number, action: string) {
		return await TgMessage.send(env, 'sendChatAction', { chat_id, action });
	},

	/**
	 * 发送带删除按钮的通知消息（便捷封装）
	 * 自动附加 deleteMarkup，省去手动添加 reply_markup
	 */
	async sendNotice(
		env: EnvLike,
		opts: {
			chat_id: number;
			text: string;
			parse_mode?: string;
			message_thread_id?: number;
		},
	) {
		const body: any = { chat_id: opts.chat_id, text: opts.text };
		if (opts.parse_mode) body.parse_mode = opts.parse_mode;
		if (typeof opts.message_thread_id !== 'undefined') body.message_thread_id = opts.message_thread_id;
		body.reply_markup = { inline_keyboard: [[{ text: '删除消息', callback_data: JSON.stringify({ type: 'delete_message' }) }]] };
		return await TgMessage.send(env, 'sendMessage', body);
	},

	// 构造一个常用的 inline keyboard 快速函数
	buildInlineKeyboard(
		buttons: Array<
			Array<{ text: string; callback_data?: string; url?: string; switch_inline_query?: string; switch_inline_query_current_chat?: string }>
		>,
	) {
		return { inline_keyboard: buttons };
	},

	/**
	 * 发送图片消息（支持 caption 和 inline keyboard）
	 * opts: { chat_id, photo, caption, parse_mode, reply_markup, message_thread_id, reply_to_message_id }
	 */
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
		const body: any = {
			chat_id: opts.chat_id,
			photo: opts.photo,
		};

		if (opts.caption) body.caption = opts.caption;
		if (opts.parse_mode) body.parse_mode = opts.parse_mode;
		if (opts.reply_markup) body.reply_markup = opts.reply_markup;
		if (typeof opts.message_thread_id !== 'undefined') body.message_thread_id = opts.message_thread_id;
		if (typeof opts.reply_to_message_id !== 'undefined') body.reply_to_message_id = opts.reply_to_message_id;

		return await TgMessage.send(env, 'sendPhoto', body);
	},
	// 在 TgMessage 对象中添加以下方法：

	/**
	 * 编辑消息的 caption（适用于图片、视频等媒体消息）
	 * opts 可包含 chat_id/message_id 或 inline_message_id
	 */
	async editMessageCaption(
		env: EnvLike,
		opts: {
			caption: string;
			chat_id?: number;
			message_id?: number;
			inline_message_id?: string;
			parse_mode?: string;
			reply_markup?: any;
		},
	) {
		const body: any = { caption: opts.caption };
		if (opts.chat_id) body.chat_id = opts.chat_id;
		if (opts.message_id) body.message_id = opts.message_id;
		if (opts.inline_message_id) body.inline_message_id = opts.inline_message_id;
		if (opts.parse_mode) body.parse_mode = opts.parse_mode;
		if (opts.reply_markup) body.reply_markup = opts.reply_markup;
		return await TgMessage.send(env, 'editMessageCaption', body);
	},

	// 在 TgMessage 对象中添加以下方法：

	/**
	 * 检查用户是否在指定群组中
	 * 核心方法：调用 getChatMember API 并解析用户状态
	 *
	 * @param env - 包含 BOT_TOKEN 的环境对象
	 * @param chatId - 要检查的群组ID (支持数字ID或@username格式)
	 * @param userId - 要检查的用户ID
	 * @returns 返回完整的 ChatMember 对象，可通过 status 字段判断用户状态
	 *
	 * 使用示例：
	 * const memberInfo = await TgMessage.checkChatMemberStatus(env, -100123456789, 987654321);
	 * if (memberInfo.status === 'member' || memberInfo.status === 'administrator' || memberInfo.status === 'creator') {
	 *   // 用户在群内
	 * }
	 *
	 * 主要状态说明：
	 * - 'creator': 群组创建者
	 * - 'administrator': 管理员
	 * - 'member': 普通成员
	 * - 'restricted': 受限成员（仍在群内但权限受限）
	 * - 'left': 已离开群组
	 * - 'kicked': 已被踢出/封禁
	 */
	async checkChatMemberStatus(env: EnvLike, chatId: number | string, userId: number): Promise<any> {
		const method = 'getChatMember';
		const body = {
			chat_id: chatId,
			user_id: userId,
		};

		log(`检查用户 ${userId} 在群组 ${chatId} 的成员状态`, body);

		try {
			const response = await callTelegramApi(env, method, body);

			if (response.ok && response.result) {
				log(`✅ ${method} 成功 - 用户状态: ${response.result.status}`, response.result);
				return response.result;
			} else {
				log(`⚠️ ${method} 失败`, response);
				// 可以根据不同的错误代码进行更详细的处理
				if (response.error_code === 400) {
					throw new Error(`请求参数错误: ${response.description || '未知错误'}`);
				} else if (response.error_code === 403) {
					throw new Error(`机器人无权查询此群组成员信息（可能需要管理员权限）`);
				} else if (response.error_code === 404) {
					throw new Error(`用户 ${userId} 未找到或不在群组中`);
				}
				throw new Error(`Telegram API 错误: ${response.description || '未知错误'}`);
			}
		} catch (error) {
			log(`❌ ${method} 调用异常`, error);
			throw error;
		}
	},

	/**
	 * 便捷函数：快速判断用户是否在指定群组中
	 *
	 * @param env - 包含 BOT_TOKEN 的环境对象
	 * @param chatId - 要检查的群组ID
	 * @param userId - 要检查的用户ID
	 * @returns boolean - true 表示用户在群内，false 表示不在群内或查询失败
	 *
	 * 使用示例：
	 * const isMember = await TgMessage.isUserInChat(env, -100123456789, 987654321);
	 * if (isMember) {
	 *   // 处理用户是群成员的情况
	 * }
	 */
	async isUserInChat(env: EnvLike, chatId: number | string, userId: number): Promise<boolean> {
		try {
			const memberInfo = await TgMessage.checkChatMemberStatus(env, chatId, userId);

			// 判断用户是否在群内的状态
			const inChatStatuses = ['member', 'restricted', 'administrator', 'creator'];

			const isInChat = inChatStatuses.includes(memberInfo.status);
			log(`用户 ${userId} 在群组 ${chatId} 中: ${isInChat} (状态: ${memberInfo.status})`);

			return isInChat;
		} catch (error) {
			// 查询失败时，保守返回 false
			log(`⚠️ 检查用户 ${userId} 是否在群组失败，默认返回 false`, error);
			return false;
		}
	},

	/**
	 * 获取用户在群组中的详细信息（增强版）
	 * 结合了成员状态和用户信息，适用于需要更多上下文的场景
	 *
	 * @param env - 包含 BOT_TOKEN 的环境对象
	 * @param chatId - 群组ID
	 * @param userId - 用户ID
	 * @returns 包含状态和用户信息的对象，格式为:
	 *   {
	 *     status: 'member' | 'administrator' | 'creator' | 'restricted' | 'left' | 'kicked',
	 *     user: { id, first_name, last_name, username, ... },
	 *     custom_title?: string,  // 管理员自定义头衔
	 *     until_date?: number,    // 限制/封禁截止时间
	 *     can_send_messages?: boolean, // 是否能发送消息
	 *     // ... 其他字段根据状态不同而存在
	 *   }
	 */
	async getDetailedChatMemberInfo(env: EnvLike, chatId: number | string, userId: number): Promise<any> {
		const memberInfo = await TgMessage.checkChatMemberStatus(env, chatId, userId);

		// 为不同状态添加一些有用的计算属性
		const enhancedInfo = {
			...memberInfo,
			// 添加一些便捷的计算属性
			_isInChat: ['member', 'restricted', 'administrator', 'creator'].includes(memberInfo.status),
			_isAdmin: ['administrator', 'creator'].includes(memberInfo.status),
			_isRestricted: memberInfo.status === 'restricted',
			_hasLeft: memberInfo.status === 'left',
			_isKicked: memberInfo.status === 'kicked',
			_statusDescription: getStatusDescription(memberInfo.status),
		};

		log(`获取用户 ${userId} 的详细群组信息`, {
			status: enhancedInfo.status,
			isInChat: enhancedInfo._isInChat,
			isAdmin: enhancedInfo._isAdmin,
		});

		return enhancedInfo;
	},

	/**
	 * 获取 chat 中某个 user 的信息（first_name, username）
	 * - 直接调用 getChatMember Telegram API
	 * - 返回示例：{ first_name: '张三', username: 'zhangsan' }
	 */
	async fetchChatMember(env: EnvLike, chatId: number, userId: number) {
		try {
			const res = await callTelegramApi(env, 'getChatMember', { chat_id: chatId, user_id: userId });
			if (res && res.ok && res.result && (res.result as any).user) {
				const u = (res.result as any).user;
				// 去掉括号及其内容，包括全角括号和半角括号
				const cleanFirstName = u.first_name.replace(/[\(（].*?[\)）]/g, '').trim();
				return {
					first_name: `<a href="tg://user?id=${userId}">${cleanFirstName || userId}</a>`,
					username: (u.username as string) || '',
				};
			}
			return { first_name: `${userId}`, username: '' };
		} catch (e) {
			log('fetchChatMember 异常', e);
			return { first_name: `${userId}`, username: '' };
		}
	},
};

/**
 * 从 ParsedUpdate 中提取命令处理上下文（chatId / threadId / from / args）。
 * 消除 14+ 个 handler 中重复的提取样板代码。
 */
export function extractCmdContext(parsed: ParsedUpdate): {
	chatId: number;
	threadId: number | undefined;
	from: any;
	args: string[];
} {
	const chatId = parsed.chatId ?? parsed.message?.chat?.id ?? 0;
	const threadId =
		parsed.threadId ??
		parsed.message?.message_thread_id ??
		parsed.message?.reply_to_message?.message_thread_id ??
		undefined;
	const from = parsed.from ?? parsed.message?.from;
	const args = Array.isArray(parsed.args) ? parsed.args.slice() : [];
	return { chatId, threadId, from, args };
}

export default TgMessage;
function getStatusDescription(status: any) {
	throw new Error('Function not implemented.');
}
