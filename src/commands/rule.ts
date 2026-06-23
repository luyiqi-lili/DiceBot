import TgMessage, { ParsedUpdate, EnvLike } from '../lib/telegram';

// 规则类型定义
export interface GroupRule {
  id: number;
  chat_id: string;
  rule_type: string;
  rule_name: string;
  rule_value: string;
  display_name: string;
  is_base_attribute: number;
  order_index: number;
  created_at: string;
}

// D1 查询结果行类型
interface RuleRow {
  rule_type: string;
  rule_name: string;
  rule_value: string;
  display_name: string;
  is_base_attribute: number;
}

// 命令参数接口
interface RuleCommandArgs {
  subcommand: 'init' | 'set' | 'list' | 'delete';
  type?: string;
  name?: string;
  value?: string;
  displayName?: string;
  isBaseAttribute?: boolean;
}

/**
 * 解析规则命令参数
 */
function parseRuleCommand(text: string): RuleCommandArgs | null {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) return null;
  
  const subcommand = parts[1] as 'init' | 'set' | 'list' | 'delete';
  
  switch (subcommand) {
    case 'init':
      return { subcommand };
      
    case 'set':
      if (parts.length < 5) return null;
      const type = parts[2];
      const name = parts[3];
      const value = parts.slice(4).join(' ');
      let displayName = name;
      let isBaseAttribute = false;
      
      for (let i = 4; i < parts.length; i++) {
        if (parts[i].startsWith('display_name:')) {
          displayName = parts[i].substring(13);
        } else if (parts[i] === 'base:true') {
          isBaseAttribute = true;
        }
      }
      
      return {
        subcommand,
        type,
        name,
        value,
        displayName,
        isBaseAttribute
      };
      
    case 'list':
      const typeFilter = parts.length > 2 ? parts[2] : undefined;
      return {
        subcommand,
        type: typeFilter
      };
      
    case 'delete':
      if (parts.length < 4) return null;
      return {
        subcommand,
        type: parts[2],
        name: parts[3]
      };
      
    default:
      return null;
  }
}

/**
 * 初始化群组规则（清空所有规则）
 */
async function initGroupRules(chatId: number, env: EnvLike & { DB: D1Database }): Promise<string> {
  try {
    await env.DB.prepare(`
      DELETE FROM group_rules WHERE chat_id = ?
    `).bind(chatId.toString()).run();
    
    return "✅ 已清空当前群组的所有规则设置。";
  } catch (error) {
    console.error("初始化规则失败:", error);
    return "❌ 初始化规则失败，请稍后重试。";
  }
}

/**
 * 设置规则
 */
