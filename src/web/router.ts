import type { Env } from '../index';
import { handleHelloWeb } from './hello';
import { handleScoreSubmit } from './score';

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

  // 可以添加其他web路由...

  return null; // 不是web请求
}