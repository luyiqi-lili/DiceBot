/**
 * Lottery DO - 彩票系统持久化对象（按群组 chat_id 隔离）
 *
 * 数据结构（V2，按群分桶）：
 * - pools:       Record<chatId, number>            每个群独立奖池
 * - ticketsAll:  Record<chatId, Record<userId, string[]>>  每个群独立彩票
 * - lastWinners: Record<chatId, any>               每个群上期开奖信息
 */

import { LEGACY_CHAT_ID } from '../lib/groupScope';

// 定义接口类型
interface SetTicketRequest {
  userId: string;
  ticketNumber: string;
}

interface PoolData {
  amount: number;
}

interface AddPoolRequest {
  amount: number;
}

interface DrawRequest {
  winningNumber: string;
}

interface RestoreRequest {
  bookmark?: string;
  timestamp?: string;
  confirm?: string;
}

const RESTORE_CONFIRMATION = "RESTORE_LOTTERY_DO";

export class LotteryDO {
  private state: DurableObjectState;
  private pools: Record<string, number> = {};
  private ticketsAll: Record<string, Record<string, string[]>> = {};
  private lastWinners: Record<string, any> = {};

  constructor(state: DurableObjectState, env: any) {
    this.state = state;

    // 从持久化存储加载数据（V2 分桶，按群隔离）
    this.state.blockConcurrencyWhile(async () => {
      this.pools = (await this.state.storage.get<Record<string, number>>("poolsV2")) || {};
      this.ticketsAll = (await this.state.storage.get<Record<string, Record<string, string[]>>>("ticketsV2")) || {};
      this.lastWinners = (await this.state.storage.get<Record<string, any>>("lastWinnersV2")) || {};
    });
  }

  private ck(chatId: string | number): string {
    return String(chatId);
  }

  private ticketsOf(chatId: string | number): Record<string, string[]> {
    const key = this.ck(chatId);
    if (!this.ticketsAll[key]) this.ticketsAll[key] = {};
    return this.ticketsAll[key];
  }

  // 保存所有数据到持久化存储
  private async saveAll() {
    await this.state.storage.put("poolsV2", this.pools);
    await this.state.storage.put("ticketsV2", this.ticketsAll);
    await this.state.storage.put("lastWinnersV2", this.lastWinners);
  }

  /**
   * 添加用户彩票（允许多张）
   */
  async addTicket(chatId: string | number, userId: string, ticketNumber: string): Promise<{ success: boolean; message?: string }> {
    // 验证彩票号码格式（3位数字）
    if (!/^\d{3}$/.test(ticketNumber)) {
      return {
        success: false,
        message: "彩票号码必须是3位数字"
      };
    }

    const tickets = this.ticketsOf(chatId);
    if (!tickets[userId]) {
      tickets[userId] = [];
    }
    tickets[userId].push(ticketNumber);
    await this.saveAll();

    return { success: true };
  }

  /**
   * 获取用户所有彩票号码
   */
  async getUserTickets(chatId: string | number, userId: string): Promise<string[]> {
    return this.ticketsOf(chatId)[userId] || [];
  }

  /**
   * 获取用户彩票数量
   */
  async getUserTicketCount(chatId: string | number, userId: string): Promise<number> {
    const tickets = this.ticketsOf(chatId);
    return tickets[userId] ? tickets[userId].length : 0;
  }

  /**
   * 列出本群所有彩票（展开为平铺列表）
   */
  async listAllTickets(chatId: string | number): Promise<{ userId: string; ticketNumber: string }[]> {
    const result: { userId: string; ticketNumber: string }[] = [];
    for (const [userId, ticketNumbers] of Object.entries(this.ticketsOf(chatId))) {
      for (const ticketNumber of ticketNumbers) {
        result.push({ userId, ticketNumber });
      }
    }
    return result;
  }

  /**
   * 获取本群所有用户的总购买张数
   */
  async getTotalTicketCount(chatId: string | number): Promise<number> {
    let total = 0;
    for (const ticketNumbers of Object.values(this.ticketsOf(chatId))) {
      total += ticketNumbers.length;
    }
    return total;
  }

  /**
   * 设置本群奖池金额
   */
  async setPool(chatId: string | number, amount: number): Promise<void> {
    this.pools[this.ck(chatId)] = amount;
    await this.saveAll();
  }

  /**
   * 增加本群奖池金额
   */
  async addToPool(chatId: string | number, amount: number): Promise<number> {
    const key = this.ck(chatId);
    this.pools[key] = (this.pools[key] || 0) + amount;
    await this.saveAll();
    return this.pools[key];
  }

  /**
   * 获取本群奖池金额
   */
  async getPool(chatId: string | number): Promise<number> {
    return this.pools[this.ck(chatId)] || 0;
  }

