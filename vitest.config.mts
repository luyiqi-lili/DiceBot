import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
	test: {
		exclude: ['test/e2e/**', 'node_modules/**'],
		poolOptions: {
			workers: {
				wrangler: {
					configPath: './wrangler.jsonc',
					environment: 'dev',
				},
			},
		},
	},
});
