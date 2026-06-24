import { describe, expect, it } from 'vitest';
// @ts-ignore: loaded as text by Vite
import script from '../../scripts/notify-deploy.sh?raw';

describe('notify-deploy.sh', () => {
	it('reads the Telegram bot token from the environment', () => {
		expect(script).not.toMatch(/BOT_TOKEN="\d+:[^"]+"/);
		expect(script).toContain('BOT_TOKEN="${BOT_TOKEN:-${TOKEN:-${DEV_BOT_TOKEN:-}}}"');
	});

	it('allows the deploy notification target to be configured from the environment', () => {
		expect(script).toContain('CHAT_ID="${CHAT_ID:--1002970430696}"');
		expect(script).toContain('TOPIC_ID="${TOPIC_ID:-89}"');
	});
});
