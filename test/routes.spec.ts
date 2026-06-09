import { describe, expect, it } from 'vitest';
import { COMMAND_ROUTES } from '../src/routes';

describe('COMMAND_ROUTES', () => {
	it('/钓鱼 使用 fish 命令处理器', () => {
		expect(COMMAND_ROUTES['钓鱼']).toEqual(COMMAND_ROUTES.fish);
	});
});
