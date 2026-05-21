/**
 * @file src/lib/fishCore.ts
 * @description 钓鱼游戏核心逻辑 — 命令版和网页版共用。
 *   使用泊松分布选鱼 + hookRate 判定，baitCost 作为撒网强度系数。
 *   原本两套系统各自实现，现统一为此函数。
 */

import { fishList } from "./liveConfig";

// ── 常量 ────────────────────────────────────────────────
export const MAX_FISH_ATTEMPTS = 20;
export const FISH_RECORD_PREFIX = "fish_rec:";

// ── 类型 ────────────────────────────────────────────────
export interface FishingRecord {
	date: string;
	count: number;
	results: Array<{
		baitCost: number;
		hooked: boolean;
		fishValue: string | number;
		messageId?: any;
		timestamp?: number;
		score?: number;
		fishName?: string;
	}>;
}

export interface CatchResult {
	hooked: boolean;
	fishName: string;
	fishValue: number;
}

/**
 * 泊松采样（Knuth 算法）
 */
function samplePoisson(lambdaNum: number): number {
	if (lambdaNum <= 0) return 0;
	const L = Math.exp(-lambdaNum);
	let k = 0;
	let p = 1.0;
	while (p > L) {
		k++;
		p *= Math.random();
		if (k > 1e6) break;
	}
	const r = k - 1;
	return r >= 0 ? r : 0;
}

/**
 * 核心捕鱼逻辑：根据分数和鱼饵花费判定是否钓到鱼。
 *
 * - score < 100: 没鱼咬钩
 * - score > 1000: 鱼跑了
 * - 其余区间：泊松分布决定目标 value → 从 fishList 选区 → hookRate 判定
 */
export function catchFish(score: number, baitCost: number): CatchResult {
	if (score < 100) return { hooked: false, fishName: "", fishValue: 0 };
	if (score > 1000) return { hooked: false, fishName: "", fishValue: 0 };

	const values = fishList.map(f => Number(f.value));
	const minV = 0;
	const maxV = Math.max(...values);
	const norm = (score - 100) / (1000 - 100);
	const meanValueContinuous = minV + norm * (maxV - minV);
	const lambda = Math.max(0, meanValueContinuous - minV) * (baitCost / 3.0);

	const targetValue = Math.min(maxV, Math.max(minV, minV + samplePoisson(lambda)));
	if (targetValue === 0) return { hooked: false, fishName: "", fishValue: 0 };

	let candidates = fishList.filter(f => Number(f.value) === targetValue);
	if (!candidates.length) {
		const closest = values.reduce((a, v) => (Math.abs(v - targetValue) < Math.abs(a - targetValue) ? v : a));
		candidates = fishList.filter(f => Number(f.value) === closest);
	}

	const chosen = candidates[Math.floor(Math.random() * candidates.length)];
	const hookProb = Math.max(0, Math.min(1, Number(chosen.hookRate) + 0.1 * baitCost));

	if (Math.random() < hookProb) {
		return { hooked: true, fishName: chosen.name, fishValue: Number(chosen.value) };
	}
	return { hooked: false, fishName: "", fishValue: 0 };
}

// ── 日期工具 ────────────────────────────────────────────
export function nowDateYMD(): string {
	return new Date().toISOString().split("T")[0];
}

// ── KV 记录操作（命令版和网页版共用）────────────────────
// 统一 key = ${FISH_RECORD_PREFIX}${userId}

export async function getFishingRecord(
	kv: KVNamespace,
	userId: string,
): Promise<FishingRecord> {
	const key = `${FISH_RECORD_PREFIX}${userId}`;
	const raw = await kv.get(key);
	const today = nowDateYMD();
	if (!raw) return { date: today, count: 0, results: [] };
	try {
		const parsed = JSON.parse(raw) as FishingRecord;
		if (parsed.date !== today) return { date: today, count: 0, results: [] };
		return parsed;
	} catch {
		return { date: today, count: 0, results: [] };
	}
}

export async function setFishingRecord(
	kv: KVNamespace,
	userId: string,
	record: FishingRecord,
): Promise<void> {
	const key = `${FISH_RECORD_PREFIX}${userId}`;
	await kv.put(key, JSON.stringify(record));
}

export function hasProcessedMessage(
	record: FishingRecord,
	messageId?: number | undefined,
): boolean {
	if (messageId === undefined) return false;
	return record.results.some(r => r.messageId === messageId);
}
