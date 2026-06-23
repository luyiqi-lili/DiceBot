import { describe, expect, it } from 'vitest';
// @ts-ignore: loaded as text by Vite
import script from '../../scripts/notify-deploy.sh?raw';

describe('notify-deploy.sh', () => {
	it('reads the Telegram bot token from the environment', () => {
		expect(script).not.toMatch(/BOT_TOKEN="\d+:[^"]+"/);
		expect(script).toContain('${BOT_TOKEN:');
	});
});
