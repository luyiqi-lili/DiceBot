import type { Env } from '../index';
import { FREE_MODEL_SEEDS, chooseFreeModel, publicProviderCatalog } from './aiProviderRegistry';
import { ensureCredentialProfileTable } from './apiKeyDonations';

type RoutingEnv = Pick<Env, 'DB'>;

export type BudgetState = 'healthy' | 'low' | 'depleted';
export type TaskComplexity = 'simple' | 'standard' | 'complex';

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
	});
}

async function activeFreeModels(db: D1Database | undefined): Promise<string[]> {
	if (!db) return [];
	let result: D1Result<{ available_models_json: string }>;
	try {
		await ensureCredentialProfileTable(db);
		result = await db.prepare(`
			SELECT p.available_models_json
			FROM api_credential_profiles p
			JOIN api_key_donations d ON d.id = p.donation_id
			WHERE p.provider = 'google-gemini' AND p.usage_policy = 'shared_inference'
				AND p.health_status = 'healthy' AND d.status = 'active'
		`).all<{ available_models_json: string }>();
	} catch (error) {
		console.error('[model-routing] credential catalog unavailable', {
			error: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
		});
		return [];
	}
	const models = new Set<string>();
	for (const row of result.results ?? []) {
		try {
			const parsed = JSON.parse(row.available_models_json);
			if (Array.isArray(parsed)) for (const model of parsed) if (typeof model === 'string') models.add(model);
		} catch {
			// Ignore a damaged catalog row; another healthy credential can still route.
		}
	}
	return Array.from(models).sort();
}

export async function recommendModelRoute(
	env: RoutingEnv,
	input: { complexity: TaskComplexity; budgetState: BudgetState },
) {
	const availableModels = await activeFreeModels(env.DB);
	const selected = chooseFreeModel(input.complexity, availableModels.length ? availableModels : undefined);
	return {
		complexity: input.complexity,
		budgetState: input.budgetState,
		strategy: input.budgetState === 'depleted' ? 'free-only' : input.budgetState === 'low' ? 'free-first' : 'quality-first',
		selected,
		availability: availableModels.length ? 'validated-donated-credential' : 'catalog-seed-unverified',
		availableFreeModels: availableModels,
		note: availableModels.length
			? 'The model is visible to at least one active credential whose donor allowed shared inference.'
			: 'No active shared credential currently proves runtime availability; do not execute this recommendation yet.',
	};
}

export async function handleModelRoutingApi(request: Request, env: RoutingEnv): Promise<Response> {
	if (request.method !== 'GET') return json({ error: 'Method Not Allowed' }, 405);
	const url = new URL(request.url);
	if (url.pathname === '/api/ai/models') {
		return json({ providers: publicProviderCatalog(), freeModelSeeds: FREE_MODEL_SEEDS });
	}
	if (url.pathname === '/api/ai/route') {
		const complexity = url.searchParams.get('complexity') ?? 'standard';
		const budgetState = url.searchParams.get('budget') ?? 'depleted';
		if (!['simple', 'standard', 'complex'].includes(complexity)) return json({ error: 'Invalid complexity' }, 400);
		if (!['healthy', 'low', 'depleted'].includes(budgetState)) return json({ error: 'Invalid budget' }, 400);
		return json(await recommendModelRoute(env, {
			complexity: complexity as TaskComplexity,
			budgetState: budgetState as BudgetState,
		}));
	}
	return json({ error: 'Not Found' }, 404);
}
