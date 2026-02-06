import TgMessage, { ParsedUpdate, EnvLike } from '../lib/tgMessage';
import { deleteMarkup, escapeHtml } from '../lib/util';
import { getBalance, transfer } from '../lib/coinService';

interface CongratsCallbackData {
	type: string;
	r: string; // recipientId (收到钱的用户A)
	t: string; // targetId (需要点按钮的用户B)
	a: number; // amount (金额)
}

export async function handleCongrats(parsedMessage: ParsedUpdate, env: EnvLike): Promise<void> {
	const chatId = parsedMessage.chatId ?? parsedMessage.message?.chat?.id;
	const threadId = parsedMessage.threadId ?? parsedMessage.message?.message_thread_id;
	const from = parsedMessage.from ?? parsedMessage.message?.from;

	if (!chatId || !from) {
		console.error('[congrats] 找不到 chatId 或 from，跳过');
		return;
	}

	// 检查是否是回复消息
	if (!parsedMessage.isReply || !parsedMessage.replyToMessage?.from) {
		await TgMessage.sendText(env, {
			chat_id: chatId,
			text: '❌ 请回复某人的消息来使用此命令。',
			parse_mode: 'HTML',
			message_thread_id: threadId,
			reply_markup: deleteMarkup,
		});
		return;
	}

	const userA = from; // 发送命令的人（要收钱的人）
	const userB = parsedMessage.replyToMessage.from; // 被回复的人（要给钱的人）

	// 不能自己给自己发
	if (userA.id === userB.id) {
		await TgMessage.sendText(env, {
			chat_id: chatId,
			text: '❌ 不能自己回复自己哦。',
			parse_mode: 'HTML',
			message_thread_id: threadId,
			reply_markup: deleteMarkup,
		});
		return;
	}

	// 获取用户显示名
	let userAName = '用户';
	let userBName = '用户';

	try {
		const userAMember = await TgMessage.fetchChatMember(env, chatId, userA.id);
		userAName = userAMember.first_name || `用户${userA.id}`;
	} catch (e) {
		userAName = `用户${userA.id}`;
	}

	try {
		const userBMember = await TgMessage.fetchChatMember(env, chatId, userB.id);
		userBName = userBMember.first_name || `用户${userB.id}`;
	} catch (e) {
		userBName = `用户${userB.id}`;
	}

	// 生成按钮 - 使用简化的JSON格式
	const buttons = [
		[
			{
				text: '发 1 💰',
				callback_data: JSON.stringify({
					type: 'congrats',
					r: String(userA.id),
					t: String(userB.id),
					a: 1,
				} as CongratsCallbackData),
			}, 
			{
				text: '发 5 💰',
				callback_data: JSON.stringify({
					type: 'congrats',
					r: String(userA.id),
					t: String(userB.id),
					a: 5,
				} as CongratsCallbackData),
			}, 
			{
				text: '发 10 💰',
				callback_data: JSON.stringify({
					type: 'congrats',
					r: String(userA.id),
					t: String(userB.id),
					a: 10,
				} as CongratsCallbackData),
			},
		],
	];

	const replyMarkup = TgMessage.buildInlineKeyboard(buttons);

	await TgMessage.sendText(env, {
		chat_id: chatId,
		text:
			`🎉 <b>恭喜发财，红包拿来！</b>\n\n` +
			`👤 ${userAName} 向 ${userBName} 拜年啦！\n` +
			`💰 点击下方按钮发送红包吧～\n` +
			`<i>（只有被回复的人可以点击哦）</i>`,
		parse_mode: 'HTML',
		message_thread_id: threadId,
		reply_markup: replyMarkup,
	});
}

export async function handleCongratsCallback(callbackQuery: any, callbackData: any, env: EnvLike): Promise<void> {
	const chatId = callbackQuery.message?.chat?.id;
	const messageId = callbackQuery.message?.message_id;
	const from = callbackQuery.from;

	if (!chatId || !messageId || !from) {
		console.error('[congrats] 回调缺少必要信息');
		return;
	}

	const data = callbackData as CongratsCallbackData;

	// 验证点击者是否是被回复的用户B
	if (String(from.id) !== data.t) {
		await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
			text: '❌ 只有被回复的人可以发红包哦！',
			show_alert: true,
		});
		return;
	}

	// 验证金额不能为负数
	if (data.a <= 0) {
		await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
			text: '❌ 金额必须为正数',
			show_alert: true,
		});
		return;
	}

	// 获取 CoinDO 的 namespace
	const doNs = (env as any).COIN_DO;
	if (!doNs) {
		console.error('[congrats] 没有 COIN_DO namespace');
		await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
			text: '❌ 系统错误：货币系统未初始化',
			show_alert: true,
		});
		return;
	}

	// 先检查余额是否足够
	const currentBalance = await getBalance(doNs, data.t);
	if (currentBalance < data.a) {
		await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
			text: `❌ 余额不足，当前只有 ${currentBalance} 💰`,
			show_alert: true,
		});
		return;
	}

	// 转账逻辑 - 使用 coinService 的 transfer 函数
	try {
		// 使用 transfer 函数进行转账
		const transferResult = await transfer(env, doNs, data.t, data.r, data.a, false, 'coins');

		if (!transferResult.ok) {
			let errorMsg = '转账失败';
			if (transferResult.reason === 'insufficient') {
				errorMsg = '余额不足';
			} else if (transferResult.reason === 'invalid amount') {
				errorMsg = '金额无效';
			} else if (transferResult.reason === 'internal_error') {
				errorMsg = '系统内部错误';
			}

			await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
				text: `❌ ${errorMsg}`,
				show_alert: true,
			});
			return;
		}

		// 获取用户显示名
		let recipientName = `用户${data.r}`;
		let targetName = `用户${data.t}`;

		try {
			const recipientMember = await TgMessage.fetchChatMember(env, chatId, parseInt(data.r));
			recipientName = recipientMember.first_name || recipientName;
		} catch (e) {}

		try {
			const targetMember = await TgMessage.fetchChatMember(env, chatId, parseInt(data.t));
			targetName = targetMember.first_name || targetName;
		} catch (e) {}

		// 成功提示
		await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
			text: `✅ 成功发送 ${data.a} ！`,
			show_alert: true,
		});

		// 获取当前消息文本，并追加新的红包记录
		const currentText = callbackQuery.message.text;
		const newRecord = `\n✨ ${targetName} 发送了 <b>${data.a} 💰</b> 给 ${recipientName}！`;
		
		// 更新消息显示，追加新的红包记录
		await TgMessage.editMessageText(env, {
			chat_id: chatId,
			message_id: messageId,
			text: currentText + newRecord,
			parse_mode: 'HTML',
			reply_markup: TgMessage.buildInlineKeyboard([
				[
					{
						text: '再发 1 💰',
						callback_data: JSON.stringify({
							type: 'congrats',
							r: data.r,
							t: data.t,
							a: 1,
						}),
					}, 
					{
						text: '再发 5 💰',
						callback_data: JSON.stringify({
							type: 'congrats',
							r: data.r,
							t: data.t,
							a: 5,
						}),
					}, 
					{
						text: '再发 10 💰',
						callback_data: JSON.stringify({
							type: 'congrats',
							r: data.r,
							t: data.t,
							a: 10,
						}),
					},
				],
			]),
		});
	} catch (error) {
		console.error('[congrats] 转账失败', error);
		await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
			text: '❌ 转账失败，请稍后重试',
			show_alert: true,
		});
	}
}

export default handleCongrats;