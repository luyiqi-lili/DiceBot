import TgMessage, { type EnvLike, type ParsedUpdate } from '../lib/telegram';

function isBusinessTextMessage(parsed: ParsedUpdate): boolean {
	return parsed.type === 'business_message'
		&& Boolean(parsed.businessConnectionId)
		&& Boolean(parsed.chatId)
		&& typeof parsed.text === 'string'
		&& parsed.text.trim().length > 0;
}

export async function handleBusinessSecretary(parsed: ParsedUpdate, env: EnvLike): Promise<void> {
	if (parsed.type === 'business_connection') {
		console.log('[business] connection update', {
			id: parsed.businessConnectionId,
			enabled: parsed.businessConnection?.is_enabled,
			canReply: parsed.businessConnection?.can_reply ?? parsed.businessConnection?.rights?.can_reply,
		});
		return;
	}

	if (parsed.type === 'deleted_business_messages') {
		console.log('[business] deleted messages update', {
			id: parsed.businessConnectionId,
			chatId: parsed.chatId,
			messageIds: parsed.deletedBusinessMessages?.message_ids,
		});
		return;
	}

	if (!isBusinessTextMessage(parsed)) {
		console.log('[business] unsupported business update ignored', {
			type: parsed.type,
			chatId: parsed.chatId,
			hasConnectionId: Boolean(parsed.businessConnectionId),
		});
		return;
	}

	if (parsed.from?.is_bot || parsed.message?.sender_business_bot) {
		console.log('[business] skipped bot-originated business message', {
			chatId: parsed.chatId,
			messageId: parsed.message?.message_id,
		});
		return;
	}

	await TgMessage.sendText(env, {
		chat_id: parsed.chatId,
		business_connection_id: parsed.businessConnectionId,
		text: '秘书模式已接入。莉莉现在可以通过这个连接代账号回复；当前先启用安全确认回复，避免自动接管私人对话。',
	});
}

export default handleBusinessSecretary;
