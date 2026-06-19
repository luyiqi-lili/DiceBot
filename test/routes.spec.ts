import { describe, expect, it } from 'vitest';
import { COMMAND_ROUTES } from '../src/routes';

describe('COMMAND_ROUTES', () => {
	it('/f 注册到 fish 命令', () => {
		expect(COMMAND_ROUTES.f).toMatchObject({
			module: './commands/fish',
			handler: 'handleFish',
		});
	});

	it('/钓鱼 不再注册为 fish 命令别名', () => {
		expect(COMMAND_ROUTES['钓鱼']).toBeUndefined();
	});

	it('/ask 注册到问题检查命令', () => {
		expect(COMMAND_ROUTES.ask).toMatchObject({
			module: './commands/ask',
			handler: 'handleAsk',
		});
	});
});
