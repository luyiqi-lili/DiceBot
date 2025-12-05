// lib/itemService.ts
import TgMessage, { EnvLike } from "./tgMessage";

export const ITEM_DO_NAME = "items";

function getItemDOStub(doNs: DurableObjectNamespace, name = "items") {
  if (!doNs) throw new Error("Durable Object namespace (doNs) is required");
  const id = doNs.idFromName(name);
  return doNs.get(id);
}

/**
 * 获取用户的物品列表
 */
export async function getUserItems(
  doNs: DurableObjectNamespace,
  userId: number | string,
  name = "items"
): Promise<Array<any>> {
  try {
    const stub = getItemDOStub(doNs, name);
    const url = `https://do/get?userId=${encodeURIComponent(String(userId))}`;
    const res = await stub.fetch(url, { method: "GET" });
    
    if (!res.ok) {
      console.warn("[itemService] getUserItems: DO responded non-ok", await res.text());
      return [];
    }
    
    const list = await res.json() as any;
    return Array.isArray(list) ? list : [];
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[itemService] getUserItems failed", error);
    return [];
  }
}

/**
 * 保存用户的物品列表
 */
export async function saveUserItems(
  doNs: DurableObjectNamespace,
  userId: number | string,
  items: Array<any>,
  name = "items"
): Promise<{ ok: boolean; error?: string }> {
  try {
    const stub = getItemDOStub(doNs, name);
    const url = `https://do/put`;
    const body = JSON.stringify({ userId: String(userId), list: items });
    
    const res = await stub.fetch(url, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" }
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      return { ok: false, error: errorText };
    }
    
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[itemService] saveUserItems failed", error);
    return { ok: false, error };
  }
}

/**
 * 添加物品到用户列表
 */
export async function addItemToUser(
  doNs: DurableObjectNamespace,
  userId: number | string,
  item: any,
  name = "items"
): Promise<{ ok: boolean; count?: number; error?: string }> {
  try {
    const stub = getItemDOStub(doNs, name);
    const url = `https://do/add`;
    const body = JSON.stringify({ userId: String(userId), item });
    
    const res = await stub.fetch(url, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" }
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      return { ok: false, error: errorText };
    }
    
    const result = await res.json() as any;
    return { ok: true, count: result.count };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[itemService] addItemToUser failed", error);
    return { ok: false, error };
  }
}

/**
 * 从用户列表移除物品
 */
export async function removeItemFromUser(
  doNs: DurableObjectNamespace,
  userId: number | string,
  index: number,
  name = "items"
): Promise<{ ok: boolean; removedItem?: any; count?: number; error?: string }> {
  try {
    const stub = getItemDOStub(doNs, name);
    const url = `https://do/remove`;
    const body = JSON.stringify({ userId: String(userId), index });
    
    const res = await stub.fetch(url, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" }
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      return { ok: false, error: errorText };
    }
    
    const result = await res.json() as any;
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    
    return { 
      ok: true, 
      removedItem: result.removedItem, 
      count: result.count 
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[itemService] removeItemFromUser failed", error);
    return { ok: false, error };
  }
}

/**
 * 转移物品（赠送）
 */
export async function transferItem(
  envOrNull: EnvLike | null,
  doNs: DurableObjectNamespace,
  fromUserId: number | string,
  toUserId: number | string,
  index: number,
  name = "items"
): Promise<{ ok: boolean; error?: string }> {
  try {
    const stub = getItemDOStub(doNs, name);
    const url = `https://do/transfer`;
    const body = JSON.stringify({ 
      fromUserId: String(fromUserId), 
      toUserId: String(toUserId), 
      index 
    });
    
    const res = await stub.fetch(url, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" }
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      
      // 发送错误通知（可选）
      if (envOrNull) {
        TgMessage.sendText(envOrNull, {
          chat_id: -1002848481881,
          text: `⚠️ 物品转移失败: ${errorText}\nfrom=${fromUserId} to=${toUserId} index=${index}`,
          parse_mode: "HTML"
        }).catch(() => {});
      }
      
      return { ok: false, error: errorText };
    }
    
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[itemService] transferItem failed", error);
    return { ok: false, error };
  }
}

/**
 * 获取所有用户的物品统计（管理员功能）
 */
export async function getAllItemsStats(
  doNs: DurableObjectNamespace,
  limit = 100,
  start?: string,
  name = "items"
): Promise<{ items: Array<{ userId: string; count: number; items?: any[] }>; nextStart?: string }> {
  try {
    const stub = getItemDOStub(doNs, name);
    let url = `https://do/listAll?limit=${limit}`;
    if (start) {
      url += `&start=${encodeURIComponent(start)}`;
    }
    
    const res = await stub.fetch(url, { method: "GET" });
    
    if (!res.ok) {
      console.warn("[itemService] getAllItemsStats: DO responded non-ok", await res.text());
      return { items: [] };
    }
    
    const result = await res.json() as any;
    return {
      items: Array.isArray(result.items) ? result.items : [],
      nextStart: result.nextStart
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[itemService] getAllItemsStats failed", error);
    return { items: [] };
  }
}

// 辅助函数：创建物品对象
export function createItem(
  remark: string,
  content: string,
  link: string,
  createdBy?: number
): any {
  return {
    remark,
    content: content.slice(0, 500), // 限制内容长度
    link,
    timestamp: new Date().toISOString(),
    createdBy: createdBy || undefined,
    id: Date.now() + Math.random().toString(36).substr(2, 9) // 生成唯一ID
  };
}

// 辅助函数：验证物品格式
export function isValidItem(item: any): boolean {
  return (
    item &&
    typeof item === 'object' &&
    typeof item.remark === 'string' &&
    typeof item.content === 'string' &&
    typeof item.link === 'string' &&
    typeof item.timestamp === 'string'
  );
}

// 辅助函数：获取用户物品数量
export async function getUserItemCount(
  doNs: DurableObjectNamespace,
  userId: number | string,
  name = "items"
): Promise<number> {
  const items = await getUserItems(doNs, userId, name);
  return items.length;
}

// 辅助函数：批量添加物品
export async function batchAddItems(
  doNs: DurableObjectNamespace,
  userId: number | string,
  items: any[],
  name = "items"
): Promise<{ ok: boolean; count?: number; errors?: string[] }> {
  try {
    const stub = getItemDOStub(doNs, name);
    const url = `https://do/batchAdd`;
    const body = JSON.stringify({ userId: String(userId), items });
    
    const res = await stub.fetch(url, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" }
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      return { ok: false, errors: [errorText] };
    }
    
    const result = await res.json() as any;
    return { ok: true, count: result.count };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[itemService] batchAddItems failed", error);
    return { ok: false, errors: [error] };
  }
}

export default {
  getUserItems,
  saveUserItems,
  addItemToUser,
  removeItemFromUser,
  transferItem,
  getAllItemsStats,
  createItem,
  isValidItem,
  getUserItemCount,
  batchAddItems
};