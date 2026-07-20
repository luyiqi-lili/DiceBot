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

	it('/check 注册到规则查询命令', () => {
		expect(COMMAND_ROUTES.check).toMatchObject({
			module: './commands/check',
			handler: 'handleCheck',
		});
	});

	it('已下线的聊天 AI 命令不再注册，但源码需求入口已恢复', () => {
		expect(COMMAND_ROUTES.ask).toBeUndefined();
		expect(COMMAND_ROUTES.trans).toBeUndefined();
		expect(COMMAND_ROUTES.report).toBeUndefined();
		expect(COMMAND_ROUTES.wish?.handler).toBe('handleWish');
		expect(COMMAND_ROUTES.issue?.handler).toBe('handleWish');
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
