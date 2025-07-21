/**
 * 处理 /roll 命令
 * @param text 完整的消息文本
 * @param userName 用户的显示名称
 * @returns 格式化后的回复字符串
 */
export function handleRoll(text: string, userName: string): string {
//  const input = text.replace(/.*\/roll\s*/i, "").trim();
  const input = text.replace(/.*\/r(?:oll)?\s*/i, "").trim();
  console.log("🎲 用户输入骰点参数 =", input || "默认");

  // 空参数，默认 1d100
  if (!input) {
    const point = Math.floor(Math.random() * 100) + 1;
    console.log(`🎯 ${userName} 掷出了 ${point} 点`);
    return `${userName} 掷出了 ${point} 点`;
  }

  // 统一中英文大括号为英文格式
  const normalizedInput = input
    .replace(/[｛]/g, "{")
    .replace(/[｝]/g, "}");

  // 处理元素抽取：n d{A,B,C} 或 {A,B,C}，支持中英文逗号和空格
  const multiDrawMatch = normalizedInput.match(/^(\d+)[dD]\{([^}]+)\}$/);
  if (multiDrawMatch) {
    const count = parseInt(multiDrawMatch[1], 10);
    const options = multiDrawMatch[2].split(/[，,\s]+/).filter(Boolean);
    if (options.length === 0) {
      return `${userName} 的抽取列表不能为空。示例：/roll 3d{红 白 绿}`;
    }
    const picks: string[] = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * options.length);
      picks.push(options[idx]);
    }
    console.log(`📦 ${userName} 抽取结果 =`, picks);
    return `${userName} 抽取了 ${count} 次：\n` + picks.map((p, i) => `#${i + 1}: ${p}`).join("\n");
  }

  const singleDrawMatch = normalizedInput.match(/^\{([^}]+)\}$/);
  if (singleDrawMatch) {
    const options = singleDrawMatch[1].split(/[，,\s]+/).filter(Boolean);
    if (options.length === 0) {
      return `${userName} 的抽取列表不能为空。示例：/roll {红 白 绿}`;
    }
    const idx = Math.floor(Math.random() * options.length);
    const pick = options[idx];
    console.log(`🎯 ${userName} 单次抽取 = ${pick}`);
    return `${userName} 抽取结果：${pick}`;
  }

  // 验证仅允许数字、d、加减号组成的表达式（排除非法字符与包含大括号的表达式）
  if (/[^\d+dD+\-\s]/.test(normalizedInput) || /[{}]/.test(normalizedInput)) {
    return `${userName} 的骰点表达式无效，请使用如 /roll 2d6+1d4+5 的格式`;
  }

  // 正则匹配：例如 2d6、1d4、+3、-5
  const parts = normalizedInput.match(/(\d+d\d+|\d+|[+\-])/gi);
  if (!parts) {
    console.log("⚠️ 无法解析表达式");
    return `${userName} 的骰点格式无效，请使用如 /roll 2d6+1d4+5 的格式`;
  }

  let total = 0;
  let currentSign = 1;
  const rollDetails: string[] = [];

  for (const part of parts) {
    if (part === "+") {
      currentSign = 1;
      continue;
    } else if (part === "-") {
      currentSign = -1;
      continue;
    }

    const diceMatch = part.match(/^(\d+)[dD](\d+)$/);
    if (diceMatch) {
      const count = parseInt(diceMatch[1], 10);
      const sides = parseInt(diceMatch[2], 10);

      if (count > 100 || sides > 1000) {
        return `${userName} 的骰子数或面数超出限制（单组最大 100 颗，最多 1000 面）`;
      }

      const rolls: number[] = [];
      for (let i = 0; i < count; i++) {
        const roll = Math.floor(Math.random() * sides) + 1;
        rolls.push(roll);
      }
      const subtotal = rolls.reduce((a, b) => a + b, 0) * currentSign;
      total += subtotal;
      rollDetails.push(`${currentSign < 0 ? "-" : ""}${count}d${sides} 🎲 [${rolls.join(", ")}]`);
    } else if (/^\d+$/.test(part)) {
      const value = parseInt(part, 10) * currentSign;
      total += value;
      rollDetails.push(`${currentSign < 0 ? "-" : "+"}${Math.abs(value)}`);
    } else {
      console.log("❌ 未识别片段 =", part);
      return `${userName} 的骰点表达式有误，无法识别：${part}`;
    }
  }

  console.log(`📊 ${userName} 的骰子总和 = ${total}`);
  return `${userName} 掷出了：\n${rollDetails.join("\n")}\n📊 总和：${total}`;
}
