import { describe, expect, it } from 'vitest';
import { recommendModelRoute } from '../../src/lib/modelRouting';

describe('model routing policy', () => {
	it('marks a static free model seed as unverified when no shared credential is active', async () => {
		const route = await recommendModelRoute({}, { complexity: 'standard', budgetState: 'depleted' });
		expect(route).toMatchObject({
			strategy: 'free-only',
			availability: 'catalog-seed-unverified',
			selected: { model: 'gemini-2.5-flash' },
		});
	});

	it('only routes through models visible to active, healthy, shared credentials', async () => {
		const db = {
			prepare(sql: string) {
				return {
					run: async () => ({ success: true }),
					all: async () => sql.includes('SELECT p.available_models_json')
						? { results: [{ available_models_json: '["gemini-2.5-flash-lite"]' }] }
						: { results: [] },
				};
			},
		} as any;
		const route = await recommendModelRoute({ DB: db }, { complexity: 'complex', budgetState: 'low' });

		expect(route).toMatchObject({
			strategy: 'free-first',
			availability: 'validated-donated-credential',
			selected: { model: 'gemini-2.5-flash-lite' },
		});
	});
});
