import { describe, expect, it } from 'vitest';
import { COMMAND_ROUTES } from '../src/routes';

describe('COMMAND_ROUTES', () => {
	it('/钓鱼 不再注册为 fish 命令别名', () => {
		expect(COMMAND_ROUTES['钓鱼']).toBeUndefined();
	});
});
