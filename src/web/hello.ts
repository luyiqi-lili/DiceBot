// src/web/hello.ts
import type { Env } from '../index';
// @ts-ignore: will be loaded by bundler as string
import HELLO_HTML from './hello.html';

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
