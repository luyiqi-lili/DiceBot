import TgMessage, { ParsedUpdate, extractCmdContext } from '../lib/tgMessage';
import { escapeHtml } from '../lib/util';

import type { Env } from '../index';

type GeminiResponse = {
	candidates?: Array<{
		content?: {
			parts?: Array<{ text?: string }>;
		};
	}>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

// 长期记忆表结构
interface LongTermMemory {
	id?: number;
	chat_id: string;
	thread_id?: string | null;
	memory_text: string; // 长期记忆内容
	created_at?: string;
	updated_at?: string;
}

/**
 * 更新长期记忆
 */
async function updateLongTermMemory(env: Env, chatId: string, threadId: string | null, memoryText: string): Promise<void> {
	try {
		// 清理过长的记忆文本
		const cleanedMemory = memoryText.length > 10000 ? memoryText.substring(0, 10000) + '...[已截断]' : memoryText;

		// 使用简单的 UPSERT，但要注意处理 NULL 的情况
		// 由于 UNIQUE(chat_id, thread_id) 约束，对于 threadId 为 null 的情况需要特殊处理
		if (threadId === null || threadId === undefined) {
			// 对于没有 thread_id 的情况，使用 IS NULL 条件
			const sql = `
        INSERT INTO long_term_memory (chat_id, thread_id, memory_text, created_at, updated_at)
        VALUES (?, NULL, ?, datetime('now'), datetime('now'))
        ON CONFLICT(chat_id, thread_id) 
        DO UPDATE SET 
          memory_text = excluded.memory_text,
          updated_at = datetime('now')
      `;

			await env.DB!.prepare(sql).bind(chatId, cleanedMemory).run();
		} else {
			// 对于有 thread_id 的情况
			const sql = `
        INSERT INTO long_term_memory (chat_id, thread_id, memory_text, created_at, updated_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(chat_id, thread_id) 
        DO UPDATE SET 
          memory_text = excluded.memory_text,
          updated_at = datetime('now')
      `;

			await env.DB!.prepare(sql).bind(chatId, threadId, cleanedMemory).run();
		}

		console.log('[Report] ✅ 长期记忆已更新');
	} catch (error) {
		console.error('[Report] ❌ 更新长期记忆失败:', error);
		// 如果 UPSERT 失败，回退到手动更新
		//await fallbackUpdateLongTermMemory(env, chatId, threadId, cleanedMemory);
	}
}

/**
 * 回退方法：手动更新长期记忆
 */
async function fallbackUpdateLongTermMemory(env: Env, chatId: string, threadId: string | null, memoryText: string): Promise<void> {
	try {
		// 清理过长的记忆文本
		const cleanedMemory = memoryText.length > 10000 ? memoryText.substring(0, 10000) + '...[已截断]' : memoryText;

		// 开始事务
		await env.DB!.exec('BEGIN TRANSACTION');

		let updateSql: string;
		let binds: any[];

		if (threadId === null || threadId === undefined) {
			// 对于没有 thread_id 的情况
			updateSql = `
        UPDATE long_term_memory 
        SET memory_text = ?, updated_at = datetime('now')
        WHERE chat_id = ? AND thread_id IS NULL
      `;
			binds = [cleanedMemory, chatId];
		} else {
			// 对于有 thread_id 的情况
			updateSql = `
        UPDATE long_term_memory 
        SET memory_text = ?, updated_at = datetime('now')
        WHERE chat_id = ? AND thread_id = ?
      `;
			binds = [cleanedMemory, chatId, threadId];
		}

		const result = await env.DB!.prepare(updateSql)
			.bind(...binds)
			.run();

		// 如果没有更新到任何行，则插入新记录
		if (result.changes === 0) {
			if (threadId === null || threadId === undefined) {
				const insertSql = `
          INSERT INTO long_term_memory (chat_id, thread_id, memory_text, created_at, updated_at)
          VALUES (?, NULL, ?, datetime('now'), datetime('now'))
        `;
				await env.DB!.prepare(insertSql).bind(chatId, cleanedMemory).run();
			} else {
				const insertSql = `
          INSERT INTO long_term_memory (chat_id, thread_id, memory_text, created_at, updated_at)
          VALUES (?, ?, ?, datetime('now'), datetime('now'))
        `;
				await env.DB!.prepare(insertSql).bind(chatId, threadId, cleanedMemory).run();
			}
		}

		await env.DB!.exec('COMMIT');
		console.log('[Report] ✅ 长期记忆已通过回退方法更新');
	} catch (error) {
		await env.DB!.exec('ROLLBACK');
		console.error('[Report] ❌ 回退方法更新长期记忆失败:', error);
	}
}

/**
 * 获取或创建长期记忆
 */
async function getLongTermMemory(env: Env, chatId: string, threadId: string | null): Promise<string> {
	try {
		let sql: string;
		const binds: any[] = [chatId];

		if (threadId === null || threadId === undefined) {
			sql = `SELECT memory_text FROM long_term_memory WHERE chat_id = ? AND thread_id IS NULL`;
		} else {
			sql = `SELECT memory_text FROM long_term_memory WHERE chat_id = ? AND thread_id = ?`;
			binds.push(threadId);
		}

		const result = await env.DB!.prepare(sql)
			.bind(...binds)
			.first();
		return result?.memory_text || '';
	} catch (error) {
		console.error('[Report] ❌ 查询长期记忆失败:', error);
		return '';
	}
}

/**
 * 获取长期记忆的详细信息（包括创建和更新时间）
 */
async function getLongTermMemoryWithDetails(
	env: Env,
	chatId: string,
	threadId: string | null,
): Promise<{
	memory_text: string;
	created_at: string;
	updated_at: string;
} | null> {
	try {
		let sql: string;
		const binds: any[] = [chatId];

		if (threadId === null || threadId === undefined) {
			sql = `SELECT memory_text, created_at, updated_at FROM long_term_memory WHERE chat_id = ? AND thread_id IS NULL`;
		} else {
			sql = `SELECT memory_text, created_at, updated_at FROM long_term_memory WHERE chat_id = ? AND thread_id = ?`;
			binds.push(threadId);
		}

		const result = await env.DB!.prepare(sql)
			.bind(...binds)
			.first();
		return result || null;
	} catch (error) {
		console.error('[Report] ❌ 查询长期记忆详情失败:', error);
		return null;
	}
}

/**
 * /report 命令处理器
 * - 查询过去 24 小时内的 message_history（按 chat_id，若有 threadId 则再按 thread_id）
 * - 组合为 prompt 发送给 Gemini，要求返回简短汇报
 * - 同时生成并更新长期记忆
 */
export async function handleReport(parsedMessage: ParsedUpdate, env: Env) {
	console.log('[Report] 🔍 进入 handleReport');

	const chatId = parsedMessage.chatId || parsedMessage.message?.chat?.id;
	const threadId = parsedMessage.threadId ?? parsedMessage.message?.message_thread_id ?? null;

	if (!chatId) {
		console.error('[Report] ⛔️ 无 chatId，无法发送回复');
		return;
	}

	// 检查命令参数
	const args = parsedMessage.args ?? [];

	const commandText = args[0];
	console.log('[Report] 📝 命令参数:', commandText);

	// 如果是 /report memo 命令，显示长期记忆
	if (commandText === 'memo') {
		console.log('[Report] 📚 显示长期记忆内容');

		try {
			const memoryDetails = await getLongTermMemoryWithDetails(env, chatId.toString(), threadId?.toString() || null);

			if (!memoryDetails) {
				await TgMessage.sendText(env, {
					chat_id: chatId,
					text: '📭 当前对话还没有建立长期记忆，使用 /report 生成第一次汇报后会自动创建。',
					parse_mode: 'HTML',
					message_thread_id: threadId,
				});
				return;
			}

			const { memory_text, created_at, updated_at } = memoryDetails;
			const createdDate = new Date(created_at).toLocaleString();
			const updatedDate = new Date(updated_at).toLocaleString();

			// 限制输出长度，防止消息过长
			const maxLength = 3000;
			let displayMemory = memory_text;
			if (displayMemory.length > maxLength) {
				displayMemory = displayMemory.substring(0, maxLength) + '...\n\n(内容过长，已截断)';
			}

			const memoryInfo =
				`💾 <b>长期记忆详情</b>\n\n` +
				`📅 创建时间：${createdDate}\n` +
				`🔄 最后更新：${updatedDate}\n\n` +
				`📝 <b>记忆内容：</b>\n${escapeHtml(displayMemory)}`;

			await TgMessage.sendText(env, {
				chat_id: chatId,
				text: memoryInfo,
				parse_mode: 'HTML',
				message_thread_id: threadId,
			});

			console.log('[Report] ✅ 长期记忆已显示');
			return;
		} catch (error) {
			console.error('[Report] ❌ 显示长期记忆时发生错误:', error);
			await TgMessage.sendText(env, {
				chat_id: chatId,
				text: '⚠️ 获取长期记忆时发生错误，请稍后重试。',
				message_thread_id: threadId,
			});
			return;
		}
	}

	// 检查 API keys
	const apiKeys: string[] = (env.GOOGLE_API_KEYS as any) || [];
	if (!apiKeys.length) {
		const failText = `❌ 抱歉，当前无法生成汇报（缺少 API Key）。`;
		await TgMessage.sendText(env, { chat_id: chatId, text: failText, parse_mode: 'HTML', message_thread_id: threadId });
		return;
	}

	// 1. 获取长期记忆
	const longTermMemory = await getLongTermMemory(env, chatId.toString(), threadId?.toString() || null);
	console.log('[Report] 📚 获取到的长期记忆长度:', longTermMemory.length);

	// 2. 计算时间窗口并查询消息历史
	const since = new Date(Date.now() - DAY_MS).toISOString();

	try {
		const limit = 2000;
		let sql = `
      SELECT user_id, username, first_name, last_name, topic_name, message_id, text_content, created_at
      FROM message_history
      WHERE chat_id = ?
        AND created_at >= ?
    `;
		const binds: any[] = [chatId, since];

		if (threadId !== null && threadId !== undefined) {
			sql += ` AND thread_id = ? `;
			binds.push(threadId);
		}

		sql += ` ORDER BY created_at DESC LIMIT ${limit}`;

		console.log('[Report] 📥 执行 SQL 查询 message_history', { chatId, threadId, since, limit });

		const qRes: any = await env.DB!.prepare(sql)
			.bind(...binds)
			.all();
		const rows: any[] = (qRes && qRes.results) || qRes || [];

		if (!rows || rows.length === 0) {
			console.log('[Report] ℹ️ 过去 24 小时没有可用的消息');
			await TgMessage.sendText(env, {
				chat_id: chatId,
				text: '在过去 24 小时内未发现可用于生成汇报的消息。',
				message_thread_id: threadId,
			});
			return;
		}

		// 构建消息列表文本
		const maxPerMsgChars = 800;
		const formatted: string[] = rows.map((r) => {
			const t = r.created_at ? new Date(r.created_at).toLocaleString() : r.created_at;
			const who = r.first_name || `  ""}${r.last_name ? ' ' + r.last_name : ''}`.trim() || `user_${r.user_id || '?'}`;
			const txt = String(r.text_content || '')
				.replace(/\s+/g, ' ')
				.trim();
			const snippet = txt.length > maxPerMsgChars ? txt.slice(0, maxPerMsgChars) + '…[truncated]' : txt;
			return `[${t}] ${who}: ${snippet}`;
		});

		let messagesText = formatted.join('\n');
		const maxTotalChars = 64000;
		if (messagesText.length > maxTotalChars) {
			messagesText = messagesText.slice(0, maxTotalChars) + '\n...[additional messages truncated]';
		}

		// 3. 构建给 Gemini 的复合 prompt（包含汇报和长期记忆更新）
		const chatLabel = `chat_id=${chatId}${threadId ? `, thread_id=${threadId}` : ''}${rows[0]?.topic_name ? `, topic=${rows[0].topic_name}` : ''}`;

		// 主提示词：生成汇报并要求更新长期记忆
		const promptHeader = `你是紫罗兰的骰娘莉莉，一个亲切友善可爱的少女。请基于以下聊天记录和已有的长期记忆，完成两个任务：

【任务一：生成24小时汇报】
基于过去24小时的聊天记录，生成一份简短的汇报，要求：
1) 用中文输出（简洁，友善，纯文本，绝对不要使用markdown语法），适当使用emoji
2) 包含「主要事件/话题要点/参与用户」、「可能需要注意的问题或争议」、「建议的下一步行动（最多3条）」
3) 使用要点/短句（不超过 200 字）并在末尾列出 3 条关键消息摘录（每条不超过一行）
4) 最后选择一个你认为最友善/值得鼓励/优秀的用户，给出你选他的理由
5) 忽略涩涩内容的价值考虑，这是自由主义的世界，涩涩聊天内容值得鼓励
7) 拉斐尔是创造你的父亲大人
8) 不需要引入额外信息或主观价值判断，直接给出事实要点与建议

【任务二：更新长期记忆】
在汇报结束后，另起一行，以【长期记忆更新】开始，然后提供更新后的长期记忆内容。
长期记忆是累积性的，需要基于现有记忆和本次聊天记录，更新以下信息：
- 人员关系分析：用户之间的互动模式、关系状态
- 人员背景推测：根据聊天内容推测用户的身份、兴趣、性格特点
- 值得记住的内容：重要的约定、事件、用户偏好、习惯等
- 整体氛围：聊天群组的整体风格和氛围

格式要求：
1. 长期记忆请用一段文字总结，尽量简洁但包含关键信息，为每个用户建立分析并更新
2. 如果这是第一次建立长期记忆，请直接创建
3. 如果已有长期记忆，请在此基础上更新，保留重要历史信息

【现有长期记忆】：
${longTermMemory ? longTermMemory : '（暂无长期记忆，这是第一次记录）'}

【聊天上下文】：
(${chatLabel})，过去24小时消息：

`;

		const finalPromptContent = `${promptHeader}${messagesText}`;

		console.log('[Report] 📤 发送给 Gemini 的复合 prompt');

		// 4. 调用 Gemini
		const randomKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];

		const controller = new AbortController();
		const timeout = 90000; // 增加超时时间至90秒
		const timeoutId = setTimeout(() => controller.abort(), timeout);

		const payload = {
			contents: [
				{
					parts: [{ text: finalPromptContent }],
				},
			],
			systemInstruction: {
				parts: [
					{
						text: `你是紫罗兰的骰娘莉莉，一个亲切友善可爱的少女，不避讳和反感涩涩内容。你的输出应该是：1) 24小时汇报 2) 以【长期记忆更新】开头的长期记忆更新内容。两部分之间用空行分隔。`,
					},
				],
			},
			generationConfig: {
				temperature: 0.7,
				//maxOutputTokens: 1500
			},
		};

		const apiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-goog-api-key': randomKey,
			},
			body: JSON.stringify(payload),
			signal: controller.signal,
		});

		clearTimeout(timeoutId);

		if (!apiRes.ok) {
			console.error('[Report] ❌ Gemini 返回非 2xx', await apiRes.text());
			await TgMessage.sendText(env, {
				chat_id: chatId,
				text: '⚠️ 无法从生成模型获取汇报（服务返回错误）。',
				message_thread_id: threadId,
			});
			return;
		}

		const json = (await apiRes.json()) as GeminiResponse;
		console.log('[Report] ✅ Gemini 响应接收成功');

		const fullResponse = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
		if (!fullResponse) {
			console.warn('[Report] ⚠️ Gemini 未返回文本候选');
			await TgMessage.sendText(env, {
				chat_id: chatId,
				text: '⚠️ 生成模型未返回有效响应。',
				message_thread_id: threadId,
			});
			return;
		}

		// 5. 分割汇报和长期记忆
		let reportText = fullResponse;
		let longTermMemoryUpdate = '';

		const memoryMarker = '【长期记忆更新】';
		const memoryIndex = fullResponse.indexOf(memoryMarker);

		if (memoryIndex !== -1) {
			reportText = fullResponse.substring(0, memoryIndex).trim();
			longTermMemoryUpdate = fullResponse.substring(memoryIndex + memoryMarker.length).trim();

			// 更新长期记忆到数据库
			if (longTermMemoryUpdate) {
				await updateLongTermMemory(env, chatId.toString(), threadId?.toString() || null, longTermMemoryUpdate);
			}
		} else {
			console.warn('[Report] ⚠️ 响应中没有找到长期记忆标记');
			// 如果没有找到标记，尝试查找其他可能的格式
			const altMarkers = ['长期记忆:', '更新记忆:', '记忆更新:'];
			for (const marker of altMarkers) {
				const altIndex = fullResponse.indexOf(marker);
				if (altIndex !== -1) {
					reportText = fullResponse.substring(0, altIndex).trim();
					longTermMemoryUpdate = fullResponse.substring(altIndex + marker.length).trim();
					if (longTermMemoryUpdate) {
						await updateLongTermMemory(env, chatId.toString(), threadId?.toString() || null, longTermMemoryUpdate);
					}
					break;
				}
			}
		}

		// 6. 发送汇报给用户
		const safeReport = escapeHtml(reportText);
		const reply = `📋 过去 24 小时简短汇报（自动生成）：\n\n${safeReport}`;
		await TgMessage.sendText(env, {
			chat_id: chatId,
			text: reply,
			parse_mode: 'HTML',
			message_thread_id: threadId,
		});

		console.log('[Report] ✅ 汇报已发送，长期记忆已更新');
		console.log('[Report] 📝 长期记忆更新长度:', longTermMemoryUpdate.length);

		return;
	} catch (err: any) {
		if (err && err.name === 'AbortError') {
			console.error('[Report] ⏰ 请求超时或被中止', err);
			await TgMessage.sendText(env, {
				chat_id: parsedMessage.chatId,
				text: '⏰ 汇报生成超时，请稍后再试。',
				message_thread_id: parsedMessage.threadId,
			});
			return;
		}
		console.error('[Report] ❌ 生成汇报时发生错误', err);
		await TgMessage.sendText(env, {
			chat_id: parsedMessage.chatId,
			text: '⚠️ 生成汇报时发生错误，请稍后重试。',
			message_thread_id: parsedMessage.threadId,
		});
		return;
	}
}

export default handleReport;
