/**
 * @file src/routes.ts
 * @description 命令与回调路由注册表。
 *   将 index.ts 中的巨型 switch-case 重构为数据驱动的路由表，
 *   新增命令时只需在此文件中添加一行配置，index.ts 无需改动。
 *
 *   命令名称来自 grammY Context 兼容层的命令解析结果（不含斜线）。
 *   同义命令通过多个 key 指向同一个 route 实现。
 */

// ── 接口定义 ──────────────────────────────────────────────

/** 命令路由条目 */
export interface CommandRoute {
	/** 动态导入的模块路径（相对 routes.ts） */
	module: string;
	/** 模块中导出的 handler 函数名 */
	handler: string;
	/** 是否在处理完成后删除触发命令的消息。默认 true，设为 false 则不删除 */
	deleteMsg?: boolean;
}

/** Callback 回调路由条目 */
export interface CallbackRoute {
	module: string;
	handler: string;
}

// ── 命令注册表 ────────────────────────────────────────────

export const COMMAND_ROUTES: Record<string, CommandRoute> = {
	/* ── 恭喜发财系列（不删命令消息）── */
	'恭喜发财': { module: './commands/congrats', handler: 'handleCongrats', deleteMsg: false },
	'恭喜發財': { module: './commands/congrats', handler: 'handleCongrats', deleteMsg: false },
	'爸爸': { module: './commands/congrats', handler: 'handleCongrats', deleteMsg: false },
	'媽媽': { module: './commands/congrats', handler: 'handleCongrats', deleteMsg: false },
	'妈妈': { module: './commands/congrats', handler: 'handleCongrats', deleteMsg: false },

	/* ── 彩票 ── */
	lottery:  { module: './commands/lottery', handler: 'handleLottery' },

	/* ── 活动记录 ── */
	act:      { module: './commands/act', handler: 'handleAct' },

	/* ── 主题消息排行 ── */
	top:      { module: './commands/top', handler: 'handleTop' },

	/* ── 书签 ── */
	book:     { module: './commands/book', handler: 'handleBook' },

	/* ── 用户信息 ── */
	whoami:   { module: './commands/whoami', handler: 'handleWhoami' },

	/* ── 权限管理（群主）── */
	perm:     { module: './commands/perm', handler: 'handlePerm' },

	/* ── 主题可用范围（群主）── */
	topic:    { module: './commands/topic', handler: 'handleTopic' },

	/* ── 塔罗占卜 ── */
	fate:     { module: './commands/fate', handler: 'handleFate' },

	/* ── 物品 ── */
	item:     { module: './commands/item', handler: 'handleItem' },

	/* ── 好感度 ── */
	rose:     { module: './commands/rose', handler: 'handleRose' },

	/* ── 掷骰 ── */
	roll:     { module: './commands/roll', handler: 'handleRoll' },
	r:        { module: './commands/roll', handler: 'handleRoll' },
	rd:       { module: './commands/roll', handler: 'handleRoll' },
	rh:       { module: './commands/roll', handler: 'handleRoll' },

	/* ── 动作指令 ── */
	em:       { module: './commands/emote', handler: 'handleEmote' },
	me:       { module: './commands/emote', handler: 'handleEmote' },
	emote:    { module: './commands/emote', handler: 'handleEmote' },

	/* ── 帮助 ── */
	help:     { module: './commands/help', handler: 'handleHelp' },

	/* ── 功能规则查询 ── */
	check:    { module: './commands/check', handler: 'handleCheck' },

	/* ── 钓鱼 ── */
	f:        { module: './commands/fish', handler: 'handleFish' },
	fish:     { module: './commands/fish', handler: 'handleFish' },

	/* ── 货币 ── */
	coin:     { module: './commands/coin', handler: 'handleCoin' },

	/* ── 回声 ── */
	echo:     { module: './commands/echo', handler: 'handleEcho' },

	/* ── 调用统计 ── */
	like:     { module: './commands/like', handler: 'handleLike' },

	/* ── 决斗 ── */
	duel:     { module: './commands/duel', handler: 'handleDuel' },

	/* ── 群骰 ── */
	groll:    { module: './commands/groll', handler: 'handleGroll' },

	/* ── 21点 ── */
	'21':     { module: './commands/21', handler: 'handle21' },

	/* ── 新闻爆料 ── */
	news:     { module: './commands/news', handler: 'handleNews' },

	/* ── 规则 ── */
	rule:     { module: './commands/rule', handler: 'handleRule' },

	/* ── 公开源码需求（默认关闭，由独立 GitHub Issue token 控制）── */
	wish:     { module: './commands/wish', handler: 'handleWish', deleteMsg: false },
	issue:    { module: './commands/wish', handler: 'handleWish', deleteMsg: false },

	/* ── 私聊 API Token 捐赠（handler 负责立即删除含密钥的消息）── */
	donatetoken: { module: './commands/donateToken', handler: 'handleDonateToken', deleteMsg: false },
	donate:      { module: './commands/donateMoney', handler: 'handleDonate', deleteMsg: false },
	paysupport:  { module: './commands/paymentSupport', handler: 'handlePaySupport', deleteMsg: false },
	terms:       { module: './commands/paymentSupport', handler: 'handleDonationTerms', deleteMsg: false },
	donateterms: { module: './commands/paymentSupport', handler: 'handleDonationTerms', deleteMsg: false },

	/* ── DND GM（不自动删除命令消息）── */
	dnd:      { module: './commands/dndHelp', handler: 'handleDndHelp' },
	new:      { module: './commands/dndNew', handler: 'handleDndNew' },
	char:     { module: './commands/dndChar', handler: 'handleDndChar' },
	skill:    { module: './commands/dndSkill', handler: 'handleDndSkill' },
	skills:   { module: './commands/dndSkills', handler: 'handleDndSkills' },
	rest:     { module: './commands/dndRest', handler: 'handleDndRest' },
	gm:       { module: './commands/dndGm', handler: 'handleDndGm', deleteMsg: false },
	attack:   { module: './commands/dndAttack', handler: 'handleDndAttack' },
	atk:      { module: './commands/dndAttack', handler: 'handleDndAttack' },
	cast:     { module: './commands/dndCast', handler: 'handleDndCast' },
	lvup:     { module: './commands/dndUpgrade', handler: 'handleDndLvUp' },
	level:    { module: './commands/dndUpgrade', handler: 'handleDndLevel' },
};

// ── Callback 注册表 ───────────────────────────────────────

export const CALLBACK_ROUTES: Record<string, CallbackRoute> = {
	congrats: { module: './commands/congrats', handler: 'handleCongratsCallback' },
	'21':     { module: './commands/21', handler: 'handle21Callback' },
	duel:     { module: './commands/duel', handler: 'handleDuelCallback' },
	fish:     { module: './commands/fish', handler: 'handleFishCallback' },
	groll:    { module: './commands/groll', handler: 'handleGrollCallback' },
	lottery:  { module: './commands/lottery', handler: 'handleLotteryCallback' },
	dnd_reroll:  { module: './commands/dndNew', handler: 'handleDndRerollCallback' },
	dnd_confirm: { module: './commands/dndNew', handler: 'handleDndConfirmCallback' },
	item_action: { module: './commands/item', handler: 'handleItemCallback' },
	lu:          { module: './commands/dndUpgrade', handler: 'handleLvUpCallback' },
};
