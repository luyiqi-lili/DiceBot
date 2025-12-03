import TgMessage, { ParsedUpdate, EnvLike } from "../lib/tgMessage";
import { deleteMarkup, escapeHtml } from "../lib/util";
import { getBalance, transfer } from "../lib/coinService";

type LotteryEnv = EnvLike & {
  BOT_USERNAME?: string;
  COIN_DO: DurableObjectNamespace;
  LOTTERY_DO: DurableObjectNamespace;
};

// 管理员UID列表（与coin.ts保持一致）
const ADMIN_UIDS = [8080375150, 5621587953, 7804622477, 7476641553, 1019896885];
const TICKET_PRICE = 10;

// 定义响应数据类型接口
interface PoolResponse {
  pool: number;
}

interface TicketResponse {
  userId: string;
  ticketNumber: string | null;
}

interface CountResponse {
  count: number;
}

interface LastDrawResponse {
  lastDraw: any;
}

interface ListTicketsResponse {
  tickets: Array<{ userId: string; ticketNumber: string }>;
}

interface SetTicketResponse {
  success: boolean;
  message?: string;
}

interface CleanResponse {
  success: boolean;
}

interface DrawResponse {
  winningNumber: string;
  exactMatches: Array<{ userId: string; ticketNumber: string }>;
  firstTwoMatches: Array<{ userId: string; ticketNumber: string }>;
  prizePool: number;
  exactPrize: number;
  firstTwoPrize: number;
}

/**
 * 获取Lottery DO的stub
 */
function getLotteryStub(doNs: DurableObjectNamespace) {
  const id = doNs.idFromName("lottery");
  return doNs.get(id);
}

/**
 * 生成随机3位数
 */
function generateTicketNumber(): string {
  return Math.floor(Math.random() * 1000).toString().padStart(3, '0');
}

/**
 * 获取用户显示名称
 */
async function getUserDisplayName(env: LotteryEnv, chatId: number, userId: string): Promise<string> {
  try {
    const member = await TgMessage.fetchChatMember(env, chatId, parseInt(userId));
    return member.first_name || `用户${userId}`;
  } catch (e) {
    return `用户${userId}`;
  }
}

/**
 * 处理 /lottery 命令
 */
