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

	it('翻译命令和源码需求入口已注册，其余下线聊天命令仍未注册', () => {
		expect(COMMAND_ROUTES.ask).toBeUndefined();
		expect(COMMAND_ROUTES.trans).toEqual({ module: './commands/trans', handler: 'handleTrans', deleteMsg: false });
		expect(COMMAND_ROUTES.quota).toEqual({ module: './commands/quota', handler: 'handleQuota', deleteMsg: false });
		expect(COMMAND_ROUTES.report).toBeUndefined();
		expect(COMMAND_ROUTES.wish?.handler).toBe('handleWish');
		expect(COMMAND_ROUTES.issue?.handler).toBe('handleWish');
	});

	it('注册私聊 Token 捐赠命令及下划线兼容路由', () => {
		expect(COMMAND_ROUTES.donatetoken).toMatchObject({
			module: './commands/donateToken',
			handler: 'handleDonateToken',
			deleteMsg: false,
		});
		expect(COMMAND_ROUTES.revoketoken).toMatchObject({
			module: './commands/revokeToken',
			handler: 'handleRevokeToken',
			deleteMsg: false,
		});
		expect(COMMAND_ROUTES.revoke?.handler).toBe('handleRevokeToken');
		expect(COMMAND_ROUTES.donate).toMatchObject({
			module: './commands/donateMoney',
			handler: 'handleDonate',
			deleteMsg: false,
		});
		expect(COMMAND_ROUTES.paysupport?.handler).toBe('handlePaySupport');
		expect(COMMAND_ROUTES.terms?.handler).toBe('handleDonationTerms');
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
