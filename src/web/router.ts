import type { Env } from '../index';
import { handleHelloWeb } from './hello';

export async function handleWebRequest(
  request: Request,
  env: Env
): Promise<Response | null> {

  const url = new URL(request.url);

  // /web/hello
  if (url.pathname === '/web/hello') {
    return handleHelloWeb(request, env);
  }

  return null; // 不是 web 请求
}
