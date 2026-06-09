import { defaultFishList } from '../data/fish';
import { escapeHtml } from './util';

export const FISH_CATALOG_KEY = 'fish:list:v1';
export const FISH_ADD_COST = 10;
export const MIN_USER_FISH_VALUE = 1;
export const MAX_USER_FISH_VALUE = 13;

export interface FishCatalogItem {
	name: string;
	hookRate: number;
	value: number;
}

function normalizeCatalog(value: unknown): FishCatalogItem[] | null {
	if (!Array.isArray(value)) return null;
	const normalized: FishCatalogItem[] = [];
	for (const item of value) {
		const name = String((item as any)?.name ?? '');
		const hookRate = Number((item as any)?.hookRate);
		const fishValue = Number((item as any)?.value);
		if (!name || !Number.isFinite(hookRate) || !Number.isFinite(fishValue)) return null;
		normalized.push({ name, hookRate, value: fishValue });
	}
	return normalized;
}

export function getHookRateForValue(value: number): number {
	const fishValue = Number(value);
	const found = defaultFishList.find((fish) => Number(fish.value) === fishValue);
	if (!found) {
		throw new Error(`Unsupported fish value: ${value}`);
	}
	return Number(found.hookRate);
}

export async function getFishCatalog(kv: KVNamespace): Promise<FishCatalogItem[]> {
	const raw = await kv.get(FISH_CATALOG_KEY);
	if (raw) {
		try {
			const parsed = normalizeCatalog(JSON.parse(raw));
			if (parsed) return parsed;
		} catch (e) {
			console.warn('[fishCatalog] failed to parse catalog, reseeding defaults', e);
		}
	}

	const seeded = defaultFishList.map((fish) => ({
		name: fish.name,
		hookRate: Number(fish.hookRate),
		value: Number(fish.value),
	}));
	await kv.put(FISH_CATALOG_KEY, JSON.stringify(seeded));
	return seeded;
}

export async function setFishCatalog(kv: KVNamespace, catalog: FishCatalogItem[]): Promise<void> {
	await kv.put(FISH_CATALOG_KEY, JSON.stringify(catalog));
}

export async function addFishToCatalog(
	kv: KVNamespace,
	name: string,
	value: number,
	userId: number,
): Promise<FishCatalogItem> {
	const fishValue = Number(value);
	if (!Number.isInteger(fishValue) || fishValue < MIN_USER_FISH_VALUE || fishValue > MAX_USER_FISH_VALUE) {
		throw new Error(`fish value must be an integer from ${MIN_USER_FISH_VALUE} to ${MAX_USER_FISH_VALUE}`);
	}

	const cleanName = name.trim();
	if (!cleanName) {
		throw new Error('fish name is required');
	}

	const fish: FishCatalogItem = {
		name: `<a href="tg://user?id=${userId}" >${escapeHtml(cleanName)}</a>`,
		hookRate: getHookRateForValue(fishValue),
		value: fishValue,
	};
	const catalog = await getFishCatalog(kv);
	catalog.push(fish);
	await setFishCatalog(kv, catalog);
	return fish;
}
