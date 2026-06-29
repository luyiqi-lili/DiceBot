#!/bin/bash
# scripts/wish-execute.sh
# Claim one admin-approved wish task, let Codex CLI implement it, verify,
# commit, push, and report status back to the Worker API.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/wish-net.sh
source "${SCRIPT_DIR}/wish-net.sh"

: "${WORKER_BASE_URL:?WORKER_BASE_URL is required}"
: "${EXTERNAL_API_KEY:?EXTERNAL_API_KEY is required}"

VERIFY_CMD="${WISH_VERIFY_CMD:-npm test -- test/lib/wishCore.spec.ts test/commands/wish.spec.ts test/lib/wishApi.spec.ts}"
EXEC_ATTEMPTS="${WISH_EXEC_ATTEMPTS:-3}"
EXEC_RETRY_DELAY="${WISH_EXEC_RETRY_DELAY:-30}"
CLEANUP_ON_EXIT=0
TASK_FINALIZED=0

has_worktree_changes() {
	! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]
}

reset_generated_changes() {
	if has_worktree_changes; then
		git reset --hard HEAD >/dev/null 2>&1 || true
		git clean -fd >/dev/null 2>&1 || true
	fi
}

cleanup_failed_changes() {
	local exit_code=$?
	if [ "$CLEANUP_ON_EXIT" != "1" ] || [ "$exit_code" -eq 0 ]; then
		return
	fi
	echo "Cleaning generated changes from failed wish task ${TASK_ID:-unknown}." >&2
	reset_generated_changes
	if [ "$TASK_FINALIZED" != "1" ] && [ -n "${TASK_ID:-}" ]; then
		echo "Requeueing interrupted wish task ${TASK_ID}." >&2
		if ! finish_task "approved" "莉莉这轮处理被中断啦，已经把愿望放回队列，下一轮会重新试。"; then
			echo "Failed to requeue interrupted wish task ${TASK_ID}." >&2
		fi
	fi
}

trap cleanup_failed_changes EXIT
trap 'exit 130' INT TERM HUP

notify_telegram() {
	local text="$1"
	local parse_mode="${2:-}"
	if [ -z "${BOT_TOKEN:-}" ] || [ -z "${CHAT_ID:-}" ] || [ -z "${TOPIC_ID:-}" ]; then
		return 0
	fi

	local payload
	if [ -n "$parse_mode" ]; then
		payload=$(jq -n \
			--arg chat_id "$CHAT_ID" \
			--arg text "$text" \
			--arg parse_mode "$parse_mode" \
			--argjson message_thread_id "$TOPIC_ID" \
			'{chat_id: $chat_id, text: $text, parse_mode: $parse_mode, message_thread_id: $message_thread_id}')
	else
		payload=$(jq -n \
			--arg chat_id "$CHAT_ID" \
			--arg text "$text" \
			--argjson message_thread_id "$TOPIC_ID" \
			'{chat_id: $chat_id, text: $text, message_thread_id: $message_thread_id}')
	fi

	curl_once -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
		-H "Content-Type: application/json" \
		-d "$payload" \
		>/dev/null || true
}

wish_mentions_html() {
	if [ -z "${WISHERS_JSON:-}" ] || [ "$WISHERS_JSON" = "null" ]; then
		return 0
	fi

	printf '%s' "$WISHERS_JSON" | jq -r '
		def h: tostring
			| gsub("&"; "&amp;")
			| gsub("<"; "&lt;")
			| gsub(">"; "&gt;")
			| gsub("\""; "&quot;");
		[
			.[]?
			| select(.userId != null and (.userId | tostring | length > 0))
			| "<a href=\"tg://user?id=\(.userId | h)\">\((.firstName // ("用户" + (.userId | tostring))) | h)</a>"
		]
		| unique
		| join(" ")
	' 2>/dev/null || true
}

compact_text() {
	local text="$1"
	local max_len="$2"
	printf '%s' "$text" | tr '\n\r\t' '   ' | jq -Rr --argjson max_len "$max_len" '
		gsub("[ ]+"; " ")
		| gsub("^ "; "")
		| gsub(" $"; "")
		| if length > $max_len then .[0:($max_len - 1)] + "..." else . end
	'
}

