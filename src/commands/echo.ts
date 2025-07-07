import { attitudeResponses } from "./attitudeResponses";

// 黑名单用户名列表
const blacklist = [
  "example",
  // 在此添加更多用户名
];

// 特殊通配符模式列表及固定回应（使用 '*' 表示任意字符）
const specialPatterns = [
  "*骰娘*",
  "*莉莉*",
  // 在此添加更多通配符模式
];
const specialResponse = "...";

// Echo 命令响应构建函数
export function handleEcho(text: string, userName: string): string {
  // 黑名单检查
  if (blacklist.includes(userName)) {
    return "骰娘说爸爸不让我和傻子玩";
  }

  const content = text.replace(/.*\/echo\s*/i, "").trim() || "(没有内容)";

  // 通配符模式检查
  for (const pattern of specialPatterns) {
    // 将通配符 '*' 转换为正则 '.*'
    const regex = new RegExp(pattern.replace(/\*/g, ".*"));
    if (regex.test(content)) {
      return specialResponse;
    }
  }

  // 模拟掷骰子，结果为 1~6
  const diceRoll = Math.floor(Math.random() * 6) + 1;

  // 根据骰子点数判断态度
  let chosenAttitude = "";
  if (diceRoll === 1) chosenAttitude = "非常不同意";
  else if (diceRoll === 2) chosenAttitude = "不同意";
  else if (diceRoll === 3 || diceRoll === 4) chosenAttitude = "一般";
  else if (diceRoll === 5) chosenAttitude = "同意";
  else chosenAttitude = "非常同意";

  // 获取对应的回应
  const responses = attitudeResponses[chosenAttitude];
  const chosenResponse = responses[Math.floor(Math.random() * responses.length)];

  console.log("🗣 用户名 =", userName);
  console.log("🎲 掷骰结果 =", diceRoll);
  console.log("📢 Echo 内容 =", content);
  console.log("🎭 态度 =", chosenAttitude);
  console.log("🎯 表述 =", chosenResponse);

  return `${userName} 说：${content}\n🎲 骰娘扔出了一个 ${diceRoll}，因此她认为：${chosenAttitude}：${chosenResponse}`;
}
