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

	it('/wish 不删除用户原始许愿消息', () => {
		expect(COMMAND_ROUTES.wish).toMatchObject({
			module: './commands/wish',
			handler: 'handleWish',
			deleteMsg: false,
		});
	});

	it('DND 命令元数据与静态 import switch 保持同步', () => {
		expect(COMMAND_ROUTES.dnd).toMatchObject({ module: './commands/dndHelp', handler: 'handleDndHelp' });
		expect(COMMAND_ROUTES.new).toMatchObject({ module: './commands/dndNew', handler: 'handleDndNew' });
		expect(COMMAND_ROUTES.char).toMatchObject({ module: './commands/dndChar', handler: 'handleDndChar' });
		expect(COMMAND_ROUTES.skill).toMatchObject({ module: './commands/dndSkill', handler: 'handleDndSkill' });
		expect(COMMAND_ROUTES.skills).toMatchObject({ module: './commands/dndSkills', handler: 'handleDndSkills' });
		expect(COMMAND_ROUTES.rest).toMatchObject({ module: './commands/dndRest', handler: 'handleDndRest' });
		expect(COMMAND_ROUTES.attack).toMatchObject({ module: './commands/dndAttack', handler: 'handleDndAttack' });
		expect(COMMAND_ROUTES.atk).toMatchObject({ module: './commands/dndAttack', handler: 'handleDndAttack' });
		expect(COMMAND_ROUTES.cast).toMatchObject({ module: './commands/dndCast', handler: 'handleDndCast' });
		expect(COMMAND_ROUTES.lvup).toMatchObject({ module: './commands/dndUpgrade', handler: 'handleDndLvUp' });
		expect(COMMAND_ROUTES.level).toMatchObject({ module: './commands/dndUpgrade', handler: 'handleDndLevel' });
	});
});