changed_files_summary() {
	{
		git diff --name-only
		git diff --cached --name-only
		git ls-files --others --exclude-standard
	} | awk '
		NF {
			if ($0 ~ /^test\//) label = "补上相关检查";
			else if ($0 ~ /^src\/commands\//) label = "调整群聊指令";
			else if ($0 ~ /^src\/lib\//) label = "完善功能逻辑";
			else if ($0 ~ /^scripts\//) label = "更新愿望处理流程";
			else if ($0 ~ /^docs\//) label = "整理说明文档";
			else if ($0 ~ /^schema\//) label = "调整保存资料的结构";
			else if ($0 ~ /^src\/web\//) label = "更新网页内容";
			else label = "整理相关文件";
			if (!seen[label]++ && count < 4) {
				labels[++count] = label;
			}
		}
		END {
			for (i = 1; i <= count; i++) {
				if (i > 1) printf "、";
				printf "%s", labels[i];
			}
		}
	'
}

build_completion_result() {
	local commit_sha="$1"
	local changes="$2"
	local title
	local body
	title=$(compact_text "$TITLE" 80)
	body=$(compact_text "$BODY" 140)
	if [ -z "$changes" ]; then
		changes="完成相关改动"
	fi

	jq -nr \
		--arg commit_sha "$commit_sha" \
		--arg title "$title" \
		--arg body "$body" \
		--arg changes "$changes" \
		'[
			"愿望已经做好啦，记录是 " + $commit_sha + "。",
			"",
			"实现说明：",
			"简短描述：" + $title + (if ($body | length) > 0 then " - " + $body else "" end),
			"关键步骤：",
			"1. 先补好或更新相关检查，确认这个愿望有被照顾到。",
			"2. 完成了这些改动：" + $changes + "。",
			"3. 跑过相关检查，结果通过了。"
		] | join("\n")'
}

finish_task() {
	local status="$1"
	local text="$2"
	local payload
	TASK_FINALIZED=1
	payload=$(jq -n --arg status "$status" --arg resultText "$text" '{status: $status, resultText: $resultText}')
	curl_retry -X POST "${WORKER_BASE_URL%/}/api/wish/tasks/${TASK_ID}/status" \
		-H "X-API-Key: ${EXTERNAL_API_KEY}" \
		-H "Content-Type: application/json" \
		--data-binary "$payload" >/dev/null

	if [ "$status" = "done" ]; then
		local mentions
		mentions=$(wish_mentions_html)
		if [ -n "$mentions" ]; then
			local html
			html=$(jq -nr \
				--arg task_id "$TASK_ID" \
				--arg result "$text" \
				--arg mentions "$mentions" \
				'def h: tostring
					| gsub("&"; "&amp;")
					| gsub("<"; "&lt;")
					| gsub(">"; "&gt;");
				"骰娘莉莉的愿望小工坊 #\($task_id | h)：\($result | h)\n\($mentions)"')
			notify_telegram "$html" "HTML"
			return
		fi
	fi

	notify_telegram "骰娘莉莉的愿望小工坊 #${TASK_ID}：${text}"
}

requeue_task() {
	finish_task "approved" "$1"
}

if has_worktree_changes; then
	echo "Working tree is dirty; refusing to run before claiming a wish task." >&2
	exit 1
fi

CLAIM_JSON=$(curl_retry -X POST \
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
WISHERS_JSON=$(printf '%s' "$CLAIM_JSON" | jq -c '.task.wishers_json | fromjson? // []')

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

EXEC_ATTEMPT=1
CODEX_OK=0
while [ "$EXEC_ATTEMPT" -le "$EXEC_ATTEMPTS" ]; do
	if codex exec --dangerously-bypass-approvals-and-sandbox "$PROMPT"; then
		CODEX_OK=1
		break
	fi

	reset_generated_changes
	if [ "$EXEC_ATTEMPT" -ge "$EXEC_ATTEMPTS" ]; then
		break
	fi

	echo "Codex execution failed, retrying ${EXEC_ATTEMPT}/${EXEC_ATTEMPTS}..." >&2
	EXEC_ATTEMPT=$((EXEC_ATTEMPT + 1))
	sleep "$EXEC_RETRY_DELAY"
done

if [ "$CODEX_OK" != "1" ]; then
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

COMPLETION_CHANGES=$(changed_files_summary)
git add .
git commit -m "feat: implement wish task ${TASK_ID}"
git push origin main

COMMIT_SHA=$(git rev-parse --short HEAD)
CLEANUP_ON_EXIT=0
finish_task "done" "$(build_completion_result "$COMMIT_SHA" "$COMPLETION_CHANGES")"
echo "Wish task ${TASK_ID} completed at ${COMMIT_SHA}."
