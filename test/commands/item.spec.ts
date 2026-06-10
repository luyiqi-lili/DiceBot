import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/tgMessage', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));

import TgMessage from '../../src/lib/tgMessage';
import { handleItem } from '../../src/commands/item';

type ItemTemplateRow = {
	id: number;
	chat_id: string;
	name: string;
	item_type: '装备' | '消耗品';
	slot: string;
	attr_bonus: string;
	damage: string;
	uses: number;
	description: string;
};

type InventoryRow = {
	id: number;
	chat_id: string;
	user_id: string;
	template_id: number;
	quantity: number;
	equipped: number;
};

function makeMsg(o: any = {}): any {
	return {
		type: 'message',
		chatId: -100999,
		from: { id: 1, first_name: 'Owner' },
		isCommand: true,
		command: 'item',
		message: { message_id: 1, chat: { id: -100999 } },
		...o,
	};
}

function makeTemplate(o: Partial<ItemTemplateRow> = {}): ItemTemplateRow {
	return {
		id: 1,
		chat_id: '-100999',
		name: '长剑',
		item_type: '装备',
		slot: 'weapon',
		attr_bonus: '{}',
		damage: '',
		uses: 0,
		description: '',
		...o,
	};
}

function makeInventory(o: Partial<InventoryRow> = {}): InventoryRow {
	return {
		id: 1,
		chat_id: '-100999',
		user_id: '1',
		template_id: 1,
		quantity: 1,
		equipped: 0,
		...o,
	};
}

function makeItemDb(seed: { templates?: ItemTemplateRow[]; inventory?: InventoryRow[] } = {}) {
	const templates = [...(seed.templates ?? [])];
	const inventory = [...(seed.inventory ?? [])];
	const calls: Array<{ sql: string; params: any[]; op: 'all' | 'first' | 'run' }> = [];

	const joined = (row: InventoryRow) => {
		const tpl = templates.find(t => t.id === row.template_id);
		if (!tpl) return null;
		return { ...row, ...tpl, id: row.id, template_id: row.template_id };
	};

	const db = {
		templates,
		inventory,
		calls,
		prepare(sql: string) {
			let params: any[] = [];
			const normalized = sql.replace(/\s+/g, ' ').trim();

			const stmt = {
				bind(...bound: any[]) {
					params = bound;
					return stmt;
				},
				async all() {
					calls.push({ sql: normalized, params, op: 'all' });
					if (
						normalized.includes('FROM dnd_inventory inv') &&
						normalized.includes('WHERE inv.chat_id = ? AND inv.user_id = ?')
					) {
						const [chatId, userId] = params;
						const rows = inventory
							.filter(row => row.chat_id === chatId && row.user_id === userId)
							.map(joined)
							.filter(Boolean);
						return { results: rows };
					}
					return { results: [] };
				},
				async first() {
					calls.push({ sql: normalized, params, op: 'first' });
					if (
						normalized.includes('SELECT inv.*, tpl.name') &&
						normalized.includes('WHERE inv.id = ? AND inv.chat_id = ?')
					) {
						const [id, chatId] = params;
						const row = inventory.find(item => item.id === id && item.chat_id === chatId);
						return row ? joined(row) : null;
					}
					if (
						normalized.includes('SELECT id, quantity FROM dnd_inventory') &&
						normalized.includes('WHERE chat_id = ? AND user_id = ? AND template_id = ?')
					) {
						const [chatId, userId, templateId] = params;
						const row = inventory.find(item =>
							item.chat_id === chatId && item.user_id === userId && item.template_id === templateId
						);
						return row ? { id: row.id, quantity: row.quantity } : null;
					}
					return null;
				},
				async run() {
					calls.push({ sql: normalized, params, op: 'run' });
					if (normalized.startsWith('DELETE FROM dnd_inventory WHERE id = ?')) {
						const [id] = params;
						const idx = inventory.findIndex(item => item.id === id);
						if (idx >= 0) inventory.splice(idx, 1);
						return { meta: { changes: idx >= 0 ? 1 : 0 } };
					}
					if (normalized.startsWith('UPDATE dnd_inventory SET quantity = quantity - ? WHERE id = ?')) {
						const [qty, id] = params;
						const row = inventory.find(item => item.id === id);
						if (row) row.quantity -= qty;
						return { meta: { changes: row ? 1 : 0 } };
					}
					if (normalized.startsWith('UPDATE dnd_inventory SET quantity = ? WHERE id = ?')) {
						const [qty, id] = params;
						const row = inventory.find(item => item.id === id);
						if (row) row.quantity = qty;
						return { meta: { changes: row ? 1 : 0 } };
					}
					if (normalized.startsWith('INSERT INTO dnd_inventory')) {
						const [chatId, userId, templateId, quantity] = params;
						const nextId = Math.max(0, ...inventory.map(item => item.id)) + 1;
						inventory.push({
							id: nextId,
							chat_id: chatId,
							user_id: userId,
							template_id: templateId,
							quantity,
							equipped: 0,
						});
						return { meta: { changes: 1 } };
					}
					return { meta: { changes: 0 } };
				},
			};

			return stmt;
		},
	};

	return db;
}

