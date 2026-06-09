#!/bin/bash
# scripts/wish-execute.sh
# Claim one admin-approved wish task, let Codex CLI implement it, verify,
# commit, push, and report status back to the Worker API.

set -euo pipefail

: "${WORKER_BASE_URL:?WORKER_BASE_URL is required}"
: "${EXTERNAL_API_KEY:?EXTERNAL_API_KEY is required}"

VERIFY_CMD="${WISH_VERIFY_CMD:-npm test -- test/lib/wishCore.spec.ts test/commands/wish.spec.ts test/lib/wishApi.spec.ts}"

notify_telegram() {
	local text="$1"
	if [ -z "${BOT_TOKEN:-}" ] || [ -z "${CHAT_ID:-}" ] || [ -z "${TOPIC_ID:-}" ]; then
		return 0
	fi

	curl -sS -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
		-H "Content-Type: application/json" \
		-d "$(jq -n \
			--arg chat_id "$CHAT_ID" \
			--arg text "$text" \
			--argjson message_thread_id "$TOPIC_ID" \
			'{chat_id: $chat_id, text: $text, message_thread_id: $message_thread_id}')" \
		>/dev/null || true
}

CLAIM_JSON=$(curl -sS -X POST \
	-H "X-API-Key: ${EXTERNAL_API_KEY}" \
	"${WORKER_BASE_URL%/}/api/wish/approved/claim")

TASK_ID=$(printf '%s' "$CLAIM_JSON" | jq -r '.task.id // empty')
if [ -z "$TASK_ID" ]; then
	echo "No approved wish task."
	exit 0
fi

TITLE=$(printf '%s' "$CLAIM_JSON" | jq -r '.task.title')
BODY=$(printf '%s' "$CLAIM_JSON" | jq -r '.task.body')
WISH_IDS=$(printf '%s' "$CLAIM_JSON" | jq -r '.task.wish_ids_json')

finish_task() {
	local status="$1"
	local text="$2"
	jq -n --arg status "$status" --arg resultText "$text" '{status: $status, resultText: $resultText}' |
		curl -sS -X POST "${WORKER_BASE_URL%/}/api/wish/tasks/${TASK_ID}/status" \
			-H "X-API-Key: ${EXTERNAL_API_KEY}" \
			-H "Content-Type: application/json" \
			--data-binary @- >/dev/null
	notify_telegram "愿望任务 #${TASK_ID}：${text}"
}

if ! git diff --quiet || ! git diff --cached --quiet; then
	finish_task "failed" "工作区不干净，自动执行已停止。"
	echo "Working tree is dirty; refusing to run." >&2
	exit 1
fi

git pull --ff-only origin main

PROMPT=$(cat <<EOF
实现这个已由管理员批准的 Telegram wish 功能点：

标题：${TITLE}
说明：${BODY}
相关 wish ids：${WISH_IDS}

要求：
- 只实现这个功能点，不处理其他 wish。
- 不做无关重构。
- 遵循仓库现有代码风格。
- 先写或更新相关测试，再实现。
- 完成后运行相关测试和 git diff --check。
- 不要自行 push；脚本会负责 commit 和 push。
EOF
)

if ! codex exec --sandbox workspace-write "$PROMPT"; then
	finish_task "failed" "Codex 执行失败。"
	exit 1
fi

if ! git diff --check; then
	finish_task "failed" "git diff --check 失败。"
	exit 1
fi

if ! bash -lc "$VERIFY_CMD"; then
	finish_task "failed" "验证命令失败：${VERIFY_CMD}"
	exit 1
fi

if git diff --quiet && git diff --cached --quiet; then
	finish_task "failed" "Codex 未产生代码改动。"
	exit 1
fi

git add .
git commit -m "feat: implement wish task ${TASK_ID}"
git push origin main

COMMIT_SHA=$(git rev-parse --short HEAD)
finish_task "done" "已完成并推送 ${COMMIT_SHA}。"
echo "Wish task ${TASK_ID} completed at ${COMMIT_SHA}."
