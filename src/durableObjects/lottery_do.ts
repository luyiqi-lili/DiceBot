/**
 * Lottery DO - 彩票系统持久化对象
 * 
 * 数据结构：
 * - pool: 奖池金额
 * - tickets: 用户ID -> 彩票号码映射
 * - lastWinner: 上期中奖信息
 */

// 定义接口类型
interface TicketData {
  userId: string;
  ticketNumber: string;
}

interface PoolData {
  amount: number;
}

interface DrawData {
  winningNumber: string;
}

interface SetTicketRequest {
  userId: string;
  ticketNumber: string;
}

interface AddPoolRequest {
  amount: number;
}

interface DrawRequest {
  winningNumber: string;
}

export class LotteryDO {
  private state: DurableObjectState;
  private pool: number = 0;
  private tickets: Record<string, string> = {}; // 使用对象而不是Map，方便持久化
  private lastWinner: any = null;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    
    // 从持久化存储加载数据
    this.state.blockConcurrencyWhile(async () => {
      const pool = await this.state.storage.get<number>("pool");
      this.pool = pool || 0;
      
      const tickets = await this.state.storage.get<Record<string, string>>("tickets");
      this.tickets = tickets || {};
      
      const lastWinner = await this.state.storage.get<any>("lastWinner");
      this.lastWinner = lastWinner || null;
    });
  }

  // 保存所有数据到持久化存储
  private async saveAll() {
    await this.state.storage.put("pool", this.pool);
    await this.state.storage.put("tickets", this.tickets);
    await this.state.storage.put("lastWinner", this.lastWinner);
  }

  /**
   * 设置用户彩票
   * @param userId 用户ID
   * @param ticketNumber 彩票号码
   */
  async setTicket(userId: string, ticketNumber: string): Promise<{ success: boolean; message?: string }> {
    // 检查用户是否已经购买
    if (this.tickets[userId]) {
      return { 
        success: false, 
        message: "您已经购买过本期彩票了" 
      };
    }

    // 验证彩票号码格式（3位数字）
    if (!/^\d{3}$/.test(ticketNumber)) {
      return { 
        success: false, 
        message: "彩票号码必须是3位数字" 
      };
    }

    this.tickets[userId] = ticketNumber;
    await this.saveAll();
    
    return { success: true };
  }

  /**
   * 获取用户彩票号码
   * @param userId 用户ID
   */
  async getTicket(userId: string): Promise<string | null> {
    return this.tickets[userId] || null;
  }

  /**
   * 列出所有彩票
   */
  async listTickets(): Promise<{ userId: string; ticketNumber: string }[]> {
    const result: { userId: string; ticketNumber: string }[] = [];
    for (const [userId, ticketNumber] of Object.entries(this.tickets)) {
      result.push({ userId, ticketNumber });
    }
    return result;
  }

  /**
   * 获取购买人数
   */
  async getTicketCount(): Promise<number> {
    return Object.keys(this.tickets).length;
  }

  /**
   * 设置奖池金额
   * @param amount 金额
   */
  async setPool(amount: number): Promise<void> {
    this.pool = amount;
    await this.state.storage.put("pool", this.pool);
  }

  /**
   * 增加奖池金额
   * @param amount 增加的金额
   */
  async addToPool(amount: number): Promise<number> {
    this.pool += amount;
    await this.state.storage.put("pool", this.pool);
    return this.pool;
  }

  /**
   * 获取奖池金额
   */
  async getPool(): Promise<number> {
    return this.pool;
  }

  /**
   * 清空所有记录
   */
  async clean(): Promise<void> {
    this.tickets = {};
    this.pool = 0;
    this.lastWinner = null;
    await this.state.storage.deleteAll();
  }

  /**
   * 开奖
   * @param winningNumber 中奖号码
   */
  async draw(winningNumber: string): Promise<{
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

    // 计算本期总奖池 = 上期累积 + 本期购买金额
    const currentPool = this.pool + (Object.keys(this.tickets).length * 10);
    
    // 查找匹配的彩票
    const exactMatches: { userId: string; ticketNumber: string }[] = [];
    const firstTwoMatches: { userId: string; ticketNumber: string }[] = [];
    const winningFirstTwo = winningNumber.substring(0, 2);

    for (const [userId, ticketNumber] of Object.entries(this.tickets)) {
      if (ticketNumber === winningNumber) {
        exactMatches.push({ userId, ticketNumber });
      } else if (ticketNumber.substring(0, 2) === winningFirstTwo) {
        firstTwoMatches.push({ userId, ticketNumber });
      }
    }

    // 计算奖金
    const exactPrize = exactMatches.length > 0 ? Math.floor(currentPool * 0.5 / exactMatches.length) : 0;
    const firstTwoPrize = firstTwoMatches.length > 0 ? Math.floor(currentPool * 0.3 / firstTwoMatches.length) : 0;
    
    // 未分配的奖金累积到下一期
    const remainingPrize = currentPool - (exactPrize * exactMatches.length) - (firstTwoPrize * firstTwoMatches.length);
    
    // 保存开奖信息
    this.lastWinner = {
      winningNumber,
      exactMatches,
      firstTwoMatches,
      exactPrize,
      firstTwoPrize,
      remainingPrize,
      drawTime: new Date().toISOString()
    };

    // 清空本期购买记录，保留未分配奖金到奖池
    this.tickets = {};
    this.pool = remainingPrize;
    
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
   * 获取上期开奖信息
   */
  async getLastDraw(): Promise<any> {
    return this.lastWinner;
  }

  /**
   * HTTP请求处理
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    
    try {
      switch (path) {
        case '/set-ticket': {
          const data = await request.json() as SetTicketRequest;
          const result = await this.setTicket(data.userId, data.ticketNumber);
          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        case '/get-ticket': {
          const userId = url.searchParams.get('userId');
          if (!userId) {
            return new Response(JSON.stringify({ error: 'userId is required' }), { status: 400 });
          }
          const ticketNumber = await this.getTicket(userId);
          return new Response(JSON.stringify({ userId, ticketNumber }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        case '/list-tickets': {
          const tickets = await this.listTickets();
          return new Response(JSON.stringify({ tickets }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        case '/ticket-count': {
          const count = await this.getTicketCount();
          return new Response(JSON.stringify({ count }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        case '/set-pool': {
          const data = await request.json() as PoolData;
          await this.setPool(data.amount);
          return new Response(JSON.stringify({ success: true, pool: this.pool }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        case '/add-pool': {
          const data = await request.json() as AddPoolRequest;
          const newPool = await this.addToPool(data.amount);
          return new Response(JSON.stringify({ success: true, pool: newPool }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        case '/get-pool': {
          const pool = await this.getPool();
          return new Response(JSON.stringify({ pool }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        case '/clean': {
          await this.clean();
          return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        case '/draw': {
          const data = await request.json() as DrawRequest;
          const result = await this.draw(data.winningNumber);
          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        case '/last-draw': {
          const lastDraw = await this.getLastDraw();
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