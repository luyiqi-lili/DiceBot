import type { Env } from '../index';
import TgMessage, { callTelegramApi } from '../lib/tgMessage';

/**
 * 分数提交请求体的类型定义
 * 这是解决TypeScript `unknown` 类型错误的关键
 */
interface ScoreSubmitRequest {
	score: number | string;
	user_id: number | string;
	inline_message_id?: string;
	chat_id?: number | string;
	message_id?: number | string;
	game?: string;
	[key: string]: any; // 允许其他字段
}

/**
 * 处理游戏分数提交（通用版本）
 * 被 hello 和 fish 两个路由共同调用
 */
export async function handleGameScore(request: Request, env: Env, gameName: string): Promise<Response> {
	try {
		const body: ScoreSubmitRequest = await request.json();
		const { score, user_id, inline_message_id, chat_id, message_id, game = gameName } = body;

		// 2. 基础验证
		if (score === undefined || score === null) {
			return jsonResponse({ ok: false, error: '缺少分数参数 (score)' }, 400);
		}
		if (!user_id) {
			return jsonResponse({ ok: false, error: '缺少用户ID参数 (user_id)' }, 400);
		}

		// 3. 转换为数值
		const numericScore = typeof score === 'string' ? parseInt(score, 10) : score;
		const numericUserId = typeof user_id === 'string' ? parseInt(user_id, 10) : user_id;

		if (isNaN(numericScore)) {
			return jsonResponse({ ok: false, error: '分数必须是有效数字' }, 400);
		}
		if (isNaN(numericUserId)) {
			return jsonResponse({ ok: false, error: '用户ID必须是有效数字' }, 400);
		}

		console.log('处理分数提交:', {
			user_id: numericUserId,
			score: numericScore,
			inline_message_id,
			game,
		});

		// 4. 判断游戏模式并调用相应的Telegram API
		let telegramResponse;

		if (inline_message_id) {
			// Inline 游戏模式
			console.log('使用 inline 模式提交分数，消息ID:', inline_message_id);
			console.log('使用 inline 模式提交分数，token:', env.TOKEN);

			telegramResponse = await callTelegramApi(env, 'setGameScore', {
				user_id: numericUserId,
				score: numericScore,
				inline_message_id: inline_message_id,
				force: true, // 允许覆盖旧分数
			});
		} else if (chat_id && message_id) {
			// 普通聊天游戏模式
			console.log('使用普通聊天模式提交分数', { chat_id, message_id });

			telegramResponse = await callTelegramApi(env, 'setGameScore', {
				user_id: numericUserId,
				score: numericScore,
				chat_id: chat_id,
				message_id: message_id,
				force: true,
			});
		} else {
			// 两种标识符都缺失
			return jsonResponse(
				{
					ok: false,
					error: '无法确定游戏消息。请提供 inline_message_id 或 chat_id+message_id。',
				},
				400,
			);
		}

		// 5. 处理Telegram API响应
		// TgMessage.callTelegramApi 返回的类型为 TelegramApiResponse<any>
		const result = telegramResponse;

		if (result.ok) {
			return jsonResponse({
				ok: true,
				description: '分数提交成功',
				result: result.result,
			});
		} else {
			return jsonResponse(
				{
					ok: false,
					error: `Telegram API 错误: ${result.description || '未知错误'}`,
					error_code: result.error_code,
					details: result,
				},
				400,
			);
		}
	} catch (error) {
		console.error('处理分数提交时出错:', error);

		// 检查是否是JSON解析错误
		if (error instanceof SyntaxError) {
			return jsonResponse(
				{
					ok: false,
					error: '无效的JSON请求格式',
				},
				400,
			);
		}

		return jsonResponse(
			{
				ok: false,
				error: '内部服务器错误',
				message: error instanceof Error ? error.message : '未知错误',
			},
			500,
		);
	}
}

/**
 * hello 游戏专用包装 — 保持向后兼容
 */
export function handleScoreSubmit(request: Request, env: Env): Promise<Response> {
	return handleGameScore(request, env, 'hello');
}

/**
 * 辅助函数：返回JSON响应
 */
function jsonResponse(data: any, status: number = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*', // 根据需求调整CORS策略
		},
	});
}

/**
 * 可选：获取游戏高分榜 (inline模式专用)
 */
export async function getInlineGameHighScores(env: Env, inline_message_id: string, user_id?: number): Promise<any> {
	const payload: any = {
		inline_message_id,
	};

	if (user_id) {
		payload.user_id = user_id;
	}

	return await callTelegramApi(env, 'getInlineGameHighScores', payload);
}

/**
 * 可选：获取普通聊天游戏高分榜
 */
export async function getGameHighScores(env: Env, chat_id: number | string, message_id: number | string, user_id?: number): Promise<any> {
	const payload: any = {
		chat_id,
		message_id,
	};

	if (user_id) {
		payload.user_id = user_id;
	}

	return await callTelegramApi(env, 'getGameHighScores', payload);
}
