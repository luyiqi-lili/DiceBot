/**
 * @file commands/fate.ts
 * @description 塔罗占卜命令处理器（/fate）。
 *   从大阿尔卡纳中随机抽取 3 张牌，对应昨天/今天/明天。（AI 牌义解读功能已下线。）
 */

import TgMessage, { ParsedUpdate } from '../lib/telegram';
import { MAJOR_ARCANA } from "../lib/liveConfig";

import type { Env } from '../index';


export async function handleFate(parsed: ParsedUpdate, env: Env): Promise<void> {
    console.log("🔮 [handleFate] invoked, parsed.command:", parsed.command, "textPreview:", parsed.textPreview);

    const msg = parsed.message;
    if (!msg) {
        console.log("🔮 [handleFate] parsed.message 缺失，忽略");
        return;
    }

    const chatId = parsed.chatId!;
    const threadId = parsed.threadId;

    // --- 抽牌流程 ---
    console.log("🎴 [handleFate] 执行抽牌流程");
    const pickCount = 3;
    const indices: number[] = [];
    while (indices.length < pickCount) {
        const idx = Math.floor(Math.random() * MAJOR_ARCANA.length);
        if (!indices.includes(idx)) {
            indices.push(idx);
            console.log(`🎲 [handleFate] 选中牌索引: ${idx} (${MAJOR_ARCANA[idx].name})`);
        }
    }

    const positions = ["昨天", "今天", "明天"];
    const order = [1, 0, 2]; // 发送顺序为：今天、昨天、明天

    const media = order.map((posIdx, j) => {
        const card = MAJOR_ARCANA[indices[posIdx]];
        const entry: any = { type: "photo", media: card.file };
        if (j === 0) {
            const captionText = positions.map((pos, k) => `${pos}：${MAJOR_ARCANA[indices[k]].name}`).join("\n");
            entry.caption = captionText;
            entry.parse_mode = "HTML";
        }
        return entry;
    });

    try {
        await TgMessage.sendMediaGroup(env, {
            chat_id: chatId,
            media,
            message_thread_id: threadId
        });
    } catch (e) {
        console.error("🎴 [handleFate] 发送媒体组失败", e);
        // 若 sendMediaGroup 失败，可选择回退为逐张发送，这里保留日志并结束
    }
}
