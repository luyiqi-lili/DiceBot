/**
 * @file src/web/fish/score.ts
 * @description 钓鱼游戏分数提交处理器。
 *   委托给 src/web/score.ts 的通用 handleGameScore 实现。
 */

import type { Env } from '../../index';
import { handleGameScore } from '../score';

export function handleScoreSubmit(request: Request, env: Env): Promise<Response> {
	return handleGameScore(request, env, 'fish');
}
