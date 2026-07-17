import type { Env } from '../../index';
// @ts-ignore: will be loaded by bundler as string
import FISH_HTML from './game.html';

// 复用现有的钓鱼类型和函数
import { fishList, getCastDesc } from "../../lib/liveConfig";
import { escapeHtml, stripHtml } from "../../lib/util";
import {
	catchFish,
	MAX_FISH_ATTEMPTS,
	nowDateYMD,
	getFishingRecord,
	setFishingRecord,
	FishingRecord,
} from "../../lib/fishCore";
import { getBalance as coinGetBalance, addToTreasury, takeFromTreasury } from "../../lib/coinService";
import { getVerifiedWebGameUserId } from "../../lib/telegramAuth";
import { LEGACY_CHAT_ID } from "../../lib/groupScope";

// 最大钓鱼次数 - 统一使用 fishCore 的常量
// 记录类型 FishingRecord 由 fishCore 导出

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
        const userId = await getVerifiedWebGameUserId(request, env, 'fish');
        
        if (!userId) {
            return jsonResponse({ ok: false, error: '未通过 Telegram 游戏认证' }, 401);
        }

        // 获取余额
        const balance = await coinGetBalance(env.COIN_DO, LEGACY_CHAT_ID, userId);

        // 获取今日钓鱼记录（与 /f 命令共用同一 KV key）
        const fishingRecord = await getFishingRecord(env.FISHING_RECORD_KV, LEGACY_CHAT_ID, userId);

        // 计算可用钓鱼次数
        const remainingAttempts = MAX_FISH_ATTEMPTS - fishingRecord.count;

        return jsonResponse({
            ok: true,
            data: {
                userId,
                balance,
                todayCount: fishingRecord.count,
                maxAttempts: MAX_FISH_ATTEMPTS,
                remainingAttempts,
                records: fishingRecord.results.slice(-10).reverse(), // 最近10条记录
                fishList: fishList.map(fish => ({
                    name: stripHtml(fish.name).trim(),
                    value: fish.value,
                    description: (fish as any).description || ''
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
        const body: any = await request.json();
        const { baitCost = 1 } = body;
        const userId = await getVerifiedWebGameUserId(request, env, 'fish', body);
        
        if (!userId) {
            return jsonResponse({ ok: false, error: '未通过 Telegram 游戏认证' }, 401);
        }
        
        const userIdStr = String(userId);
        
        // 检查余额
        const currentBal = await coinGetBalance(env.COIN_DO, LEGACY_CHAT_ID, userIdStr);
        if (currentBal < baitCost) {
            return jsonResponse({
                ok: false,
                error: '余额不足',
                currentBalance: currentBal,
                required: baitCost
            }, 400);
        }

        // 检查今日钓鱼次数（与 /f 命令共用 KV）
        const fishingRecord = await getFishingRecord(env.FISHING_RECORD_KV, LEGACY_CHAT_ID, userIdStr);
        if (fishingRecord.count >= MAX_FISH_ATTEMPTS) {
            return jsonResponse({ 
                ok: false, 
                error: '今日钓鱼次数已达上限',
                maxAttempts: MAX_FISH_ATTEMPTS
            }, 400);
        }
        
        // 扣除鱼饵费用
        await addToTreasury(env, env.COIN_DO, LEGACY_CHAT_ID, userIdStr, baitCost, "鱼饵（游戏）");
        
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
            date: nowDateYMD()
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
        const body: any = await request.json();
        const { castId } = body;
        const userId = await getVerifiedWebGameUserId(request, env, 'fish', body);
        
        if (!userId) {
            return jsonResponse({ ok: false, error: '未通过 Telegram 游戏认证' }, 401);
        }

        if (!castId) {
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
        
        // 获取今日钓鱼记录（与 /f 命令共用 KV）
        const fishingRecord = await getFishingRecord(env.FISHING_RECORD_KV, LEGACY_CHAT_ID, userIdStr);
        if (fishingRecord.count >= MAX_FISH_ATTEMPTS) {
            await env.FISHING_RECORD_KV.delete(castKey); // 清理抛竿记录
            return jsonResponse({ 
                ok: false, 
                error: '今日钓鱼次数已达上限',
                maxAttempts: MAX_FISH_ATTEMPTS
            }, 400);
        }
        
        // 钓鱼结果计算（简化版，实际应使用更复杂的算法）
        const result: Record<string, any> = {};
        result.timestamp = now;
        result.baitCost = baitCost;
        result.hooked = false;
        result.score = score;
        
        // 简单的钓鱼算法
        if (score < 100) {
            // 分数太低，没钓到
            result.hooked = false;
        } else if (score > 1000) {
            // 分数太高，鱼跑了
            result.hooked = false;
        } else {
            const fishResult = catchFish(score, baitCost);
            result.hooked = fishResult.hooked;
            result.fishName = stripHtml(fishResult.fishName).trim();
            result.fishValue = fishResult.fishValue;
            if (fishResult.hooked) {
                await takeFromTreasury(env, env.COIN_DO, LEGACY_CHAT_ID, userIdStr, fishResult.fishValue, "渔获（游戏）");
            }
        }
        
        // 更新钓鱼记录（与 /f 命令共用 KV）
        fishingRecord.results.push(result as any);
        fishingRecord.count += 1;
        await setFishingRecord(env.FISHING_RECORD_KV, LEGACY_CHAT_ID, userIdStr, fishingRecord);

        // 删除抛竿记录
        await env.FISHING_RECORD_KV.delete(castKey);

        // 获取最新余额
        const newBalance = await coinGetBalance(env.COIN_DO, LEGACY_CHAT_ID, userIdStr);
        
        return jsonResponse({
            ok: true,
            data: {
                result,
                newBalance,
                todayCount: fishingRecord.count,
                remainingAttempts: MAX_FISH_ATTEMPTS - fishingRecord.count,
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
