import type { Env } from '../index';
import { LILY_CORE_PERSONA } from '../data/lilyPersona';
import { callAIChat, hasAIChatProvider } from '../lib/aiClient';
import TgMessage, { EnvLike, ParsedUpdate } from '../lib/telegram';
import { escapeHtml } from '../lib/util';
import {
	ERRONEOUS_PRAY_REWARD_AMOUNT,
	ERRONEOUS_PRAY_REWARD_FIX_DATE,
	VIOLET_ANNIVERSARY_PRAY_DATES,
	VIOLET_ANNIVERSARY_PRAY_REWARD,
} from './coin';

type CheckContext = {
	source: string;
	content: string;
};

function questionFromArgs(args: string[] | undefined): string {
	return (args ?? []).join(' ').trim();
}

function compactQuestion(question: string): string {
	return question.toLowerCase().replace(/\s+/g, '');
}

function isBroadQuestion(compact: string): boolean {
	return [
		'规则',
		'功能',
		'命令',
		'帮助',
		'查询',
		'check',
		'怎么用',
		'怎么玩',
	].includes(compact);
}

function mentionsDailyPray(compact: string): boolean {
	return compact.includes('签到') ||
		compact.includes('祈祷') ||
		compact.includes('coinpray') ||
		compact.includes('coin祈祷');
}

function mentionsAnniversaryReward(compact: string): boolean {
	return mentionsDailyPray(compact) && (
		compact.includes('周年') ||
		compact.includes('紫罗兰') ||
		compact.includes('50') ||
		compact.includes('固定')
	);
}

function formatDates(dates: Set<string>): string {
	return Array.from(dates).sort().join('、');
}

function answerAnniversaryPrayRule(): string {
	const dates = formatDates(VIOLET_ANNIVERSARY_PRAY_DATES);
	return [
		'莉莉查到现在的判断是这样的：',
		`<blockquote>先使用 <code>/coin pray</code>，并且要在允许话题里通过检查；不在允许话题里不会发签到奖励。`,
		`通过后，代码会按 ISO 日期字符串判断当天；如果正好是 ${dates}，奖励就固定为 ${VIOLET_ANNIVERSARY_PRAY_REWARD} 💰。`,
		`其他日期不会因为“周年庆”固定 50c，会继续走普通每日祈祷奖励。`,
		`${ERRONEOUS_PRAY_REWARD_FIX_DATE} 还有一段修正逻辑：如果当天已经记录过错误的 ${ERRONEOUS_PRAY_REWARD_AMOUNT} 💰签到、且还没修正，莉莉会先收回 ${ERRONEOUS_PRAY_REWARD_AMOUNT} 💰，再允许重新签到一次。</blockquote>`,
	].join('\n');
}

function answerDailyPrayRule(): string {
	const dates = formatDates(VIOLET_ANNIVERSARY_PRAY_DATES);
	return [
		'每日签到现在按这套规则判断：',
		`<blockquote>入口是 <code>/coin pray</code>，只在指定群话题开放。`,
		`每个用户每天一次，代码按 ISO 日期字符串记录，记录键是 <code>coin_pray:&lt;用户ID&gt;</code>。当天已经签过就会提示明天再来。`,
		`普通日期随机给 8-12 💰；2025-08-12 到 2025-08-17 会给 11-20 💰；${dates} 固定给 ${VIOLET_ANNIVERSARY_PRAY_REWARD} 💰。`,
		`发奖成功后会写入今天日期，并附上一条今日运势。</blockquote>`,
	].join('\n');
}

function answerWishRule(): string {
	return [
		'愿望池现在是这样走的：',
		'<blockquote><code>/wish 想法</code> 会先检查内容是不是太空泛。太短、只有“加功能”这种说不清的愿望不会入池。',
		'能入池的愿望会记成 pending，等莉莉整理成待办，管理员回复编号确认后，才会开始处理。</blockquote>',
	].join('\n');
}

