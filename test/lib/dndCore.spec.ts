import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  rollD, rollD6, rollD20, rollD10, roll4d6k3,
  calcMod, calcMaxHP, calcManaMax, fmtMod,
  attrNameToKey, attrKeyToName, parseAttrBonus, fmtAttrBonuses,
  isSuperAdmin, parseAttributes, shuffle, ALL_ATTR_KEYS,
  SUPER_ADMIN_ID,
} from '../../src/lib/dndCore';

describe('dndCore 纯函数', () => {
  describe('掷骰', () => {
    it('rollD(6) 返回 1-6', () => {
      for (let i = 0; i < 100; i++) {
        const r = rollD(6);
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(6);
      }
    });

    it('roll4d6k3 返回 3-18（4d6 取最高 3）', () => {
      for (let i = 0; i < 100; i++) {
        const r = roll4d6k3();
        expect(r).toBeGreaterThanOrEqual(3);
        expect(r).toBeLessThanOrEqual(18);
      }
    });

    it('rollD20 返回 1-20', () => {
      for (let i = 0; i < 100; i++) {
        expect(rollD20()).toBeGreaterThanOrEqual(1);
        expect(rollD20()).toBeLessThanOrEqual(20);
      }
    });
  });

  describe('属性计算', () => {
    it('calcMod: 14 → +2', () => expect(calcMod(14)).toBe(2));
    it('calcMod: 10 → 0', () => expect(calcMod(10)).toBe(0));
    it('calcMod: 8 → -1', () => expect(calcMod(8)).toBe(-1));
    it('fmtMod: 14 → "+2"', () => expect(fmtMod(14)).toBe('+2'));
    it('fmtMod: 8 → "-1"', () => expect(fmtMod(8)).toBe('-1'));
    it('fmtMod: 10 → "+0"', () => expect(fmtMod(10)).toBe('+0'));
  });

  describe('属性名转换', () => {
    it('attrNameToKey("力量") → "str"', () => expect(attrNameToKey('力量')).toBe('str'));
    it('attrNameToKey("敏捷") → "dex"', () => expect(attrNameToKey('敏捷')).toBe('dex'));
    it('attrNameToKey("不存在") → null', () => expect(attrNameToKey('不存在')).toBeNull());
    it('attrKeyToName("str") → "力量"', () => expect(attrKeyToName('str')).toBe('力量'));
  });

  describe('parseAttrBonus', () => {
    it('"+2敏捷,+1智力"', () => {
      expect(parseAttrBonus('+2敏捷,+1智力')).toEqual({ '敏捷': 2, '智力': 1 });
    });
    it('"+1力量"', () => {
      expect(parseAttrBonus('+1力量')).toEqual({ '力量': 1 });
    });
    it('"力量+2,敏捷+1"', () => {
      expect(parseAttrBonus('力量+2,敏捷+1')).toEqual({ '力量': 2, '敏捷': 1 });
    });
    it('空字符串返回 {}', () => expect(parseAttrBonus('')).toEqual({}));
  });

  describe('fmtAttrBonuses', () => {
    it('{敏捷:2,智力:1} → 包含 +2敏捷 和 +1智力', () => {
      const result = fmtAttrBonuses({ '敏捷': 2, '智力': 1 });
      expect(result).toContain('+2敏捷');
      expect(result).toContain('+1智力');
    });
    it('空 → "无"', () => expect(fmtAttrBonuses({})).toBe('无'));
  });

  describe('HP 计算', () => {
    it('战士 d10 + CON(+2) → 12', () => expect(calcMaxHP(10, 2)).toBe(12));
    it('法师 d6 + CON(-1) → 5', () => expect(calcMaxHP(6, -1)).toBe(5));
    it('最低 1', () => expect(calcMaxHP(4, -5)).toBe(1));
  });

  describe('法力计算', () => {
    it('主属性=智力 → 10 + 3 + INT(+2) = 15', () => {
      expect(calcManaMax('智力', 1, 2, 0)).toBe(15);
    });
    it('主属性=感知 → 8 + 2 + WIS(+1) = 11', () => {
      expect(calcManaMax('感知', 1, 0, 1)).toBe(11);
    });
    it('主属性=力量 → 0', () => {
      expect(calcManaMax('力量', 1, 2, 2)).toBe(0);
    });
  });

  describe('权限', () => {
    it('8080375150 是超管', () => expect(isSuperAdmin('8080375150')).toBe(true));
    it('普通用户不是超管', () => expect(isSuperAdmin('123456789')).toBe(false));
  });

  describe('parseAttributes', () => {
    it('正常 JSON', () => {
      const attrs = parseAttributes('{"str":14,"dex":12,"con":13,"int":10,"wis":8,"cha":15}');
      expect(attrs.str).toBe(14);
      expect(attrs.dex).toBe(12);
    });
    it('损坏 JSON → 默认 10', () => {
      const attrs = parseAttributes('bad');
      expect(attrs.str).toBe(10);
    });
  });

  describe('shuffle', () => {
    it('不改变长度和元素', () => {
      const arr = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
      const result = shuffle(arr);
      expect(result).toHaveLength(6);
      expect(result.sort()).toEqual(arr.sort());
    });
  });
});
