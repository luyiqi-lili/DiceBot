import { describe, it, expect } from 'vitest';
import {
	ALLOWED_CHAT_IDS,
	MAJOR_ARCANA,
	likeTextMapFriend,
	fishList,
	backupConfig,
} from '../../src/lib/liveConfig';

describe('liveConfig — ALLOWED_CHAT_IDS', () => {
	it('是一个 Set', () => {
		expect(ALLOWED_CHAT_IDS).toBeInstanceOf(Set);
	});

	it('包含至少一个群组 ID', () => {
		expect(ALLOWED_CHAT_IDS.size).toBeGreaterThan(0);
	});
});

describe('liveConfig — MAJOR_ARCANA', () => {
	it('包含正位和逆位共 44 张牌', () => {
		expect(MAJOR_ARCANA).toHaveLength(44);
	});

	it('每张牌有 name 和 file 属性', () => {
		for (const card of MAJOR_ARCANA) {
			expect(card).toHaveProperty('name');
			expect(card).toHaveProperty('file');
			expect(typeof card.name).toBe('string');
			expect(typeof card.file).toBe('string');
			expect(card.file).toMatch(/^https?:\/\//);
		}
	});

	it('前 22 张为正方牌（无"逆"前缀）', () => {
		const upright = MAJOR_ARCANA.slice(0, 22);
		for (const card of upright) {
			expect(card.name).not.toContain('逆');
		}
	});

	it('后 22 张为逆位牌（含"逆"前缀）', () => {
		const reversed = MAJOR_ARCANA.slice(22);
		for (const card of reversed) {
			expect(card.name).toContain('逆');
		}
	});
});

describe('liveConfig — likeTextMapFriend', () => {
	it('是一个数组', () => {
		expect(Array.isArray(likeTextMapFriend)).toBe(true);
	});

	it('每个条目包含 range 和 texts', () => {
		for (const entry of likeTextMapFriend) {
			expect(entry).toHaveProperty('range');
			expect(entry).toHaveProperty('texts');
			expect(Array.isArray(entry.texts)).toBe(true);
			expect(entry.texts.length).toBeGreaterThan(0);
		}
	});
});

describe('liveConfig — fishList', () => {
	it('是一个数组且不为空', () => {
		expect(Array.isArray(fishList)).toBe(true);
		expect(fishList.length).toBeGreaterThan(0);
	});

	it('每条鱼有 name、hookRate 和 value 属性', () => {
		for (const fish of fishList) {
			expect(fish).toHaveProperty('name');
			expect(fish).toHaveProperty('hookRate');
			expect(fish).toHaveProperty('value');
			expect(typeof fish.name).toBe('string');
			expect(typeof fish.hookRate).toBe('number');
			expect(typeof fish.value).toBe('number');
		}
	});
});

describe('liveConfig — backupConfig', () => {
	it('是一个数组', () => {
		expect(Array.isArray(backupConfig)).toBe(true);
	});
});