function buildCoinPrayContext(): CheckContext {
	return {
		source: 'src/commands/coin.ts',
		content: [
			'export const VIOLET_ANNIVERSARY_PRAY_DATES = new Set(["2026-06-19", "2026-06-21"]);',
			'export const VIOLET_ANNIVERSARY_PRAY_REWARD = 50;',
			'export const ERRONEOUS_PRAY_REWARD_FIX_DATE = "2026-06-29";',
			'export const ERRONEOUS_PRAY_REWARD_AMOUNT = 50;',
			'if (sub === "pray") {',
			'  const allowed =',
			'    (chatId === -1002848481881 && [66].includes(threadId ?? 0)) ||',
			'    (chatId === -1002970430696 && [89].includes(threadId ?? 0)) ||',
			'    (chatId === -1002970430696 && [157].includes(threadId ?? 0)) ||',
			'    (chatId === -1002742074355 && [638714].includes(threadId ?? 0));',
			'  const prayKey = `coin_pray:${userId}`;',
			'  const today = new Date().toISOString().split("T")[0];',
			'  const shouldFixErroneousPrayReward =',
			'    today === ERRONEOUS_PRAY_REWARD_FIX_DATE &&',
			'    lastPrayDate === today &&',
			'    erroneousPrayFixDone !== "done";',
			'  if (lastPrayDate === today && !shouldFixErroneousPrayReward) return;',
			'  const duringVioletAnniversary = VIOLET_ANNIVERSARY_PRAY_DATES.has(today);',
			'  const duringEvent = todayD >= new Date("2025-08-12") && todayD <= new Date("2025-08-17");',
			'  const gain = duringVioletAnniversary ? VIOLET_ANNIVERSARY_PRAY_REWARD : duringEvent ? randomInt(11, 20) : randomInt(8, 12);',
			'  await takeFromTreasury(env, doNs, userId, gain, "祈祷", true);',
			'  await doPutRaw(doNs, prayKey, today);',
			'}',
			'',
			`执行结果：周年庆日期集合 = ${formatDates(VIOLET_ANNIVERSARY_PRAY_DATES)}；周年庆奖励 = ${VIOLET_ANNIVERSARY_PRAY_REWARD}；错误奖励修正日期 = ${ERRONEOUS_PRAY_REWARD_FIX_DATE}；错误奖励修正额度 = ${ERRONEOUS_PRAY_REWARD_AMOUNT}。`,
		].join('\n'),
	};
}

function buildWishContext(): CheckContext[] {
	return [
		{
			source: 'src/commands/wish.ts',
			content: [
				'const body = wishTextFromArgs(parsedMessage.args);',
				'if (!isMeaningfulWish(body)) {',
				'  await TgMessage.sendText(env, {',
				'    text: "愿望太模糊啦，请说具体一点，比如：<code>/wish 增加每日签到奖励</code>",',
				'  });',
				'  return;',
				'}',
				'const wish = await createWish(env.DB, { chatId, threadId, userId: from.id, firstName: from.first_name ?? "", body });',
				'await TgMessage.sendText(env, {',
				'  text: `莉莉收到愿望 <b>#${wish.id}</b> 啦：${escapeHtml(body)}\\n状态：已记录。\\n接下来会这样走：等待莉莉整理、管理员确认、确认后开始处理。`,',
				'});',
				'',
				'执行结果：/wish 会要求 D1 数据库；愿望内容通过 isMeaningfulWish 后才会写入 pending 状态。',
			].join('\n'),
		},
		{
			source: 'src/lib/wishCore.ts',
			content: [
				'export function isMeaningfulWish(input: string): boolean {',
				'  const text = String(input ?? "").trim();',
				'  if (text.length < 4) return false;',
				'  const compact = text.replace(/\\s+/g, "").toLowerCase();',
				'  if (MEANINGLESS_WORDS.has(compact)) return false;',
				'  if (/^[\\p{P}\\p{S}\\d_]+$/u.test(compact)) return false;',
				'  if (/^(.)\\1{3,}$/u.test(compact)) return false;',
				'  return true;',
				'}',
				'',
				'执行结果：太短、明显无意义、纯符号数字、同一字符重复太多的愿望不会进入愿望池。',
			].join('\n'),
		},
	];
}

function buildGeneralContext(): CheckContext {
	return {
		source: 'src/index.ts',
		content: [
			'case "check": { const { handleCheck } = await import("./commands/check"); return handleCheck; }',
			'case "coin": { const { handleCoin } = await import("./commands/coin"); return handleCoin; }',
			'case "wish": { const { handleWish } = await import("./commands/wish"); return handleWish; }',
			'case "f": case "fish": { const { handleFish } = await import("./commands/fish"); return handleFish; }',
			'case "roll": case "r": case "rd": case "rh": { const { handleRoll } = await import("./commands/roll"); return handleRoll; }',
			'',
			'执行结果：这里只能确认命令会被路由到哪个 TS 处理器；如果没有对应处理器摘录，不能断言内部细节。',
		].join('\n'),
	};
}