export async function handleLottery(parsedMessage: ParsedUpdate, env: LotteryEnv): Promise<void> {
  const chatId = parsedMessage.chatId ?? parsedMessage.message?.chat?.id;
  const threadId = parsedMessage.threadId ?? parsedMessage.message?.message_thread_id;
  const from = parsedMessage.from ?? parsedMessage.message?.from;
  
  if (!chatId || !from) {
    console.error("[lottery] 找不到 chatId 或 from，跳过");
    return;
  }

  const userId = String(from.id);
  const userName = await getUserDisplayName(env, chatId, userId);
  const args = Array.isArray(parsedMessage.args) ? parsedMessage.args.slice() : [];
  const sub = (args[0] || "").toLowerCase();
  
  const lotteryStub = getLotteryStub(env.LOTTERY_DO);

  // /lottery - 显示彩票信息
  if (!sub) {
    try {
      // 获取奖池和购买人数
      const poolRes = await lotteryStub.fetch("https://do/get-pool");
      const poolData = await poolRes.json() as PoolResponse;
      const poolAmount = poolData.pool || 0;
      
      const countRes = await lotteryStub.fetch("https://do/ticket-count");
      const countData = await countRes.json() as CountResponse;
      const ticketCount = countData.count || 0;
      
      // 计算总奖池
      const totalPrizePool = poolAmount + (ticketCount * TICKET_PRICE);
      
      // 获取用户是否已购买
      const ticketRes = await lotteryStub.fetch(`https://do/get-ticket?userId=${encodeURIComponent(userId)}`);
      const ticketData = await ticketRes.json() as TicketResponse;
      const hasTicket = !!ticketData.ticketNumber;
      
      // 获取上期开奖信息
      const lastDrawRes = await lotteryStub.fetch("https://do/last-draw");
      const lastDrawData = await lastDrawRes.json() as LastDrawResponse;
      
      let message = `<b>🎰 大乐透彩票系统</b>\n\n`;
      message += `💰 <b>奖池总额：</b>${totalPrizePool} 💰\n`;
      message += `   └ 上期累积：${poolAmount} 💰\n`;
      message += `   └ 本期购买：${ticketCount} 张 × ${TICKET_PRICE} 💰\n\n`;
      
      if (lastDrawData.lastDraw) {
        const last = lastDrawData.lastDraw;
        message += `📅 <b>上期开奖结果</b>\n`;
        message += `中奖号码：<code>${last.winningNumber}</code>\n`;
        if (last.exactMatches && last.exactMatches.length > 0) {
          message += `一等奖（完全匹配）：${last.exactMatches.length} 人中奖，每人获得 ${last.exactPrize} 💰\n`;
        }
        if (last.firstTwoMatches && last.firstTwoMatches.length > 0) {
          message += `二等奖（前两位匹配）：${last.firstTwoMatches.length} 人中奖，每人获得 ${last.firstTwoPrize} 💰\n`;
        }
        message += `\n`;
      }
      
      message += `🎫 <b>本期状态</b>\n`;
      if (hasTicket) {
        message += `${userName} 已购买彩票，号码：<code>${ticketData.ticketNumber}</code>\n`;
        message += `开奖时自动参与抽奖！\n`;
      } else {
        message += `${userName} 尚未购买本期彩票\n`;
        message += `点击下方按钮花费 ${TICKET_PRICE} 💰 购买一张随机3位数彩票\n`;
      }
      
      message += `\n<b>🏆 中奖规则</b>\n`;
      message += `• 一等奖（完全匹配3位）：分配奖池50%\n`;
      message += `• 二等奖（匹配前2位）：分配奖池30%\n`;
      message += `• 剩余奖金累积到下期奖池\n`;
      
      message += `\n<b>📝 可用命令</b>\n`;
      message += `<code>/lottery</code> - 查看彩票信息\n`;
      message += `<code>/lottery list</code> - 查看购买记录（管理员）\n`;
      message += `<code>/lottery now</code> - 立即开奖（管理员）\n`;
      message += `<code>/lottery clean</code> - 清空记录（管理员）\n`;
      
      // 创建内联键盘 - 如果有票则显示删除按钮，否则显示购买按钮
      // 注意：在购买按钮的callback_data中加入用户ID，确保只有消息的发送者能点击
      const keyboard = TgMessage.buildInlineKeyboard([
        hasTicket 
          ? [{ text: `🗑️ 删除消息`, callback_data: JSON.stringify({ type: "delete_message" }) }]
          : [{ text: `💰 购买彩票 (${TICKET_PRICE} coin)`, callback_data: JSON.stringify({ 
              type: "lottery", 
              action: "buy",
              userId: userId  // 添加用户ID到回调数据中
            }) }]
      ]);
      
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        reply_markup: keyboard,
        message_thread_id: threadId
      });
      
    } catch (error: any) {
      console.error("[lottery] 获取彩票信息失败:", error);
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ 获取彩票信息失败，请稍后重试`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
    }
    return;
  }

  // /lottery list - 管理员查看购买记录
  if (sub === "list") {
    const callerNum = Number(userId);
    if (!ADMIN_UIDS.includes(callerNum)) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${userName}，你没有权限查看购买记录。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }
    
    try {
      const listRes = await lotteryStub.fetch("https://do/list-tickets");
      const listData = await listRes.json() as ListTicketsResponse;
      const tickets = listData.tickets || [];
      
      if (tickets.length === 0) {
        await TgMessage.sendText(env, {
          chat_id: chatId,
          text: `📭 本期暂无购买记录`,
          parse_mode: "HTML",
          message_thread_id: threadId,
          reply_markup: deleteMarkup
        });
        return;
      }
      
      // 分页显示
      const pageSize = 20;
      const totalPages = Math.ceil(tickets.length / pageSize);
      
      for (let page = 0; page < totalPages; page++) {
        const startIdx = page * pageSize;
        const endIdx = Math.min(startIdx + pageSize, tickets.length);
        const pageTickets = tickets.slice(startIdx, endIdx);
        
        let message = `<b>📋 彩票购买记录</b>（第 ${page + 1}/${totalPages} 页）\n\n`;
        message += `总购买人数：${tickets.length}\n`;
        message += `预计奖池增加：${tickets.length * TICKET_PRICE} 💰\n\n`;
        
        for (const ticket of pageTickets) {
          try {
            const displayName = await getUserDisplayName(env, chatId, ticket.userId);
            message += `• ${displayName} - <code>${ticket.ticketNumber}</code>\n`;
          } catch (e) {
            message += `• 用户${ticket.userId} - <code>${ticket.ticketNumber}</code>\n`;
          }
        }
        
        await TgMessage.sendText(env, {
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
          message_thread_id: threadId,
          reply_markup: deleteMarkup
        });
        
        // 如果不是最后一页，等待一下
        if (page < totalPages - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
    } catch (error: any) {
      console.error("[lottery] 获取购买记录失败:", error);
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ 获取购买记录失败`,
        parse_mode: "HTML",
        message_thread_id: threadId,
        reply_markup: deleteMarkup
      });
    }
    return;
  }

  // /lottery now - 管理员开奖
  if (sub === "now") {
    const callerNum = Number(userId);
    if (!ADMIN_UIDS.includes(callerNum)) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${userName}，你没有权限开奖。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }
    
    try {
      // 首先检查是否有购买记录
      const countRes = await lotteryStub.fetch("https://do/ticket-count");
      const countData = await countRes.json() as CountResponse;
      const ticketCount = countData.count || 0;
      
      if (ticketCount === 0) {
        await TgMessage.sendText(env, {
          chat_id: chatId,
          text: `❌ 本期无人购买彩票，无法开奖`,
          parse_mode: "HTML",
          message_thread_id: threadId
        });
        return;
      }
      
      // 生成中奖号码
      const winningNumber = generateTicketNumber();
      
      // 执行开奖
      const drawRes = await lotteryStub.fetch("https://do/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winningNumber })
      });
      
      const drawResult = await drawRes.json() as DrawResponse;
      
      // 发送开奖结果
      let resultMessage = `<b>🎉 大乐透开奖结果</b>\n\n`;
      resultMessage += `🏆 <b>中奖号码：</b><code>${drawResult.winningNumber}</code>\n\n`;
      resultMessage += `💰 <b>本期奖池总额：</b>${drawResult.prizePool} 💰\n\n`;
      
      // 处理一等奖
      if (drawResult.exactMatches.length > 0) {
        resultMessage += `🥇 <b>一等奖（完全匹配）</b>\n`;
        resultMessage += `奖金：每人 ${drawResult.exactPrize} 💰\n`;
        resultMessage += `中奖者：\n`;
        
        for (const match of drawResult.exactMatches) {
          try {
            const displayName = await getUserDisplayName(env, chatId, match.userId);
            resultMessage += `• ${displayName} (<code>${match.ticketNumber}</code>)\n`;
            
            // 发放奖金（从国库转账给用户）
            await transfer(env, env.COIN_DO, "__treasury__", match.userId, drawResult.exactPrize, true);
          } catch (e) {
            resultMessage += `• 用户${match.userId} (<code>${match.ticketNumber}</code>)\n`;
          }
        }
        resultMessage += `\n`;
      } else {
        resultMessage += `🥇 <b>一等奖：无人中奖</b>\n\n`;
      }
      
      // 处理二等奖
      if (drawResult.firstTwoMatches.length > 0) {
        resultMessage += `🥈 <b>二等奖（匹配前两位）</b>\n`;
        resultMessage += `奖金：每人 ${drawResult.firstTwoPrize} 💰\n`;
        resultMessage += `中奖者：\n`;
        
        for (const match of drawResult.firstTwoMatches) {
          try {
            const displayName = await getUserDisplayName(env, chatId, match.userId);
            resultMessage += `• ${displayName} (<code>${match.ticketNumber}</code>)\n`;
            
            // 发放奖金（从国库转账给用户）
            await transfer(env, env.COIN_DO, "__treasury__", match.userId, drawResult.firstTwoPrize, true);
          } catch (e) {
            resultMessage += `• 用户${match.userId} (<code>${match.ticketNumber}</code>)\n`;
          }
        }
        resultMessage += `\n`;
      } else {
        resultMessage += `🥈 <b>二等奖：无人中奖</b>\n\n`;
      }
      
      // 计算未分配奖金
      const remainingPrize = drawResult.prizePool - 
        (drawResult.exactPrize * drawResult.exactMatches.length) - 
        (drawResult.firstTwoPrize * drawResult.firstTwoMatches.length);
      
      resultMessage += `📊 <b>奖金分配情况</b>\n`;
      resultMessage += `• 总奖池：${drawResult.prizePool} 💰\n`;
      resultMessage += `• 一等奖分配：${drawResult.exactPrize * drawResult.exactMatches.length} 💰\n`;
      resultMessage += `• 二等奖分配：${drawResult.firstTwoPrize * drawResult.firstTwoMatches.length} 💰\n`;
      resultMessage += `• 累计到下期：${remainingPrize} 💰\n\n`;
      
      resultMessage += `🎫 新一期彩票已开始，祝您好运！`;
      
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: resultMessage,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      
    } catch (error: any) {
      console.error("[lottery] 开奖失败:", error);
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ 开奖失败：${error.message}`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
    }
    return;
  }

  // /lottery clean - 管理员清空记录
  if (sub === "clean") {
    const callerNum = Number(userId);
    if (!ADMIN_UIDS.includes(callerNum)) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ ${userName}，你没有权限清空记录。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }
    
    try {
      const cleanRes = await lotteryStub.fetch("https://do/clean", {
        method: "POST"
      });
      const cleanData = await cleanRes.json() as CleanResponse;
      
      if (cleanData.success) {
        await TgMessage.sendText(env, {
          chat_id: chatId,
          text: `✅ 彩票系统记录已清空\n所有购买记录和奖池已重置`,
          parse_mode: "HTML",
          message_thread_id: threadId
        });
      } else {
        throw new Error("清空失败");
      }
    } catch (error: any) {
      console.error("[lottery] 清空记录失败:", error);
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ 清空记录失败`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
    }
    return;
  }

  // 未知子命令
  await TgMessage.sendText(env, {
    chat_id: chatId,
    text: `❓ 不支持的子命令，请用：\n` +
      `<code>/lottery</code> 查看彩票信息\n` +
      `<code>/lottery list</code> 查看购买记录（管理员）\n` +
      `<code>/lottery now</code> 立即开奖（管理员）\n` +
      `<code>/lottery clean</code> 清空记录（管理员）`,
    parse_mode: "HTML",
    message_thread_id: threadId
  });
}

