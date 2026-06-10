import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['test/e2e/**/*.spec.ts'],
		environment: 'node',
		pool: 'forks',
		testTimeout: 30000,
	},
});