function contextsForQuestion(question: string): CheckContext[] {
	const compact = compactQuestion(question);
	const contexts: CheckContext[] = [];

	if (mentionsDailyPray(compact) || compact.includes('coin')) {
		contexts.push(buildCoinPrayContext());
	}
	if (compact.includes('wish') || compact.includes('愿望')) {
		contexts.push(...buildWishContext());
	}
	if (!contexts.length) {
		contexts.push(buildGeneralContext());
	}
	return contexts;
}

function formatContextForPrompt(contexts: CheckContext[]): string {
	return contexts.map(context => [
		`来源：${context.source}`,
		'```ts',
		context.content,
		'```',
	].join('\n')).join('\n\n');
}

function buildCheckSystemPrompt(): string {
	return [
		LILY_CORE_PERSONA,
		'你正在回答 Telegram 群里的 /check 命令。',
		'你会收到用户问题、相关 TS 脚本摘录和少量执行结果，请只根据这些上下文判断当前机器人规则。',
		'如果上下文不足以确认问题，就明确说莉莉现在还不能确认，不要编造。',
		'面向普通群友解释，语气亲切轻松，避免工程术语堆砌。',
		'不要提到 Codex、自动执行器、版本发布、系统提示、API、DeepSeek 或模型。',
		'输出中文纯文本，不要使用 Markdown 或 HTML，长度控制在 2 到 6 句话。',
	].join('\n');
}

function buildCheckUserPrompt(question: string): string {
	return [
		`用户问题：${question}`,
		'',
		'请阅读下面的相关 TS 脚本内容或执行结果，给出判断回复：',
		'',
		formatContextForPrompt(contextsForQuestion(question)),
	].join('\n');
}

function shouldUseAI(question: string): boolean {
	const compact = compactQuestion(question);
	return Boolean(compact) && !isBroadQuestion(compact);
}

function formatAIAnswer(answer: string): string {
	const text = answer.trim().replace(/\n{3,}/g, '\n\n');
	const clipped = text.length > 3200 ? `${text.slice(0, 3200)}...` : text;
	return `莉莉看了一下：\n\n<blockquote expandable>${escapeHtml(clipped)}</blockquote>`;
}

async function answerWithAI(question: string, env: EnvLike): Promise<string | null> {
	if (!shouldUseAI(question) || !hasAIChatProvider(env as Env)) {
		return null;
	}

	try {
		const answer = await callAIChat(env as Env, {
			temperature: 0.2,
			maxTokens: 900,
			timeoutMs: 30000,
			messages: [
				{ role: 'system', content: buildCheckSystemPrompt() },
				{ role: 'user', content: buildCheckUserPrompt(question) },
			],
		});
		return formatAIAnswer(answer);
	} catch (err) {
		console.error('[Check] AI 判断失败，使用本地兜底', err);
		return null;
	}
}

function answerForQuestion(question: string): string {
	const compact = compactQuestion(question);
	if (!compact) {
		return '想查哪条规则呀？请写具体一点，比如：<code>/check 每日签到周年庆 50c 的触发逻辑是什么</code>';
	}
	if (isBroadQuestion(compact)) {
		return '这个问题有点大，莉莉怕答得太散啦。可以带上命令名和关键点来问，比如：<code>/check 每日签到周年庆 50c 的触发逻辑是什么</code>、<code>/check 每日签到怎么判定</code>。';
	}
	if (mentionsAnniversaryReward(compact)) {
		return answerAnniversaryPrayRule();
	}
	if (mentionsDailyPray(compact)) {
		return answerDailyPrayRule();
	}
	if (compact.includes('wish') || compact.includes('愿望')) {
		return answerWishRule();
	}
	return '这条规则莉莉暂时还不能确认。请把命令名和关键点说得更具体一点，例如：<code>/check 每日签到周年庆 50c 的触发逻辑是什么</code>。';
}

export async function handleCheck(parsedMessage: ParsedUpdate, env: EnvLike) {
	const chatId = parsedMessage.chatId ?? parsedMessage.message?.chat?.id;
	if (!chatId) return;

	const question = questionFromArgs(parsedMessage.args);
	const aiAnswer = await answerWithAI(question, env);

	await TgMessage.sendText(env, {
		chat_id: chatId,
		text: aiAnswer ?? answerForQuestion(question),
		parse_mode: 'HTML',
		message_thread_id: parsedMessage.threadId,
	});
}

export default handleCheck;
