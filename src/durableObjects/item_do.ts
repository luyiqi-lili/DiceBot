// durableObjects/item_do.ts
export class ItemDO {
    state: DurableObjectState;
    storage: DurableObjectStorage;

    constructor(state: DurableObjectState) {
        this.state = state;
        this.storage = state.storage;
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        const path = url.pathname;

        try {
            // 获取用户物品列表
            if (path === '/get' && request.method === 'GET') {
                const userId = url.searchParams.get('userId');
                if (!userId) return new Response('Missing userId', { status: 400 });

                const list = await this.storage.get<Array<any>>(`user:${userId}`) || [];
                return new Response(JSON.stringify(list), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // 保存用户物品列表
            if (path === '/put' && request.method === 'POST') {
                const { userId, list } = await request.json() as { userId: string; list: Array<any> };

                await this.storage.put(`user:${userId}`, list);
                return new Response(JSON.stringify({ ok: true }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // 添加物品到用户列表
            if (path === '/add' && request.method === 'POST') {
                const { userId, item } = await request.json() as { userId: string; item: any };

                const list = await this.storage.get<Array<any>>(`user:${userId}`) || [];

                // 限制最多 200 件物品
                if (list.length >= 200) {
                    list.shift(); // 删除最旧的物品
                }

                list.push(item);
                await this.storage.put(`user:${userId}`, list);

                return new Response(JSON.stringify({ ok: true, count: list.length }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // 从用户列表移除物品
            if (path === '/remove' && request.method === 'POST') {
                const { userId, index } = await request.json() as { userId: string; index: number };

                const list = await this.storage.get<Array<any>>(`user:${userId}`) || [];

                if (index < 0 || index >= list.length) {
                    return new Response(JSON.stringify({ ok: false, error: 'Index out of bounds' }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                const removedItem = list.splice(index, 1)[0];
                await this.storage.put(`user:${userId}`, list);

                return new Response(JSON.stringify({ ok: true, removedItem, count: list.length }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // 转移物品
            if (path === '/transfer' && request.method === 'POST') {
                const { fromUserId, toUserId, index } = await request.json() as {
                    fromUserId: string;
                    toUserId: string;
                    index: number;
                };

                // 原子操作：同时修改两个用户的列表
                await this.storage.transaction(async (txn) => {
                    // 获取发送者列表
                    const fromList = await txn.get<Array<any>>(`user:${fromUserId}`) || [];

                    if (index < 0 || index >= fromList.length) {
                        throw new Error('Index out of bounds');
                    }

                    // 获取接收者列表
                    const toList = await txn.get<Array<any>>(`user:${toUserId}`) || [];

                    // 转移物品
                    const transferredItem = fromList.splice(index, 1)[0];

                    // 限制接收者最多 200 件物品
                    if (toList.length >= 200) {
                        toList.shift();
                    }

                    toList.push(transferredItem);

                    // 保存两个列表
                    await txn.put(`user:${fromUserId}`, fromList);
                    await txn.put(`user:${toUserId}`, toList);

                    return { fromCount: fromList.length, toCount: toList.length, item: transferredItem };
                });

                return new Response(JSON.stringify({ ok: true }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            // 在 item_do.ts 的 fetch 方法中添加 batchAdd 端点
            if (path === '/batchAdd' && request.method === 'POST') {
                const { userId, items } = await request.json() as { userId: string; items: Array<any> };

                if (!Array.isArray(items) || items.length === 0) {
                    return new Response(JSON.stringify({ ok: false, error: 'Invalid items array' }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                const list = await this.storage.get<Array<any>>(`user:${userId}`) || [];

                // 限制最多 200 件物品
                const availableSlots = 200 - list.length;
                const itemsToAdd = availableSlots > 0 ? items.slice(0, availableSlots) : [];

                if (itemsToAdd.length > 0) {
                    list.push(...itemsToAdd);
                    await this.storage.put(`user:${userId}`, list);
                }

                return new Response(JSON.stringify({
                    ok: true,
                    count: list.length,
                    added: itemsToAdd.length,
                    skipped: items.length - itemsToAdd.length
                }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            // 列出所有用户的物品（管理员功能）
            if (path === '/listAll' && request.method === 'GET') {
                const limit = parseInt(url.searchParams.get('limit') || '100');
                const startKey = url.searchParams.get('start') || undefined;

                const items: Array<{ userId: string; count: number; items?: any[] }> = [];
                let lastKey = '';

                // 使用 list 方法遍历所有键
                const listResult = await this.storage.list({
                    prefix: 'user:',
                    limit,
                    start: startKey  // 使用 start 而不是 cursor
                });

                for (const [key, value] of listResult.entries()) {
                    const userId = key.replace('user:', '');
                    items.push({
                        userId,
                        count: (value as Array<any>).length,
                        items: (value as Array<any>).slice(0, 5) // 只显示前5个物品
                    });
                    lastKey = key; // 记录最后一个键
                }

                // 如果达到限制，返回最后一个键作为下一页的起点
                const nextStart = items.length === limit ? lastKey : undefined;

                return new Response(JSON.stringify({ items, nextStart }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            return new Response('Not Found', { status: 404 });
        } catch (error) {
            console.error('[ItemDO] Error:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            return new Response(JSON.stringify({ error: errorMessage }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
}