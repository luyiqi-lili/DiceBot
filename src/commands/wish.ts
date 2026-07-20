import type { Env } from '../index';
import TgMessage, { type ParsedUpdate } from '../lib/telegram';
import { submitFeatureRequestAsIssue } from '../lib/githubIssueIntake';
import { escapeHtml } from '../lib/util';

export async function handleWish(parsedMessage: ParsedUpdate, env: Env): Promise<void> {
	const chatId = parsedMessage.chatId ?? parsedMessage.message?.chat?.id;
	const userId = parsedMessage.from?.id ?? parsedMessage.message?.from?.id;
	if (!chatId || !userId) return;
	const body = (parsedMessage.args ?? []).join(' ').trim();
	let result;
	try {
		result = await submitFeatureRequestAsIssue(env, { body, chatId, userId });
	} catch (error) {
		console.error('[wish] issue intake failed', { error: error instanceof Error ? error.message.slice(0, 200) : 'unknown' });
		result = { status: 'error' as const, reason: 'Issue intake failed' };
	}

	let text: string;
	if (result.status === 'created') {
		text = `✅ 已创建公开源码需求 <a href="${escapeHtml(result.url)}">#${result.number}</a>。维护者确认并添加 <code>bot:ready</code> 后，机器人会把它纳入自主改进候选。`;
	} else if (result.status === 'duplicate') {
		text = `ℹ️ 相同需求近期已经提交：<a href="${escapeHtml(result.url)}">#${result.number}</a>。`;
	} else if (result.retryAfterSeconds) {
		text = `⏳ 提交太频繁，请约 ${Math.ceil(result.retryAfterSeconds / 60)} 分钟后再试。`;
	} else if (result.reason.includes('too short')) {
		text = '愿望需要写得更具体一些，例如：<code>/wish 增加一个可按群组关闭的每日签到功能</code>（8–2000 字）。';
	} else if (result.status === 'skipped') {
		text = '⚠️ 源码需求入口当前未启用，请稍后再试。';
	} else {
		text = '⚠️ 创建 GitHub Issue 失败，需求没有被记录，请稍后重试。';
	}

	await TgMessage.sendText(env, {
		chat_id: chatId,
		text,
		parse_mode: 'HTML',
		message_thread_id: parsedMessage.threadId,
		disable_web_page_preview: true,
	});
}

export default handleWish;
