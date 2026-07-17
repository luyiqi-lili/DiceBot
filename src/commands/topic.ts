/**
 * @file commands/topic.ts
 * @description /topic 命令 — 群主配置「仅特定主题可用」的功能（/coin pray、/fate、/f）在本群的可用主题。
 *   用法（改配置需群主，且需在目标主题内执行）：
 *     /topic allow <功能名>      允许该功能在“当前主题”使用
 *     /topic disallow <功能名>   取消当前主题的使用许可
 *     /topic anywhere <功能名>   允许在本群所有主题使用
 *     /topic reset <功能名>      清除本群配置，恢复默认
 *   只读（所有人可用）：
 *     /topic list [功能名]       查看本群生效的主题配置
 *     /topic features            列出可配置的功能名
 *     /topic help                查看用法
 */

import TgMessage, { ParsedUpdate } from '../lib/telegram';
import type { Env } from '../index';
import { escapeHtml } from '../lib/util';
import { isChatOwner } from '../lib/permissions';
import { getKnownTopicRoomName } from '../data/topics';
import {
	TOPIC_FEATURES,
	TOPIC_FEATURE_KEYS,
	isTopicFeature,
	getFeatureConfig,
	allowTopic,
	disallowTopic,
	setAnywhere,
	resetFeature,
	type TopicFeature,
} from '../lib/topicAccess';

function featuresText(): string {
	const lines = TOPIC_FEATURE_KEYS.map(k => `• <code>${k}</code> — ${TOPIC_FEATURES[k].label}`);
	return `🧩 可配置的功能：\n${lines.join('\n')}`;
}

function usageText(): string {
	return [
		'📖 <b>/topic 主题可用范围</b>',
		'',
		'改配置（仅群主，需在目标主题内执行）：',
		'• <code>/topic allow &lt;功能名&gt;</code> — 允许该功能在“当前主题”使用',
		'• <code>/topic disallow &lt;功能名&gt;</code> — 取消当前主题的许可',
		'• <code>/topic anywhere &lt;功能名&gt;</code> — 允许在本群所有主题使用',
		'• <code>/topic reset &lt;功能名&gt;</code> — 清除本群配置，恢复默认',
		'',
		'查看（所有人可用）：',
		'• <code>/topic list [功能名]</code> — 查看本群生效配置',
		'• <code>/topic features</code> — 列出可配置的功能名',
		'',
		featuresText(),
	].join('\n');
}

function topicLabel(chatId: number, threadId: number): string {
	const name = getKnownTopicRoomName(chatId, threadId);
	const idText = threadId === 0 ? 'General' : String(threadId);
	return name ? `${escapeHtml(name)}（${idText}）` : idText;
}

function describeConfig(chatId: number, feature: TopicFeature): (v: Awaited<ReturnType<typeof getFeatureConfig>>) => string {
	return v => {
		const label = TOPIC_FEATURES[feature].label;
		const tag = v.source === 'config' ? '已配置' : v.source === 'default' ? '默认' : '未配置';
		if (v.anywhere) return `• <b>${escapeHtml(label)}</b>（${tag}）：所有主题可用`;
		const topics = v.topics.map(t => topicLabel(chatId, t)).join('、');
		return `• <b>${escapeHtml(label)}</b>（${tag}）：仅限 ${topics || '（无）'}`;
	};
}

export async function handleTopic(parsedMessage: ParsedUpdate, env: Env): Promise<void> {
	const chatId = parsedMessage.chatId ?? parsedMessage.message?.chat?.id;
	const threadId =
		parsedMessage.threadId ??
		parsedMessage.message?.message_thread_id ??
		parsedMessage.message?.reply_to_message?.message_thread_id ??
		undefined;
	const from = parsedMessage.from ?? parsedMessage.message?.from;
	if (!chatId || !from) {
		console.error('[topic] 找不到 chatId 或 from，跳过');
		return;
	}

	const args = Array.isArray(parsedMessage.args) ? parsedMessage.args.slice() : [];
	const action = (args[0] || '').toLowerCase();

	const reply = (text: string) =>
		TgMessage.sendText(env, { chat_id: chatId, text, parse_mode: 'HTML', message_thread_id: threadId });

	// 只读子命令，对所有人开放
	if (!action || action === 'help') {
		await reply(usageText());
		return;
	}
	if (action === 'features') {
		await reply(featuresText());
		return;
	}
	if (action === 'list') {
		const keyArg = (args[1] || '').toLowerCase();
		const keys: TopicFeature[] = keyArg ? (isTopicFeature(keyArg) ? [keyArg] : []) : [...TOPIC_FEATURE_KEYS];
		if (!keys.length) {
			await reply(`❌ 未知功能名：<code>${escapeHtml(keyArg)}</code>\n\n${featuresText()}`);
			return;
		}
		const render = (k: TopicFeature) => describeConfig(chatId, k);
		const lines: string[] = [];
		for (const k of keys) lines.push(render(k)(await getFeatureConfig(env, chatId, k)));
		await reply(`📋 本群主题可用配置：\n${lines.join('\n')}`);
		return;
	}

	if (action !== 'allow' && action !== 'disallow' && action !== 'anywhere' && action !== 'reset') {
		await reply(`❓ 未知子命令：<code>${escapeHtml(action)}</code>\n\n${usageText()}`);
		return;
	}

	// 改配置仅群主
	if (!(await isChatOwner(env, chatId, Number(from.id)))) {
		await reply('❌ 只有群主可以配置主题可用范围。');
		return;
	}
	if (!env.DB) {
		await reply('⚠️ 主题配置需要 D1 数据库支持，当前环境未配置。');
		return;
	}

	const keyArg = (args[1] || '').toLowerCase();
	if (!keyArg) {
		await reply(`❌ 请指定功能名。\n\n${featuresText()}`);
		return;
	}
	if (!isTopicFeature(keyArg)) {
		await reply(`❌ 未知功能名：<code>${escapeHtml(keyArg)}</code>\n\n${featuresText()}`);
		return;
	}
	const feature = keyArg;
	const curThread = threadId ?? 0;
	const label = TOPIC_FEATURES[feature].label;

	switch (action) {
		case 'allow':
			await allowTopic(env, chatId, feature, curThread);
			await reply(`✅ 已允许 <b>${escapeHtml(label)}</b> 在本主题使用：${topicLabel(chatId, curThread)}。`);
			return;
		case 'disallow':
			await disallowTopic(env, chatId, feature, curThread);
			await reply(`✅ 已取消 <b>${escapeHtml(label)}</b> 在本主题的许可：${topicLabel(chatId, curThread)}。`);
			return;
		case 'anywhere':
			await setAnywhere(env, chatId, feature);
			await reply(`✅ 已允许 <b>${escapeHtml(label)}</b> 在本群<b>所有主题</b>使用。`);
			return;
		case 'reset':
			await resetFeature(env, chatId, feature);
			await reply(`✅ 已清除 <b>${escapeHtml(label)}</b> 的本群配置，恢复默认。`);
			return;
	}
}
