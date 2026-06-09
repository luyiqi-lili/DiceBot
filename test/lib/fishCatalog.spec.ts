import { describe, expect, it, vi } from 'vitest';
import { defaultFishList } from '../../src/data/fish';
import { addFishToCatalog, FISH_CATALOG_KEY, getFishCatalog, getHookRateForValue, removeFishFromCatalog } from '../../src/lib/fishCatalog';

function makeKv(initial: Record<string, string> = {}): KVNamespace {
	const store = new Map(Object.entries(initial));
	return {
		get: vi.fn(async (key: string) => store.get(key) ?? null),
		put: vi.fn(async (key: string, value: string) => {
			store.set(key, value);
		}),
	} as any;
}

describe('fishCatalog', () => {
	it('initializes the KV catalog from the default fish list when empty', async () => {
		const kv = makeKv();

		const catalog = await getFishCatalog(kv);

		expect(catalog.length).toBe(defaultFishList.length);
		expect(kv.put).toHaveBeenCalledWith(FISH_CATALOG_KEY, JSON.stringify(defaultFishList));
	});

	it('adds a fish with the fixed hook rate for its value', async () => {
		const kv = makeKv({ [FISH_CATALOG_KEY]: JSON.stringify([]) });

		const fish = await addFishToCatalog(kv, '🐟测试鱼', 13, 12345);

		expect(fish).toEqual({
			name: '<a href="tg://user?id=12345" >🐟测试鱼</a>',
			hookRate: getHookRateForValue(13),
			value: 13,
		});
		const saved = JSON.parse(String(await kv.get(FISH_CATALOG_KEY)));
		expect(saved).toEqual([fish]);
	});

	it('rejects values outside 1 through 13 for user-added fish', async () => {
		const kv = makeKv({ [FISH_CATALOG_KEY]: JSON.stringify([]) });

		await expect(addFishToCatalog(kv, '越界鱼', 14, 12345)).rejects.toThrow('value');
	});

	it('removes a fish by its one-based catalog index', async () => {
		const kv = makeKv({
			[FISH_CATALOG_KEY]: JSON.stringify([
				{ name: '<a href="tg://user?id=1" >鱼A</a>', hookRate: 0.4, value: 1 },
				{ name: '<a href="tg://user?id=2" >鱼B</a>', hookRate: 0.3, value: 3 },
			]),
		});

		const removed = await removeFishFromCatalog(kv, 2);

		expect(removed).toEqual({ name: '<a href="tg://user?id=2" >鱼B</a>', hookRate: 0.3, value: 3 });
		const saved = JSON.parse(String(await kv.get(FISH_CATALOG_KEY)));
		expect(saved).toEqual([{ name: '<a href="tg://user?id=1" >鱼A</a>', hookRate: 0.4, value: 1 }]);
	});
});
