// 复用 hello 游戏的分数处理逻辑
import type { Env } from '../../index';
import TgMessage,{callTelegramApi} from '../../lib/tgMessage';

interface ScoreSubmitRequest {
    score: number | string;
    user_id: number | string;
    inline_message_id?: string;
    chat_id?: number | string;
    message_id?: number | string;
    game?: string;
    [key: string]: any;
}

export async function handleScoreSubmit(request: Request, env: Env): Promise<Response> {
    try {
        const body: ScoreSubmitRequest = await request.json();
        
        const { 
            score, 
            user_id, 
            inline_message_id,
            chat_id,
            message_id,
            game = 'fish' 
        } = body;

        // 基础验证
        if (score === undefined || score === null) {
            return jsonResponse({ ok: false, error: '缺少分数参数' }, 400);
        }
        if (!user_id) {
            return jsonResponse({ ok: false, error: '缺少用户ID' }, 400);
        }

        // 转换为数值
        const numericScore = typeof score === 'string' ? parseInt(score, 10) : score;
        const numericUserId = typeof user_id === 'string' ? parseInt(user_id, 10) : user_id;

        if (isNaN(numericScore)) {
            return jsonResponse({ ok: false, error: '分数必须是有效数字' }, 400);
        }
        if (isNaN(numericUserId)) {
            return jsonResponse({ ok: false, error: '用户ID必须是有效数字' }, 400);
        }

        console.log('处理钓鱼游戏分数提交:', { 
            user_id: numericUserId, 
            score: numericScore,
            game 
        });

        // 调用Telegram API
        const apiPayload: any = {
            user_id: numericUserId,
            score: numericScore,
            force: true
        };

        if (inline_message_id) {
            apiPayload.inline_message_id = inline_message_id;
            console.log('使用 inline 模式提交分数');
        } else if (chat_id && message_id) {
            apiPayload.chat_id = chat_id;
            apiPayload.message_id = message_id;
            console.log('使用普通模式提交分数');
        } else {
            return jsonResponse({
                ok: false,
                error: '无法确定游戏消息'
            }, 400);
        }

        const telegramResponse = await callTelegramApi(env, 'setGameScore', apiPayload);
        
        if (telegramResponse.ok) {
            return jsonResponse({
                ok: true,
                description: '分数提交成功',
                result: telegramResponse.result
            });
        } else {
            return jsonResponse({
                ok: false,
                error: `Telegram API错误: ${telegramResponse.description || '未知错误'}`,
                error_code: telegramResponse.error_code,
                details: telegramResponse
            }, 400);
        }

    } catch (error) {
        console.error('处理分数提交时出错:', error);
        
        if (error instanceof SyntaxError) {
            return jsonResponse({ ok: false, error: '无效的JSON格式' }, 400);
        }
        
        return jsonResponse({
            ok: false,
            error: '内部服务器错误',
            message: error instanceof Error ? error.message : '未知错误'
        }, 500);
    }
}

function jsonResponse(data: any, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        }
    });
}