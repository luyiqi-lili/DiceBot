// commands/fate.ts
import TgMessage, { ParsedUpdate } from "../lib/tgMessage";
import { MAJOR_ARCANA } from "../lib/liveConfig";

// 从 coin 模块复用 KV 操作函数
import { getBalance, deductFromBalance, addToTreasury } from "./coin";

type Env = {
  TOKEN: string;
  BOT_USERNAME?: string;
  COIN_KV: KVNamespace;
  GOOGLE_API_KEYS?: string[];
};

function escapeHtml(s: string) {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export async function handleFate(parsed: ParsedUpdate, env: Env): Promise<void> {
  console.log("🔮 [handleFate] invoked, parsed.command:", parsed.command, "textPreview:", parsed.textPreview);

  const msg = parsed.message;
  if (!msg) {
    console.log("🔮 [handleFate] parsed.message 缺失，忽略");
    return;
  }

  const text = parsed.text ?? "";
  const replied = parsed.replyToMessage;
  const cap = (replied && (replied as any).caption) ? (replied as any).caption : "";

  console.log("🔍 [handleFate] text =", text);
  console.log("🔍 [handleFate] replied exists =", !!replied);
  console.log("🔍 [handleFate] cap =", cap);

  // 判断是否为解析请求：要求回复包含 昨天/今天/明天 三个关键词
  const isInterpret =
    /^(?:\/fate(?:@\w+)?|@\w+\s*\/fate(?:@\w+)?)/i.test(text) &&
    cap.includes("昨天") &&
    cap.includes("今天") &&
    cap.includes("明天");

  const chatId = parsed.chatId!;
  const threadId = parsed.threadId;
  const fromId = parsed.from?.id;
  const fromName = parsed.from?.first_name || "某人";

  if (isInterpret) {
    // 权限/线程判断（保留你原有的限制）
    const allowed =
      (chatId === -1002848481881 && [66].includes(threadId as number)) ||
      (chatId === -1002742074355 && [345].includes(threadId as number));
    if (!allowed) {
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `✨这里的魔力有些稀薄……要不要回到莉莉熟悉的地方，让占卜的力量更完整地展现呢？...`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }

    // 查询余额并扣费（使用 coin 模块）
    try {
      const coinBal = await getBalance(env.COIN_KV, String(fromId));
      console.log(`💳 [handleFate] ${fromName} 当前余额 ${coinBal} 💰`);
      if (coinBal < 5) {
        await TgMessage.sendText(env, {
          chat_id: chatId,
          text: `❌ ${fromName} 的余额不足，解析一次需要 5 💰，当前余额 ${coinBal} 💰。`,
          parse_mode: "HTML",
          message_thread_id: threadId
        });
        return;
      }

      // 构造 prompt
      const systemInstruction =
        "你是一个精通塔罗牌牌义解析的骰娘名叫莉莉，使用幽默诙谐,使用带有比喻的日式RPG风格的口气，自然的输出内容，绝对不要使用Markdown格式，不要假定用户的性别，使用更加中性的用户称谓。";
      const userPrompt = `下面是一组 ${fromName} 抽取的三张大阿卡那塔罗牌及位置：\n${cap}\n请首先分别对"昨天"、"今天"、"明天"位置上的塔罗牌含义进行基本解读，然后综合三张卡片给出一个包括[占卜结果、建议、谶语、未来趋势及注意事项]的解析。绝对不要使用Markdown格式。`;

      const payload = {
        contents: [{ parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: { thinkingConfig: { thinkingBudget: -1 } }
      };

      const apiKeys: string[] = (env.GOOGLE_API_KEYS as any) || [];
      if (!apiKeys.length) {
        console.warn("🔮 [handleFate] 未配置 GOOGLE_API_KEYS，跳过解析请求");
        await TgMessage.sendText(env, {
          chat_id: chatId,
          text: `❌ 抱歉，当前无法进行牌义解析（缺少 API Key）。`,
          parse_mode: "HTML",
          message_thread_id: threadId
        });
        return;
      }
      const randomKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];

      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": randomKey
        },
        body: JSON.stringify(payload)
      });

      const j = await res.json();
      console.log("🔮 [handleFate] Google API response:", j);
      const candidates = j?.candidates;
      const textOut = candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      // 仅在解析成功时扣费并把钱转入国库（使用 coin 模块）
      if (textOut) {
        // 先从用户账户扣款（确保原子性尽量靠序列化操作）
        const deducted = await deductFromBalance(env.COIN_KV, String(fromId), 5);
        if (!deducted) {
          console.warn("🔮 [handleFate] 扣款失败（可能并发或余额不足）");
          await TgMessage.sendText(env, {
            chat_id: chatId,
            text: `❌ 扣费失败（余额不足或系统错误），解析未执行，请稍后重试。`,
            parse_mode: "HTML",
            message_thread_id: threadId
          });
          return;
        }

        // 将这笔钱加入国库（艾丽莎宝库）
        try {
          await addToTreasury(env.COIN_KV, 5);
        } catch (e) {
          console.error("🔮 [handleFate] 将扣款加入国库失败，尝试回滚（注意：KV回滚非事务性，仅记录）", e);
          // 回滚尝试：返还用户（若返还失败则记录错误）
          try {
            await addToTreasury(env.COIN_KV, -5); // 试图抵消（若 addToTreasury 支持负数则不适合） — 保守做法：直接返还用户余额
            // 更安全地：给用户返还
            const cur = await getBalance(env.COIN_KV, String(fromId));
            await env.COIN_KV.put(String(fromId), String(cur + 5));
          } catch (err) {
            console.error("🔮 [handleFate] 回滚也失败，请人工干预", err);
          }
        }

        // 获取新余额用于提示
        const newBal = await getBalance(env.COIN_KV, String(fromId));
        console.log(`💰 [handleFate] 从 ${fromName} 扣除 5 💰，新余额 ${newBal}`);

        const cardList = cap
          .split("\n")
          .map((line: string) => line.split("：")[1])
          .filter(Boolean)
          .join("、");

        const resultText = textOut || "解析失败，请稍后重试。";
        const replyText =
          `${fromName} 消耗了 5 💰（新余额 ${newBal}），请骰娘为三张牌 ${cardList} 进行解析，解析如下： <blockquote expandable>` +
          resultText +
          `</blockquote>`;

        await TgMessage.sendText(env, {
          chat_id: chatId,
          text: replyText,
          parse_mode: "HTML",
          message_thread_id: threadId
        });
        return;
      } else {
        console.warn("🔮 [handleFate] 解析未返回内容", j);
      }
    } catch (err) {
      console.error("🔮 [handleFate] 解析分支异常", err);
      await TgMessage.sendText(env, {
        chat_id: chatId,
        text: `❌ 解析失败，请稍后重试。`,
        parse_mode: "HTML",
        message_thread_id: threadId
      });
      return;
    }
  }

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