describe('/item', () => {
	beforeEach(() => vi.clearAllMocks());

	it('缺少 D1 时提示当前环境未配置', async () => {
		await handleItem(makeMsg(), { TOKEN: 't' } as any);

		expect(vi.mocked(TgMessage.sendText).mock.calls[0]?.[1]?.text).toContain('需要 D1 数据库支持');
	});

	it('D1 背包为空时显示空背包和删除按钮', async () => {
		const env = { TOKEN: 't', DB: makeItemDb() } as any;

		await handleItem(makeMsg(), env);

		const message = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1];
		expect(message.text).toContain('🎒 <b>背包</b>');
		expect(message.text).toContain('空空如也');
		expect(message.reply_markup.inline_keyboard.at(-1)?.[0]?.text).toBe('删除消息');
	});

	it('从 D1 渲染已装备、未装备和消耗品按钮背包', async () => {
		const env = {
			TOKEN: 't',
			DB: makeItemDb({
				templates: [
					makeTemplate({ id: 10, name: '铁头盔', slot: 'head', attr_bonus: '{"体质":1}', description: '坚固' }),
					makeTemplate({ id: 11, name: '长剑', slot: 'weapon', attr_bonus: '{"力量":2}', damage: 'd8力量', description: '锋利' }),
					makeTemplate({ id: 12, name: '治疗药水', item_type: '消耗品', slot: '', uses: 3, description: '恢复体力' }),
				],
				inventory: [
					makeInventory({ id: 1, template_id: 10, equipped: 1 }),
					makeInventory({ id: 2, template_id: 11, equipped: 0 }),
					makeInventory({ id: 3, template_id: 12, quantity: 2 }),
				],
			}),
		} as any;

		await handleItem(makeMsg(), env);

		const message = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1];
		expect(message.text).toContain('已装备');
		expect(message.text).toContain('头部: <b>铁头盔</b> (体质+1)');
		expect(message.text).toContain('消耗品');
		expect(message.text).toContain('治疗药水 ×2');
		expect(message.text).toContain('未装备');
		expect(message.text).toContain('长剑 (力量+2)');

		const labels = message.reply_markup.inline_keyboard.flat().map((button: any) => button.text);
		expect(labels).toContain('🔓 卸下 铁头盔');
		expect(labels).toContain('⚔️ 装备 长剑');
		expect(labels).toContain('🧪 使用 治疗药水 (2)');
	});

	it('/item send 名称 数量 会赠送未装备物品并更新 D1 背包', async () => {
		const db = makeItemDb({
			templates: [
				makeTemplate({ id: 11, name: '长剑', slot: 'weapon', attr_bonus: '{"力量":2}', damage: 'd8力量' }),
			],
			inventory: [
				makeInventory({ id: 2, user_id: '1', template_id: 11, quantity: 3, equipped: 0 }),
			],
		});
		const env = { TOKEN: 't', DB: db } as any;

		await handleItem(makeMsg({
			args: ['send', '长剑', '2'],
			isReply: true,
			replyToMessage: { message_id: 5, from: { id: 2, first_name: 'Target' } },
		}), env);

		const message = vi.mocked(TgMessage.sendText).mock.calls[0]?.[1];
		expect(message.text).toContain('Owner 将 长剑 ×2 赠送给了 Target');
		expect(db.inventory.find(item => item.id === 2)?.quantity).toBe(1);
		expect(db.inventory.find(item => item.user_id === '2' && item.template_id === 11)?.quantity).toBe(2);
	});
});
