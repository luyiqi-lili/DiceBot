/**
 * @file src/web/hello.ts
 * @description "Hello" 游戏页面处理器。提供 HTML 游戏页面（GET）和简单 POST 接口。
 */

import type { Env } from '../index';
// @ts-ignore: will be loaded by bundler as string
import HELLO_HTML from './hello.html';

/** 处理 /web/hello 页面请求 — GET 返回 HTML 游戏页面，POST 返回 JSON 确认 */
export async function handleHelloWeb(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET') {
    return new Response(HELLO_HTML, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(() => null);
    return new Response(JSON.stringify({ ok:true, received: body }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response('Method Not Allowed', { status: 405 });
}
