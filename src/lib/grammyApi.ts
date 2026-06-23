import { Api } from 'grammy';
import { getTelegramApiClientOptions, type EnvLike } from './telegram';

export type GrammyApiLike = {
	sendMessage(chatId: number | string, text: string, options?: Record<string, unknown>): Promise<unknown>;
	getChatMember?(chatId: number | string, userId: number): Promise<unknown>;
};

export type SendTextPayload = {
	chat_id: number | string;
	text: string;
	parse_mode?: string;
	reply_markup?: unknown;
	message_thread_id?: number;
	reply_to_message_id?: number;
	disable_web_page_preview?: boolean;
};

function getApi(env: EnvLike, api?: GrammyApiLike): GrammyApiLike {
	if (api) return api;
	return new Api(env.TOKEN, getTelegramApiClientOptions(env)) as unknown as GrammyApiLike;
}

export async function sendTextWithGrammy(env: EnvLike, payload: SendTextPayload, api?: GrammyApiLike): Promise<unknown> {
	const { chat_id, text, ...options } = payload;
	return getApi(env, api).sendMessage(chat_id, text, options);
}

export async function fetchChatMemberWithGrammy(
	env: EnvLike,
	chatId: number | string,
	userId: number,
	api?: GrammyApiLike,
): Promise<{ first_name: string; username: string }> {
	try {
		const botApi = getApi(env, api);
		if (!botApi.getChatMember) {
			return { first_name: `${userId}`, username: '' };
		}
		const member = await botApi.getChatMember(chatId, userId);
		const user = (member as any)?.user;
		if (!user) {
			return { first_name: `${userId}`, username: '' };
		}
		const cleanFirstName = String(user.first_name ?? '').replace(/[\(（].*?[\)）]/g, '').trim();
		return {
			first_name: `<a href="tg://user?id=${userId}">${cleanFirstName || userId}</a>`,
			username: String(user.username ?? ''),
		};
	} catch (e) {
		console.warn('[grammyApi] getChatMember failed', e);
		return { first_name: `${userId}`, username: '' };
	}
}
