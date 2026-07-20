#!/bin/bash
# scripts/notify-deploy.sh
# 部署完成后向配置的 Telegram 用户或群组发送提交消息通知
#
# 用法: ./scripts/notify-deploy.sh <env> <commit_sha> <commit_msg>
#   env: prod | dev
#   commit_sha: 提交 SHA（短）
#   commit_msg: 提交消息

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "${ROOT_DIR}/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "${ROOT_DIR}/.env"
    set +a
fi

ENV="${1:-unknown}"
COMMIT_SHA="${2:-HEAD}"
COMMIT_MSG="${3:-}"

# Telegram 配置
BOT_TOKEN="${BOT_TOKEN:-${TOKEN:-${DEV_BOT_TOKEN:-}}}"
: "${BOT_TOKEN:?BOT_TOKEN, TOKEN, or DEV_BOT_TOKEN is required}"
CHAT_ID="${CHAT_ID:-8080375150}"
TOPIC_ID="${TOPIC_ID:-}"

# CI 环境中自动获取 git 信息
if [ -n "${GITHUB_SHA:-}" ]; then
    COMMIT_SHA="${GITHUB_SHA:0:7}"
fi
if [ -z "$COMMIT_MSG" ] && [ -n "${GITHUB_SHA:-}" ]; then
    COMMIT_MSG=$(git log -1 --pretty=%B "$GITHUB_SHA" 2>/dev/null | head -1 || echo "deploy")
fi

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
BRANCH="${GITHUB_REF_NAME:-unknown}"

# 环境 emoji
if [ "$ENV" = "prod" ]; then
    ENV_EMOJI="🚀"
    ENV_LABEL="生产环境"
else
    ENV_EMOJI="🔧"
    ENV_LABEL="开发环境"
fi

# 截断过长消息
COMMIT_MSG_SHORT=$(echo "$COMMIT_MSG" | head -1 | cut -c1-200)

TEXT=$(cat <<EOF
${ENV_EMOJI} <b>DiceBot 已部署</b> — ${ENV_LABEL}

📦 <b>提交:</b> <code>${COMMIT_SHA}</code>
🌿 <b>分支:</b> ${BRANCH}
📝 <b>消息:</b> ${COMMIT_MSG_SHORT}
🕐 <b>时间:</b> ${TIMESTAMP}
EOF
)

# 私聊不能携带 message_thread_id；仅群组话题显式配置 TOPIC_ID 时添加。
if [ -n "$TOPIC_ID" ]; then
    PAYLOAD=$(jq -n \
        --arg chat_id "$CHAT_ID" \
        --arg text "$TEXT" \
        --argjson message_thread_id "$TOPIC_ID" \
        --arg parse_mode "HTML" \
        '{chat_id: $chat_id, text: $text, message_thread_id: $message_thread_id, parse_mode: $parse_mode}')
else
    PAYLOAD=$(jq -n \
        --arg chat_id "$CHAT_ID" \
        --arg text "$TEXT" \
        --arg parse_mode "HTML" \
        '{chat_id: $chat_id, text: $text, parse_mode: $parse_mode}')
fi

# 发送消息
TG_RESPONSE=$(curl -sS -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")

if ! jq -e '.ok == true' >/dev/null <<<"$TG_RESPONSE"; then
    DESCRIPTION=$(jq -r '.description // "unknown error"' <<<"$TG_RESPONSE")
    echo "Telegram 通知发送失败: ${DESCRIPTION}" >&2
    exit 1
fi

echo "✅ 通知已发送到 Telegram"
