import type { Env } from '../index';
import { handleHelloWeb } from './hello';
import { handleScoreSubmit } from './score';
import { handleFishRoutes } from './fish/router';

/**
 * Web 请求路由入口。
 * 根据请求路径分发到对应的 Web 处理器（hello 游戏、fish 钓鱼游戏等）。
 * 非 Web 路径返回 null 让主入口继续处理。
 */
export async function handleWebRequest(
  request: Request,
  env: Env
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  // 处理游戏页面请求
  if (path === '/web/hello') {
    return handleHelloWeb(request, env);
  }

  // 处理inline游戏分数提交请求
  if (path === '/web/hello/submit-score' && request.method === 'POST') {
    return handleScoreSubmit(request, env);
  }

      // /web/fish 钓鱼游戏路由
    if (path.startsWith('/web/fish')) {
        const fishResponse = await handleFishRoutes(request, env);
        if (fishResponse) return fishResponse;
    }


  // 可以添加其他web路由...

  return null; // 不是web请求
}