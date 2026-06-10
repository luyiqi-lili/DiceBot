import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/lib/tgMessage', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));

import TgMessage from '../../src/lib/tgMessage';
import { performCast } from '../../src/commands/dndCast';
import type { DndCharacterRow, DndSkillRow } from '../../src/lib/dndCore';

function makeCharacter(o: Partial<DndCharacterRow> = {}): DndCharacterRow {
	const today = new Date().toISOString().split('T')[0];
	return {
		id: 1,
		chat_id: '-100999',
		user_id: '1',
		char_name: 'Caster',
		race: '人类',
		class: '牧师',
		level: 1,
		xp: 0,
		hp_max: 10,
		hp_current: 10,
		attributes: JSON.stringify({ str: 10, dex: 10, con: 10, int: 10, wis: 14, cha: 10 }),
		proficiencies: JSON.stringify(['治疗术']),
		equipment: '[]',
		rest_short_used: 0,
		rest_long_used: 0,
		rest_date: today,
		mana_max: 8,
		mana_current: 8,
		mana_date: today,
		...o,
	};
}

function makeSkill(o: Partial<DndSkillRow> = {}): DndSkillRow {
	return {
		id: 1,
		chat_id: '-100999',
		skill_name: '治疗术',
		linked_attr: '感知',
		class_name: '牧师',
		race_bonus: '{}',
		damage: '2d6 heal',
		mana_cost: 2,
		spell_level: 1,
		description: '金光包裹加速愈合',
		...o,
	};
}

function makeCastDb(seed: { characters: DndCharacterRow[]; skills: DndSkillRow[] }) {
	const characters = seed.characters.map(row => ({ ...row }));
	const skills = seed.skills.map(row => ({ ...row }));
	const calls: Array<{ sql: string; params: any[]; op: 'all' | 'first' | 'run' }> = [];

	return {
		characters,
		skills,
		calls,
		prepare(sql: string) {
			let params: any[] = [];
			const normalized = sql.replace(/\s+/g, ' ').trim();
			const stmt = {
				bind(...bound: any[]) {
					params = bound;
					return stmt;
				},
				async first() {
					calls.push({ sql: normalized, params, op: 'first' });
					if (normalized.includes('FROM dnd_characters WHERE chat_id = ? AND user_id = ?')) {
						const [chatId, userId] = params;
						return characters.find(row => row.chat_id === chatId && row.user_id === userId) ?? null;
					}
					if (normalized.includes('FROM dnd_skills WHERE chat_id = ? AND skill_name = ?')) {
						const [chatId, skillName] = params;
						return skills.find(row => row.chat_id === chatId && row.skill_name === skillName) ?? null;
					}
					return null;
				},
				async all() {
					calls.push({ sql: normalized, params, op: 'all' });
					return { results: [] };
				},
				async run() {
					calls.push({ sql: normalized, params, op: 'run' });
					if (normalized.startsWith('UPDATE dnd_characters SET mana_current = ? WHERE chat_id = ? AND user_id = ?')) {
						const [manaCurrent, chatId, userId] = params;
						const row = characters.find(char => char.chat_id === chatId && char.user_id === userId);
						if (row) row.mana_current = manaCurrent;
						return { meta: { changes: row ? 1 : 0 } };
					}
					if (normalized.startsWith('UPDATE dnd_characters SET hp_current = ? WHERE chat_id = ? AND user_id = ?')) {
						const [hpCurrent, chatId, userId] = params;
						const row = characters.find(char => char.chat_id === chatId && char.user_id === userId);
						if (row) row.hp_current = hpCurrent;
						return { meta: { changes: row ? 1 : 0 } };
					}
					return { meta: { changes: 0 } };
				},
			};
			return stmt;
		},
	};
}

describe('/cast DND magic', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(Math, 'random').mockReturnValue(0);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('healing magic spends mana and restores the replied target HP', async () => {
		const db = makeCastDb({
			characters: [
				makeCharacter({ user_id: '1', char_name: 'Caster', mana_current: 8 }),
				makeCharacter({ id: 2, user_id: '2', char_name: 'Target', hp_current: 3, proficiencies: '[]' }),
			],
			skills: [makeSkill()],
		});

		await performCast({ TOKEN: 't', DB: db } as any, -100999, undefined, '1', '治疗术', {
			targetUserId: '2',
			targetName: 'Target',
			replyToMessageId: 99,
		});

		expect(db.characters.find(char => char.user_id === '1')?.mana_current).toBe(6);
		expect(db.characters.find(char => char.user_id === '2')?.hp_current).toBe(5);

		const message = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1];
		expect(message.text).toContain('🔮 <b>治疗术</b> 施放！');
		expect(message.text).toContain('MP: 6/8');
		expect(message.text).toContain('Target 回复 2 HP → 5/10');
		expect(message.reply_to_message_id).toBe(99);
	});
});