  /**
   * 清空本群所有记录
   */
  async clean(chatId: string | number): Promise<void> {
    const key = this.ck(chatId);
    this.ticketsAll[key] = {};
    this.pools[key] = 0;
    this.lastWinners[key] = null;
    await this.saveAll();
  }

  /**
   * 本群开奖
   */
  async draw(chatId: string | number, winningNumber: string): Promise<{
    winningNumber: string;
    exactMatches: { userId: string; ticketNumber: string }[];
    firstTwoMatches: { userId: string; ticketNumber: string }[];
    prizePool: number;
    exactPrize: number;
    firstTwoPrize: number;
  }> {
    // 验证中奖号码格式
    if (!/^\d{3}$/.test(winningNumber)) {
      throw new Error("中奖号码必须是3位数字");
    }

    const key = this.ck(chatId);
    const tickets = this.ticketsOf(chatId);
    const currentPoolBase = this.pools[key] || 0;

    // 计算本期总奖池 = 上期累积 + (所有彩票数量 * 单价)
    const totalTickets = await this.getTotalTicketCount(chatId);
    const currentPool = currentPoolBase + (totalTickets * 10);

    // 查找匹配的彩票
    const exactMatches: { userId: string; ticketNumber: string }[] = [];
    const firstTwoMatches: { userId: string; ticketNumber: string }[] = [];
    const winningFirstTwo = winningNumber.substring(0, 2);

    for (const [userId, ticketNumbers] of Object.entries(tickets)) {
      for (const ticketNumber of ticketNumbers) {
        if (ticketNumber === winningNumber) {
          exactMatches.push({ userId, ticketNumber });
        } else if (ticketNumber.substring(0, 2) === winningFirstTwo) {
          firstTwoMatches.push({ userId, ticketNumber });
        }
      }
    }

    // 计算奖金
    const exactPrize = exactMatches.length > 0 ? Math.floor(currentPool * 0.5 / exactMatches.length) : 0;
    const firstTwoPrize = firstTwoMatches.length > 0 ? Math.floor(currentPool * 0.3 / firstTwoMatches.length) : 0;

    // 未分配的奖金累积到下一期
    const remainingPrize = currentPool - (exactPrize * exactMatches.length) - (firstTwoPrize * firstTwoMatches.length);

    // 保存开奖信息
    this.lastWinners[key] = {
      winningNumber,
      exactMatches,
      firstTwoMatches,
      exactPrize,
      firstTwoPrize,
      remainingPrize,
      totalTickets,
      drawTime: new Date().toISOString()
    };

    // 清空本期购买记录，保留未分配奖金到奖池
    this.ticketsAll[key] = {};
    this.pools[key] = remainingPrize;

    await this.saveAll();

    return {
      winningNumber,
      exactMatches,
      firstTwoMatches,
      prizePool: currentPool,
      exactPrize,
      firstTwoPrize
    };
  }

  /**
   * 获取本群上期开奖信息
   */
  async getLastDraw(chatId: string | number): Promise<any> {
    return this.lastWinners[this.ck(chatId)] || null;
  }

  private json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async getRecoveryState(chatId: string | number): Promise<{
    pool: number;
    tickets: Record<string, string[]>;
    totalTicketCount: number;
    totalPrizePool: number;
    lastWinner: any;
    currentBookmark?: string;
    bookmarkError?: string;
  }> {
    const pool = await this.getPool(chatId);
    const totalTicketCount = await this.getTotalTicketCount(chatId);
    const result: {
      pool: number;
      tickets: Record<string, string[]>;
      totalTicketCount: number;
      totalPrizePool: number;
      lastWinner: any;
      currentBookmark?: string;
      bookmarkError?: string;
    } = {
      pool,
      tickets: this.ticketsOf(chatId),
      totalTicketCount,
      totalPrizePool: pool + totalTicketCount * 10,
      lastWinner: this.lastWinners[this.ck(chatId)] || null
    };

    try {
      result.currentBookmark = await this.state.storage.getCurrentBookmark();
    } catch (error: any) {
      result.bookmarkError = error?.message || String(error);
    }

    return result;
  }

  private async getBookmarkForRequestTime(url: URL): Promise<Response> {
    const rawTime = url.searchParams.get("time") || url.searchParams.get("timestamp");
    if (!rawTime) return this.json({ error: "time query parameter is required" }, 400);

    const timestamp = new Date(rawTime);
    if (Number.isNaN(timestamp.getTime())) return this.json({ error: "invalid time" }, 400);

    const bookmark = await this.state.storage.getBookmarkForTime(timestamp);
    return this.json({ timestamp: timestamp.toISOString(), bookmark });
  }