async function setRule(
  chatId: number, 
  args: RuleCommandArgs, 
  env: EnvLike & { DB: D1Database }
): Promise<string> {
  if (!args.type || !args.name || !args.value) {
    return "❌ 参数错误。格式：/rule set [类型] [名称] [值]";
  }
  
  try {
    const existing = await env.DB.prepare(`
      SELECT id FROM group_rules 
      WHERE chat_id = ? AND rule_type = ? AND rule_name = ?
    `).bind(chatId.toString(), args.type, args.name).first();
    
    if (existing) {
      await env.DB.prepare(`
        UPDATE group_rules 
        SET rule_value = ?, display_name = ?, is_base_attribute = ?, updated_at = CURRENT_TIMESTAMP
        WHERE chat_id = ? AND rule_type = ? AND rule_name = ?
      `).bind(
        args.value,
        args.displayName || args.name,
        args.isBaseAttribute ? 1 : 0,
        chatId.toString(),
        args.type,
        args.name
      ).run();
      
      return `✅ 已更新规则：${args.type} - ${args.name} = ${args.value}`;
    } else {
      const maxOrderResult = await env.DB.prepare(`
        SELECT COALESCE(MAX(order_index), 0) as max_order 
        FROM group_rules 
        WHERE chat_id = ? AND rule_type = ?
      `).bind(chatId.toString(), args.type).first() as { max_order: number } | null;
      
      await env.DB.prepare(`
        INSERT INTO group_rules 
        (chat_id, rule_type, rule_name, rule_value, display_name, is_base_attribute, order_index)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        chatId.toString(),
        args.type,
        args.name,
        args.value,
        args.displayName || args.name,
        args.isBaseAttribute ? 1 : 0,
        (maxOrderResult?.max_order || 0) + 1
      ).run();
      
      return `✅ 已添加规则：${args.type} - ${args.name} = ${args.value}`;
    }
  } catch (error) {
    console.error("设置规则失败:", error);
    return "❌ 设置规则失败，请检查参数格式。";
  }
}

/**
 * 列出规则
 */
async function listRules(
  chatId: number, 
  typeFilter: string | undefined, 
  env: EnvLike & { DB: D1Database }
): Promise<string> {
  try {
    let query = `
      SELECT rule_type, rule_name, rule_value, display_name, is_base_attribute
      FROM group_rules 
      WHERE chat_id = ?
    `;
    const params: any[] = [chatId.toString()];
    
    if (typeFilter) {
      query += ` AND rule_type = ?`;
      params.push(typeFilter);
    }
    
    query += ` ORDER BY rule_type, order_index`;
    
    const result = await env.DB.prepare(query).bind(...params).all();
    
    // 修复类型转换问题：先转换为 unknown，再转换为 RuleRow[]
    const rows = (result.results as unknown) as RuleRow[];
    
    if (!rows || rows.length === 0) {
      return typeFilter 
        ? `📋 当前群组没有 ${typeFilter} 类型的规则。`
        : `📋 当前群组还没有设置任何规则。`;
    }
    
    const grouped: Record<string, RuleRow[]> = {};
    for (const rule of rows) {
      if (!grouped[rule.rule_type]) {
        grouped[rule.rule_type] = [];
      }
      grouped[rule.rule_type].push(rule);
    }
    
    let response = "📋 当前群组规则列表：\n\n";
    
    for (const [ruleType, rules] of Object.entries(grouped)) {
      response += `🔸 ${ruleType.toUpperCase()} 类型：\n`;
      
      for (const rule of rules) {
        const baseMarker = rule.is_base_attribute ? "🔹 " : "  ";
        response += `${baseMarker}${rule.display_name} (${rule.rule_name}): ${rule.rule_value}\n`;
      }
      
      response += "\n";
    }
    
    return response;
  } catch (error) {
    console.error("列出规则失败:", error);
    return "❌ 获取规则列表失败，请稍后重试。";
  }
}

/**
 * 删除规则
 */
async function deleteRule(
  chatId: number,
  args: RuleCommandArgs,
  env: EnvLike & { DB: D1Database }
): Promise<string> {
  if (!args.type || !args.name) {
    return "❌ 参数错误。格式：/rule delete [类型] [名称]";
  }
  
  try {
    const result = await env.DB.prepare(`
      DELETE FROM group_rules 
      WHERE chat_id = ? AND rule_type = ? AND rule_name = ?
    `).bind(chatId.toString(), args.type, args.name).run();
    
    if (result.meta.changes > 0) {
      return `✅ 已删除规则：${args.type} - ${args.name}`;
    } else {
      return `❌ 未找到规则：${args.type} - ${args.name}`;
    }
  } catch (error) {
    console.error("删除规则失败:", error);
    return "❌ 删除规则失败，请稍后重试。";
  }
}

/**
 * 主处理函数
 */
export async function handleRule(parsedMessage: ParsedUpdate, env: EnvLike & { DB: D1Database }) {
  const chatId = parsedMessage.chatId as number; // 确保是 number 类型
  const text = parsedMessage.text || "";
  
  const args = parseRuleCommand(text);
  
  if (!args) {
    return await TgMessage.sendText(env, {
      chat_id: chatId, // Telegram API 需要 number
      text: `📖 规则管理命令使用说明：
      
/rule init - 清空当前群组所有规则
/rule set [类型] [名称] [值] - 设置规则
    可选参数：display_name:显示名称 base:true
    示例：/rule set attribute 力量 10 display_name:力量值 base:true
    
/rule list [类型] - 列出规则（不指定类型则列出全部）
/rule delete [类型] [名称] - 删除规则

📌 规则类型建议：
- attribute: 角色属性（力量、敏捷等）
- skill: 技能（近战攻击、远程攻击等）
- system: 系统设置（生命计算方式等）
- other: 其他规则

📝 规则值可以是数字、公式或描述文本。`,
      parse_mode: "Markdown",
      message_thread_id: parsedMessage.threadId
    });
  }
  
  let response: string;
  
  switch (args.subcommand) {
    case 'init':
      response = await initGroupRules(chatId, env);
      break;
      
    case 'set':
      response = await setRule(chatId, args, env);
      break;
      
    case 'list':
      response = await listRules(chatId, args.type, env);
      break;
      
    case 'delete':
      response = await deleteRule(chatId, args, env);
      break;
      
    default:
      response = "❌ 未知的子命令。";
  }
  
  return await TgMessage.sendText(env, {
    chat_id: chatId,
    text: response,
    parse_mode: "Markdown",
    message_thread_id: parsedMessage.threadId
  });
}

export default handleRule;