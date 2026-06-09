#!/bin/bash
# scripts/wish-execute.sh
# Claim one admin-approved wish task, let Codex CLI implement it, verify,
# commit, push, and report status back to the Worker API.

set -euo pipefail

: "${WORKER_BASE_URL:?WORKER_BASE_URL is required}"
: "${EXTERNAL_API_KEY:?EXTERNAL_API_KEY is required}"

VERIFY_CMD="${WISH_VERIFY_CMD:-npm test -- test/lib/wishCore.spec.ts test/commands/wish.spec.ts test/lib/wishApi.spec.ts}"
CLEANUP_ON_EXIT=0

has_worktree_changes() {
	! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]
}

cleanup_failed_changes() {
	local exit_code=$?
	if [ "$CLEANUP_ON_EXIT" != "1" ] || [ "$exit_code" -eq 0 ]; then
		return
	fi
	if has_worktree_changes; then
		echo "Cleaning generated changes from failed wish task ${TASK_ID:-unknown}." >&2
		git reset --hard HEAD >/dev/null 2>&1 || true
		git clean -fd >/dev/null 2>&1 || true
	fi
}

trap cleanup_failed_changes EXIT

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

if has_worktree_changes; then
	echo "Working tree is dirty; refusing to run before claiming a wish task." >&2
	exit 1
fi

CLAIM_JSON=$(curl -sS -X POST \
	-H "X-API-Key: ${EXTERNAL_API_KEY}" \
	"${WORKER_BASE_URL%/}/api/wish/approved/claim")

TASK_ID=$(printf '%s' "$CLAIM_JSON" | jq -r '.task.id // empty')
if [ -z "$TASK_ID" ]; then
	echo "No approved wish task."
	exit 0
fi
CLEANUP_ON_EXIT=1

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
	notify_telegram "骰娘莉莉的愿望小工坊 #${TASK_ID}：${text}"
}

requeue_task() {
	finish_task "approved" "$1"
}

git pull --ff-only origin main

PROMPT=$(cat <<EOF
你是骰娘莉莉背后的自动开发小助手。实现这个已由管理员批准的 Telegram wish 功能点：

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
- 面向 Telegram 群里的提示文案要像骰娘莉莉在说话：亲切、轻松、普通用户能懂；不要出现 Codex、自动执行器、版本发布这类冷冰冰的词。
EOF
)

if ! codex exec --dangerously-bypass-approvals-and-sandbox "$PROMPT"; then
	requeue_task "莉莉这轮施法没成功，已经把愿望放回队列，下一轮会重新试。"
	exit 1
fi

if ! git diff --check; then
	requeue_task "莉莉发现改动里有格式问题，已经清掉这次草稿，下一轮重新试。"
	exit 1
fi

if ! bash -lc "$VERIFY_CMD"; then
	requeue_task "莉莉跑检查时没有过关，已经清掉这次草稿，下一轮重新试。"
	exit 1
fi

if git diff --quiet && git diff --cached --quiet; then
	requeue_task "莉莉看了一圈，没有找到可以提交的改动，已经把愿望放回队列。"
	exit 1
fi

git add .
git commit -m "feat: implement wish task ${TASK_ID}"
git push origin main

COMMIT_SHA=$(git rev-parse --short HEAD)
CLEANUP_ON_EXIT=0
finish_task "done" "愿望已经做好并推上去啦，提交是 ${COMMIT_SHA}。"
echo "Wish task ${TASK_ID} completed at ${COMMIT_SHA}."