  private async restoreFromRequest(request: Request): Promise<Response> {
    const data = await request.json() as RestoreRequest;
    if (data.confirm !== RESTORE_CONFIRMATION) {
      return this.json({ error: `confirm must be ${RESTORE_CONFIRMATION}` }, 400);
    }

    let bookmark = data.bookmark;
    let timestamp: string | undefined;
    if (!bookmark) {
      if (!data.timestamp) return this.json({ error: "bookmark or timestamp is required" }, 400);

      const parsed = new Date(data.timestamp);
      if (Number.isNaN(parsed.getTime())) return this.json({ error: "invalid timestamp" }, 400);

      timestamp = parsed.toISOString();
      bookmark = await this.state.storage.getBookmarkForTime(parsed);
    }

    const undoBookmark = await this.state.storage.onNextSessionRestoreBookmark(bookmark);
    this.state.waitUntil(Promise.resolve().then(() => {
      this.state.abort("LotteryDO PITR restore requested");
    }));

    return this.json({
      success: true,
      timestamp,
      bookmark,
      undoBookmark,
      restartScheduled: true
    });
  }

  /**
   * HTTP请求处理。除 PITR 端点外，均需要 chatId（query ?chatId= 或 body.chatId）。
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      switch (path) {
        case '/debug-state': {
          const chatId = url.searchParams.get('chatId') ?? String(LEGACY_CHAT_ID);
          return this.json(await this.getRecoveryState(chatId));
        }

        case '/pitr/bookmark': {
          return await this.getBookmarkForRequestTime(url);
        }

        case '/pitr/restore': {
          if (request.method !== 'POST') {
            return this.json({ error: 'Method Not Allowed' }, 405);
          }
          return await this.restoreFromRequest(request);
        }

        case '/add-ticket': {
          const data = await request.json() as SetTicketRequest & { chatId: string | number };
          const result = await this.addTicket(data.chatId, data.userId, data.ticketNumber);
          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' }
          });
        }

        case '/get-user-tickets': {
          const userId = url.searchParams.get('userId');
          const chatId = url.searchParams.get('chatId');
          if (!userId || !chatId) {
            return new Response(JSON.stringify({ error: 'userId and chatId are required' }), { status: 400 });
          }
          const ticketNumbers = await this.getUserTickets(chatId, userId);
          return new Response(JSON.stringify({ userId, ticketNumbers }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }

        case '/get-user-ticket-count': {
          const userId = url.searchParams.get('userId');
          const chatId = url.searchParams.get('chatId');
          if (!userId || !chatId) {
            return new Response(JSON.stringify({ error: 'userId and chatId are required' }), { status: 400 });
          }
          const count = await this.getUserTicketCount(chatId, userId);
          return new Response(JSON.stringify({ userId, count }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }

        case '/list-all-tickets': {
          const chatId = url.searchParams.get('chatId');
          if (!chatId) return new Response(JSON.stringify({ error: 'chatId is required' }), { status: 400 });
          const tickets = await this.listAllTickets(chatId);
          return new Response(JSON.stringify({ tickets }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }

        case '/total-ticket-count': {
          const chatId = url.searchParams.get('chatId');
          if (!chatId) return new Response(JSON.stringify({ error: 'chatId is required' }), { status: 400 });
          const count = await this.getTotalTicketCount(chatId);
          return new Response(JSON.stringify({ count }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }

        case '/set-pool': {
          const data = await request.json() as PoolData & { chatId: string | number };
          await this.setPool(data.chatId, data.amount);
          return new Response(JSON.stringify({ success: true, pool: await this.getPool(data.chatId) }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }

        case '/add-pool': {
          const data = await request.json() as AddPoolRequest & { chatId: string | number };
          const newPool = await this.addToPool(data.chatId, data.amount);
          return new Response(JSON.stringify({ success: true, pool: newPool }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }

        case '/get-pool': {
          const chatId = url.searchParams.get('chatId');
          if (!chatId) return new Response(JSON.stringify({ error: 'chatId is required' }), { status: 400 });
          const pool = await this.getPool(chatId);
          return new Response(JSON.stringify({ pool }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }

        case '/clean': {
          const data = await request.json() as { chatId: string | number };
          await this.clean(data.chatId);
          return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }

        case '/draw': {
          const data = await request.json() as DrawRequest & { chatId: string | number };
          const result = await this.draw(data.chatId, data.winningNumber);
          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' }
          });
        }

        case '/last-draw': {
          const chatId = url.searchParams.get('chatId');
          if (!chatId) return new Response(JSON.stringify({ error: 'chatId is required' }), { status: 400 });
          const lastDraw = await this.getLastDraw(chatId);
          return new Response(JSON.stringify({ lastDraw }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }

        default:
          return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 });
      }
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
}
