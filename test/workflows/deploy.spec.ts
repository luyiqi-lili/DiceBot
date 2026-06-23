import { describe, expect, it } from 'vitest';
// @ts-ignore: loaded as text by Vite
import workflow from '../../.github/workflows/deploy.yml?raw';

describe('deploy workflow', () => {
	it('points the dev bot webhook at the branch Worker after deploy', () => {
		expect(workflow).toContain('WORKER_URL="https://${WORKER_NAME}.luyiqi-lili.workers.dev"');
		expect(workflow).toContain('https://api.telegram.org/bot${DEV_BOT_TOKEN}/setWebhook');
		expect(workflow).toContain('--arg url "$WORKER_URL"');
	});

	it('does not hard-code the dev bot token', () => {
		expect(workflow).not.toMatch(/\d+:[A-Za-z0-9_-]{20,}/);
		expect(workflow).toContain('DEV_BOT_TOKEN: ${{ secrets.DEV_BOT_TOKEN }}');
	});
});
