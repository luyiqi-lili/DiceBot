import type { Env } from '../index';

/**
 * 处理游戏分数提交
 * 遵循Telegram官方要求：游戏页面 -> 中间服务器 -> Telegram API
 */
export async function handleScoreSubmit(request: Request, env: Env): Promise<Response> {
  try {
    // 1. 解析请求数据
    const body = await request.json();
    
    const { 
      score, 
      user_id, 
      inline_message_id,  // inline模式的关键标识符
      game = 'hello' 
    } = body;

    // 2. 验证必要参数
    if (score === undefined || score === null) {
      return jsonResponse({ ok: false, error: 'Missing score parameter' }, 400);
    }

    if (!user_id) {
      return jsonResponse({ ok: false, error: 'Missing user_id parameter' }, 400);
    }

    // 3. 验证是inline游戏（必须有inline_message_id）
    if (!inline_message_id) {
      return jsonResponse({ 
        ok: false, 
        error: 'Missing inline_message_id. This appears to be a non-inline game.' 
      }, 400);
    }

    console.log('处理分数提交:', { 
      user_id, 
      score, 
      inline_message_id: inline_message_id.substring(0, 20) + '...',
      game 
    });

    // 4. 调用Telegram Bot API提交分数（inline专用API）
    const telegramResponse = await submitToTelegramAPI({
      token: env.TOKEN,
      user_id: parseInt(user_id),
      score: parseInt(score),
      inline_message_id,
      force: true // 允许覆盖旧分数
    });

    // 5. 处理Telegram API响应
    const result = await telegramResponse.json();
    console.log('Telegram API响应:', result);

    if (result.ok) {
      return jsonResponse({ 
        ok: true, 
        description: 'Score submitted successfully',
        result 
      });
    } else {
      return jsonResponse({ 
        ok: false, 
        error: `Telegram API error: ${result.description || 'Unknown error'}`,
        details: result 
      }, 400);
    }

  } catch (error) {
    console.error('处理分数提交时出错:', error);
    
    return jsonResponse({ 
      ok: false, 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
}

/**
 * 调用Telegram Bot API的setInlineGameScore方法
 * 这是专门用于inline游戏的API
 */
async function submitToTelegramAPI(params: {
  token: string;
  user_id: number;
  score: number;
  inline_message_id: string;
  force?: boolean;
}): Promise<Response> {
  const { token, user_id, score, inline_message_id, force = true } = params;
  
  const apiUrl = `https://api.telegram.org/bot${token}/setInlineGameScore`;
  
  const payload = {
    user_id,
    score,
    inline_message_id,
    force,
    // 可以添加其他可选参数
    // disable_edit_message: false, // 设置为true时不自动编辑消息
  };

  console.log('调用Telegram API:', { 
    api: 'setInlineGameScore',
    user_id,
    score,
    inline_message_id: inline_message_id.substring(0, 20) + '...'
  });

  return fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  });
}

/**
 * 辅助函数：返回JSON响应
 */
function jsonResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*', // 根据需求调整CORS
    }
  });
}

/**
 * 可选：获取游戏高分榜
 * 如果需要显示排行榜可以调用这个
 */
export async function getGameHighScores(
  env: Env,
  inline_message_id: string,
  user_id?: number
): Promise<any> {
  const apiUrl = `https://api.telegram.org/bot${env.TOKEN}/getInlineGameHighScores`;
  
  const payload: any = {
    inline_message_id,
    user_id: user_id || 0 // 0表示获取所有用户分数
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    return await response.json();
  } catch (error) {
    console.error('获取高分榜失败:', error);
    throw error;
  }
}