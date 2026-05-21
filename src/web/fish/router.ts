import type { Env } from '../../index';
import { 
    handleFishWeb, 
    handleFishData, 
    handleFishCast, 
    handleFishPull,
    handleFishScore 
} from './index';

/** 钓鱼游戏 Web 路由分发 — 匹配 /web/fish 下的各子路径 */
export async function handleFishRoutes(
    request: Request,
    env: Env
): Promise<Response | null> {
    const url = new URL(request.url);
    const path = url.pathname;

    // 游戏页面
    if (path === '/web/fish') {
        return handleFishWeb(request, env);
    }

    // 获取游戏数据
    if (path === '/web/fish/data' && request.method === 'GET') {
        return handleFishData(request, env);
    }

    // 抛竿
    if (path === '/web/fish/cast' && request.method === 'POST') {
        return handleFishCast(request, env);
    }

    // 拉杆
    if (path === '/web/fish/pull' && request.method === 'POST') {
        return handleFishPull(request, env);
    }

    // 提交分数（用于Telegram排行榜）
    if (path === '/web/fish/submit-score' && request.method === 'POST') {
        return handleFishScore(request, env);
    }

    return null;
}