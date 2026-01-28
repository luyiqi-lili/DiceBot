import type { Env } from '../../index';
// @ts-ignore: will be loaded by bundler as string
import FISH_HTML from './game.html';

// 复用现有的钓鱼类型和函数
import { fishList, getCastDesc } from "../../lib/liveConfig";
import { escapeHtml } from "../../lib/util";
import { getBalance as coinGetBalance, addToTreasury, takeFromTreasury } from "../../lib/coinService";

// 最大钓鱼次数
const maxRecode = 20;

// 钓鱼记录类型
type FishingResult = {
    timestamp: number;
    baitCost: number;
    hooked: boolean;
    fishName?: string;
    fishValue?: number;
    score?: number; // 游戏分数
};

type FishingRecord = {
    date: string;
    count: number;
    results: FishingResult[];
};

/**
 * 处理游戏页面请求
 */
export async function handleFishWeb(request: Request, env: Env): Promise<Response> {
    if (request.method === 'GET') {
        return new Response(FISH_HTML, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
    }

    return new Response('Method Not Allowed', { status: 405 });
}

/**
 * 获取用户钓鱼数据
 */
export async function handleFishData(request: Request, env: Env): Promise<Response> {
    try {
        const url = new URL(request.url);
        const userId = url.searchParams.get('user_id');
        
        if (!userId) {
            return jsonResponse({ ok: false, error: '缺少用户ID' }, 400);
        }

        // 获取余额
        const balance = await coinGetBalance(env.COIN_DO, userId);
        
        // 获取今日钓鱼记录（简化版，实际需要从KV获取）
        const today = new Date().toISOString().split('T')[0];
        const recordKey = `fish_record:${userId}:${today}`;
        let fishingRecord: FishingRecord = {
            date: today,
            count: 0,
            results: []
        };
        
        try {
            const rawRecord = await env.FISHING_RECORD_KV.get(recordKey);
            if (rawRecord) {
                fishingRecord = JSON.parse(rawRecord);
            }
        } catch (e) {
            console.log('无钓鱼记录或解析失败，使用默认记录');
        }

        // 计算可用钓鱼次数
        const remainingAttempts = maxRecode - fishingRecord.count;

        return jsonResponse({
            ok: true,
            data: {
                userId,
                balance,
                todayCount: fishingRecord.count,
                maxAttempts: maxRecode,
                remainingAttempts,
                records: fishingRecord.results.slice(-10).reverse(), // 最近10条记录
                fishList: fishList.map(fish => ({
                    name: fish.name,
                    value: fish.value,
                    description: fish.description || ''
                }))
            }
        });
        
    } catch (error) {
        console.error('获取钓鱼数据失败:', error);
        return jsonResponse({ 
            ok: false, 
            error: '获取数据失败',
            message: error instanceof Error ? error.message : '未知错误'
        }, 500);
    }
}

/**
 * 处理抛竿请求
 */
export async function handleFishCast(request: Request, env: Env): Promise<Response> {
    try {
        const body = await request.json();
        const { userId, baitCost = 1 } = body;
        
        if (!userId) {
            return jsonResponse({ ok: false, error: '缺少用户ID' }, 400);
        }
        
        const userIdStr = String(userId);
        
        // 检查余额
        const currentBal = await coinGetBalance(env.COIN_DO, userIdStr);
        if (currentBal < baitCost) {
            return jsonResponse({ 
                ok: false, 
                error: '余额不足',
                currentBalance: currentBal,
                required: baitCost
            }, 400);
        }
        
        // 检查今日钓鱼次数
        const today = new Date().toISOString().split('T')[0];
        const recordKey = `fish_record:${userIdStr}:${today}`;
        let fishingRecord: FishingRecord = {
            date: today,
            count: 0,
            results: []
        };
        
        try {
            const rawRecord = await env.FISHING_RECORD_KV.get(recordKey);
            if (rawRecord) {
                fishingRecord = JSON.parse(rawRecord);
            }
        } catch (e) {
            console.log('无钓鱼记录或解析失败');
        }
        
        if (fishingRecord.count >= maxRecode) {
            return jsonResponse({ 
                ok: false, 
                error: '今日钓鱼次数已达上限',
                maxAttempts: maxRecode
            }, 400);
        }
        
        // 扣除鱼饵费用
        await addToTreasury(env, env.COIN_DO, userIdStr, baitCost, "鱼饵（游戏）");
        
        // 生成抛竿数据
        const strength = Math.floor(Math.random() * 100) + 11; // 11-110
        const castDesc = getCastDesc(strength);
        const startTime = Date.now();
        
        // 保存抛竿状态（临时，5分钟过期）
        const castKey = `fish_cast:${userIdStr}:${startTime}`;
        await env.FISHING_RECORD_KV.put(castKey, JSON.stringify({
            userId: userIdStr,
            strength,
            baitCost,
            startTime,
            date: today
        }), { expirationTtl: 300 }); // 5分钟过期
        
        return jsonResponse({
            ok: true,
            data: {
                castId: `${userIdStr}:${startTime}`, // 用于拉杆时识别
                strength,
                baitCost,
                startTime,
                description: castDesc,
                remainingBalance: currentBal - baitCost,
                message: `花费 ${baitCost}💰 鱼饵，${castDesc}`
            }
        });
        
    } catch (error) {
        console.error('抛竿失败:', error);
        return jsonResponse({ 
            ok: false, 
            error: '抛竿失败',
            message: error instanceof Error ? error.message : '未知错误'
        }, 500);
    }
}

/**
 * 处理拉杆请求
 */
export async function handleFishPull(request: Request, env: Env): Promise<Response> {
    try {
        const body = await request.json();
        const { userId, castId } = body;
        
        if (!userId || !castId) {
            return jsonResponse({ ok: false, error: '缺少必要参数' }, 400);
        }
        
        const userIdStr = String(userId);
        
        // 获取抛竿记录
        const castKey = `fish_cast:${userIdStr}:${castId.split(':')[1]}`;
        const castDataRaw = await env.FISHING_RECORD_KV.get(castKey);
        
        if (!castDataRaw) {
            return jsonResponse({ 
                ok: false, 
                error: '抛竿记录不存在或已过期',
                hint: '请重新抛竿'
            }, 400);
        }
        
        const castData = JSON.parse(castDataRaw);
        const { strength, baitCost, startTime } = castData;
        
        // 计算经过的时间（秒）
        const now = Date.now();
        const elapsedSeconds = Math.floor((now - startTime) / 1000);
        
        // 计算分数（基于时间和力量）
        const rawScore = elapsedSeconds * strength;
        const score = Math.floor(rawScore);
        
        // 获取今日钓鱼记录
        const today = new Date().toISOString().split('T')[0];
        const recordKey = `fish_record:${userIdStr}:${today}`;
        let fishingRecord: FishingRecord = {
            date: today,
            count: 0,
            results: []
        };
        
        try {
            const rawRecord = await env.FISHING_RECORD_KV.get(recordKey);
            if (rawRecord) {
                fishingRecord = JSON.parse(rawRecord);
            }
        } catch (e) {
            console.log('无钓鱼记录或解析失败');
        }
        
        // 检查是否超过最大次数
        if (fishingRecord.count >= maxRecode) {
            await env.FISHING_RECORD_KV.delete(castKey); // 清理抛竿记录
            return jsonResponse({ 
                ok: false, 
                error: '今日钓鱼次数已达上限',
                maxAttempts: maxRecode
            }, 400);
        }
        
        // 钓鱼结果计算（简化版，实际应使用更复杂的算法）
        let result: FishingResult = {
            timestamp: now,
            baitCost,
            hooked: false,
            score
        };
        
        // 简单的钓鱼算法
        if (score < 100) {
            // 分数太低，没钓到
            result.hooked = false;
        } else if (score > 1000) {
            // 分数太高，鱼跑了
            result.hooked = false;
        } else {
            // 根据分数决定钓到什么鱼
            const successChance = Math.min(0.8, 0.3 + (score / 1000) * 0.5);
            const isSuccess = Math.random() < successChance;
            
            if (isSuccess) {
                // 随机选择一种鱼
                const availableFish = fishList.filter(f => Number(f.value) > 0);
                const randomFish = availableFish[Math.floor(Math.random() * availableFish.length)];
                
                result.hooked = true;
                result.fishName = randomFish.name;
                result.fishValue = Number(randomFish.value);
                
                // 发放奖励
                await takeFromTreasury(env, env.COIN_DO, userIdStr, result.fishValue, "渔获（游戏）");
            }
        }
        
        // 更新钓鱼记录
        fishingRecord.results.push(result);
        fishingRecord.count += 1;
        
        // 保存记录
        await env.FISHING_RECORD_KV.put(recordKey, JSON.stringify(fishingRecord));
        
        // 删除抛竿记录
        await env.FISHING_RECORD_KV.delete(castKey);
        
        // 获取最新余额
        const newBalance = await coinGetBalance(env.COIN_DO, userIdStr);
        
        return jsonResponse({
            ok: true,
            data: {
                result,
                newBalance,
                todayCount: fishingRecord.count,
                remainingAttempts: maxRecode - fishingRecord.count,
                message: result.hooked 
                    ? `🎉 钓到了 ${result.fishName}！价值 ${result.fishValue}💰`
                    : score < 100 
                        ? '😕 没有鱼咬钩...'
                        : '💥 鱼跑了！力道太大了。'
            }
        });
        
    } catch (error) {
        console.error('拉杆失败:', error);
        return jsonResponse({ 
            ok: false, 
            error: '拉杆失败',
            message: error instanceof Error ? error.message : '未知错误'
        }, 500);
    }
}

/**
 * 提交游戏分数到Telegram（用于排行榜）
 */
export async function handleFishScore(request: Request, env: Env): Promise<Response> {
    // 复用 hello 游戏的分数提交逻辑
    const { handleScoreSubmit } = await import('./score');
    return handleScoreSubmit(request, env);
}

/**
 * 辅助函数：返回JSON响应
 */
function jsonResponse(data: any, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        }
    });
}