import TgMessage, { EnvLike, ParsedUpdate } from '../lib/telegram';
import {
	ERRONEOUS_PRAY_REWARD_AMOUNT,
	ERRONEOUS_PRAY_REWARD_FIX_DATE,
	VIOLET_ANNIVERSARY_PRAY_DATES,
	VIOLET_ANNIVERSARY_PRAY_REWARD,
} from './coin';

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

	await TgMessage.sendText(env, {
		chat_id: chatId,
		text: answerForQuestion(questionFromArgs(parsedMessage.args)),
		parse_mode: 'HTML',
		message_thread_id: parsedMessage.threadId,
	});
}

export default handleCheck;
