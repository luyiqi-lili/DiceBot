import type { Env } from '../index';
import type { ParsedUpdate } from './telegram';
import { incrementAffection } from './affectionDB';

type AffectionInteractionEnv = Pick<Env, 'DB' | 'AFFECTION_KV'>;

type MessageAuthorRow = {
	user_id: number | null;
	username: string | null;
	first_name: string | null;
	last_name: string | null;
};

function userIdOf(user: any): number | null {
	const id = Number(user?.id ?? user?.user_id);
	return Number.isFinite(id) ? id : null;
}

function displayNameOf(user: any): string {
	return String(user?.first_name ?? user?.username ?? user?.title ?? user?.name ?? userIdOf(user) ?? '');
}

function isCountablePair(source: any, target: any): boolean {
	const sourceId = userIdOf(source);
	const targetId = userIdOf(target);
	if (sourceId === null || targetId === null) return false;
	if (sourceId === targetId) return false;
	if (source?.is_bot || target?.is_bot) return false;
	return true;
}

function isInitialReactionAdd(reaction: any): boolean {
	const oldReaction = Array.isArray(reaction?.old_reaction) ? reaction.old_reaction : [];
	const newReaction = Array.isArray(reaction?.new_reaction) ? reaction.new_reaction : [];
	return oldReaction.length === 0 && newReaction.length > 0;
}

function reactionMarkerKey(chatId: number, messageId: number, reactorId: number): string {
	return `affection:reaction-counted:${chatId}:${messageId}:${reactorId}`;
}

async function incrementInteractionAffection(
	env: AffectionInteractionEnv,
	source: any,
	target: any,
): Promise<boolean> {
	if (!isCountablePair(source, target)) return false;

	const sourceId = userIdOf(source)!;
	const targetId = userIdOf(target)!;
	const result = await incrementAffection(env.DB, env.AFFECTION_KV, sourceId, targetId, displayNameOf(target), 1);
	if (!result.ok) {
		console.error('[affectionInteractions] increment affection failed', { sourceId, targetId, error: result.error });
		return false;
	}
	return true;
}

async function findMessageAuthor(
	db: D1Database | undefined,
	chatId: number,
	messageId: number,
): Promise<any | null> {
	if (!db) return null;

	try {
		const row = await db
			.prepare(
				`SELECT user_id, username, first_name, last_name
				 FROM message_history
				 WHERE chat_id = ? AND message_id = ?
				 ORDER BY id DESC
				 LIMIT 1`
			)
			.bind(chatId, messageId)
			.first<MessageAuthorRow>();

		if (!row?.user_id) return null;
		return {
			id: row.user_id,
			username: row.username ?? undefined,
			first_name: row.first_name ?? row.username ?? String(row.user_id),
			last_name: row.last_name ?? undefined,
		};
	} catch (error) {
		console.error('[affectionInteractions] find reacted message author failed', { chatId, messageId, error });
		return null;
	}
}

export async function recordReplyAffection(parsed: ParsedUpdate, env: AffectionInteractionEnv): Promise<void> {
	try {
		if (!parsed.isReply || !parsed.replyToMessage?.from) return;
		await incrementInteractionAffection(env, parsed.from, parsed.replyToMessage.from);
	} catch (error) {
		console.error('[affectionInteractions] record reply affection failed', { error });
	}
}

export async function recordReactionAffection(parsed: ParsedUpdate, env: AffectionInteractionEnv): Promise<void> {
	try {
		const reaction = parsed.messageReaction;
		if (!isInitialReactionAdd(reaction)) return;

		const reactor = reaction.user ?? parsed.from;
		if (!reactor || reactor.is_bot) return;

		const chatId = Number(reaction.chat?.id ?? parsed.chatId);
		const messageId = Number(reaction.message_id);
		const reactorId = userIdOf(reactor);
		if (!Number.isFinite(chatId) || !Number.isFinite(messageId) || reactorId === null) return;

		const markerKey = reactionMarkerKey(chatId, messageId, reactorId);
		const alreadyCounted = await env.AFFECTION_KV.get(markerKey);
		if (alreadyCounted) return;

		const target = await findMessageAuthor(env.DB, chatId, messageId);
		if (!target) return;

		const incremented = await incrementInteractionAffection(env, reactor, target);
		if (!incremented) return;

		await env.AFFECTION_KV.put(markerKey, '1');
	} catch (error) {
		console.error('[affectionInteractions] record reaction affection failed', { error });
	}
}