/**
 * 处理彩票回调
 */
export async function handleLotteryCallback(callbackQuery: any, callbackData: any, env: LotteryEnv): Promise<void> {
  const chatId = callbackQuery.message?.chat?.id;
  const messageId = callbackQuery.message?.message_id;
  const from = callbackQuery.from;
  
  if (!chatId || !from) {
    console.error("[lottery] 回调缺少必要信息");
    return;
  }

  const currentUserId = String(from.id);
  const currentUserName = await getUserDisplayName(env, chatId, currentUserId);
  const lotteryStub = getLotteryStub(env.LOTTERY_DO);

  // 验证用户是否与回调数据中的用户ID匹配
  if (callbackData.userId && callbackData.userId !== currentUserId) {
    console.log(`[lottery] 用户 ${currentUserId} 试图点击用户 ${callbackData.userId} 的购买按钮，已拒绝`);
    await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
      text: "❌ 这是其他用户的购买按钮，请使用您自己的 /lottery 命令",
      show_alert: true
    });
    return;
  }

  try {
    // 检查是否已购买
    const ticketRes = await lotteryStub.fetch(`https://do/get-ticket?userId=${encodeURIComponent(currentUserId)}`);
    const ticketData = await ticketRes.json() as TicketResponse;
    
    if (ticketData.ticketNumber) {
      // 已购买，回复提示
      await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
        text: `您已购买本期彩票，号码：${ticketData.ticketNumber}`,
        show_alert: true
      });
      
      // 更新消息，显示用户已购买并改为删除按钮
      const poolRes = await lotteryStub.fetch("https://do/get-pool");
      const poolData = await poolRes.json() as PoolResponse;
      const poolAmount = poolData.pool || 0;
      
      const countRes = await lotteryStub.fetch("https://do/ticket-count");
      const countData = await countRes.json() as CountResponse;
      const ticketCount = countData.count || 0;
      
      const totalPrizePool = poolAmount + (ticketCount * TICKET_PRICE);
      
      let newMessage = `<b>🎰 大乐透彩票系统</b>\n\n`;
      newMessage += `💰 <b>奖池总额：</b>${totalPrizePool} 💰\n`;
      newMessage += `   └ 上期累积：${poolAmount} 💰\n`;
      newMessage += `   └ 本期购买：${ticketCount} 张 × ${TICKET_PRICE} 💰\n\n`;
      newMessage += `🎫 <b>本期状态</b>\n`;
      newMessage += `${currentUserName} 已购买彩票，号码：<code>${ticketData.ticketNumber}</code>\n`;
      newMessage += `开奖时自动参与抽奖！\n\n`;
      newMessage += `🎫 您已经购买过本期彩票`;
      
      await TgMessage.editMessageText(env, {
        chat_id: chatId,
        message_id: messageId,
        text: newMessage,
        parse_mode: "HTML",
        reply_markup: deleteMarkup
      });
      
      return;
    }

    // 检查余额 - 使用 coinService 而不是不存在的 DO 端点
    const userBalance = await getBalance(env.COIN_DO, currentUserId);
    
    if (userBalance < TICKET_PRICE) {
      await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
        text: `余额不足，购买彩票需要 ${TICKET_PRICE} 💰\n您当前余额：${userBalance} 💰`,
        show_alert: true
      });
      return;
    }

    // 扣除coin（从用户账户转到国库）
    const transferResult = await transfer(env, env.COIN_DO, currentUserId, "__treasury__", TICKET_PRICE, false);
    
    if (!transferResult.ok) {
      await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
        text: `扣款失败：${transferResult.reason || "未知错误"}`,
        show_alert: true
      });
      return;
    }

    // 生成彩票号码
    const ticketNumber = generateTicketNumber();
    
    // 保存彩票
    const setTicketRes = await lotteryStub.fetch("https://do/set-ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUserId, ticketNumber })
    });
    
    const setTicketData = await setTicketRes.json() as SetTicketResponse;
    
    if (!setTicketData.success) {
      // 购买失败，尝试退款
      await transfer(env, env.COIN_DO, "__treasury__", currentUserId, TICKET_PRICE, true);
      
      await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
        text: `购买失败：${setTicketData.message || "未知错误"}`,
        show_alert: true
      });
      return;
    }

    // 更新消息
    const poolRes = await lotteryStub.fetch("https://do/get-pool");
    const poolData = await poolRes.json() as PoolResponse;
    const poolAmount = poolData.pool || 0;
    
    const countRes = await lotteryStub.fetch("https://do/ticket-count");
    const countData = await countRes.json() as CountResponse;
    const ticketCount = countData.count || 0;
    
    const totalPrizePool = poolAmount + (ticketCount * TICKET_PRICE);
    
    let newMessage = `<b>🎰 大乐透彩票系统</b>\n\n`;
    newMessage += `💰 <b>奖池总额：</b>${totalPrizePool} 💰\n`;
    newMessage += `   └ 上期累积：${poolAmount} 💰\n`;
    newMessage += `   └ 本期购买：${ticketCount} 张 × ${TICKET_PRICE} 💰\n\n`;
    newMessage += `🎫 <b>本期状态</b>\n`;
    newMessage += `${currentUserName} 已购买彩票，号码：<code>${ticketNumber}</code>\n`;
    newMessage += `开奖时自动参与抽奖！\n\n`;
    newMessage += `🎉 购买成功！已扣除 ${TICKET_PRICE} 💰\n`;
    newMessage += `您的新余额：${transferResult.fromNew} 💰`;
    
    await TgMessage.editMessageText(env, {
      chat_id: chatId,
      message_id: messageId,
      text: newMessage,
      parse_mode: "HTML",
      reply_markup: deleteMarkup
    });
    
    await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
      text: `购买成功！您的彩票号码：${ticketNumber}`,
      show_alert: false
    });
    
  } catch (error: any) {
    console.error("[lottery] 处理回调失败:", error);
    await TgMessage.answerCallbackQuery(env, callbackQuery.id, {
      text: "处理失败，请稍后重试",
      show_alert: true
    });
  }
}

export default handleLottery;