import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		exclude: [
			'test/e2e/**',
			'node_modules/**',
			'test/index*.spec.ts',
			'test/lottery-api.spec.ts',
			'test/telegram-webhook-contract.spec.ts',
			'test/lib/financialDonations.spec.ts',
			'test/web/fishAuth.spec.ts',
		],
	},
});
