import type { Env } from '../index';

export async function handleHelloWeb(
  request: Request,
  env: Env
): Promise<Response> {

  if (request.method === 'GET') {
    // HTML 静态内容（后面你也可以改成从 KV / Assets 取）
    return new Response(HELLO_HTML, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8'
      }
    });
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(() => null);

    return new Response(JSON.stringify({
      ok: true,
      from: 'worker',
      received: body,
      time: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response('Method Not Allowed', { status: 405 });
}

// 先简单内嵌 HTML，后面可以换 Assets
const HELLO_HTML = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Hello Web</title>
</head>
<body>
  <h1>Hello from Worker</h1>
  <p>如果你看到这个，说明路由通了。</p>
</body>
</html>
`;
