#!/bin/bash
# scripts/wish-digest.sh
# Fetch pending /wish entries, ask Codex CLI to summarize them, send a Telegram
# digest, and store the resulting summary/tasks through the Worker API.

set -euo pipefail

: "${WORKER_BASE_URL:?WORKER_BASE_URL is required, e.g. https://telegram-bot.example.workers.dev}"
: "${EXTERNAL_API_KEY:?EXTERNAL_API_KEY is required}"
: "${BOT_TOKEN:?BOT_TOKEN is required}"
: "${CHAT_ID:?CHAT_ID is required}"
: "${TOPIC_ID:?TOPIC_ID is required}"

PENDING_JSON=$(curl -sS \
	-H "X-API-Key: ${EXTERNAL_API_KEY}" \
	"${WORKER_BASE_URL%/}/api/wish/pending?limit=50")

COUNT=$(printf '%s' "$PENDING_JSON" | jq '.wishes | length')
if [ "$COUNT" -eq 0 ]; then
	echo "No pending wishes."
	exit 0
fi

SCHEMA_FILE=$(mktemp)
SUMMARY_FILE=$(mktemp)
trap 'rm -f "$SCHEMA_FILE" "$SUMMARY_FILE"' EXIT

cat > "$SCHEMA_FILE" <<'JSON'
{
  "type": "object",
  "properties": {
    "summary_text": { "type": "string" },
    "items": {
      "type": "array",
      "minItems": 1,
      "maxItems": 3,
      "items": {
        "type": "object",
        "properties": {
          "itemNumber": { "type": "integer" },
          "title": { "type": "string" },
          "body": { "type": "string" },
          "wishIds": {
            "type": "array",
            "items": { "type": "integer" }
          }
        },
        "required": ["itemNumber", "title", "body", "wishIds"],
        "additionalProperties": false
      }
    }
  },
  "required": ["summary_text", "items"],
  "additionalProperties": false
}
JSON

printf '%s' "$PENDING_JSON" | codex exec \
	--sandbox read-only \
	--output-schema "$SCHEMA_FILE" \
	-o "$SUMMARY_FILE" \
	"把这些 Telegram /wish 原文整理成 1-3 个小而可执行的功能点。忽略明显无意义、重复、过大或无法落地的内容。每个功能点必须能通过一次代码修改完成，并保留相关 wish id。summary_text 用普通群消息口吻，编号清晰，最后提示管理员回复编号批准。" \
	>/dev/null

SUMMARY_JSON=$(cat "$SUMMARY_FILE")
ITEM_COUNT=$(printf '%s' "$SUMMARY_JSON" | jq '.items | length')
if [ "$ITEM_COUNT" -eq 0 ]; then
	echo "Codex produced no actionable items."
	exit 0
fi

TEXT=$(printf '%s' "$SUMMARY_JSON" | jq -r '.summary_text')
TG_RESPONSE=$(curl -sS -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
	-H "Content-Type: application/json" \
	-d "$(jq -n \
		--arg chat_id "$CHAT_ID" \
		--arg text "$TEXT" \
		--argjson message_thread_id "$TOPIC_ID" \
		'{chat_id: $chat_id, text: $text, message_thread_id: $message_thread_id}')")

MESSAGE_ID=$(printf '%s' "$TG_RESPONSE" | jq -r 'if .ok then .result.message_id else empty end')
if [ -z "$MESSAGE_ID" ]; then
	echo "Telegram send failed: $TG_RESPONSE" >&2
	exit 1
fi

jq -n \
	--argjson messageId "$MESSAGE_ID" \
	--arg chatId "$CHAT_ID" \
	--argjson threadId "$TOPIC_ID" \
	--arg body "$TEXT" \
	--argjson items "$(printf '%s' "$SUMMARY_JSON" | jq '.items')" \
	'{messageId: $messageId, chatId: $chatId, threadId: $threadId, body: $body, items: $items}' |
curl -sS -X POST "${WORKER_BASE_URL%/}/api/wish/summaries" \
	-H "X-API-Key: ${EXTERNAL_API_KEY}" \
	-H "Content-Type: application/json" \
	--data-binary @- \
	| jq .

echo "Wish digest sent as Telegram message ${MESSAGE_ID}."
