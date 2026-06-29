#!/bin/bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

REPO_DIR="${TMP_DIR}/repo"
REMOTE_DIR="${TMP_DIR}/remote.git"
BIN_DIR="${TMP_DIR}/bin"
CLAIM_COUNT="${TMP_DIR}/claim-count"
CODEX_COUNT="${TMP_DIR}/codex-count"
STATUS_LOG="${TMP_DIR}/status.json"
STATUS_COUNT="${TMP_DIR}/status-count"
TELEGRAM_LOG="${TMP_DIR}/telegram.json"

mkdir -p "$REPO_DIR/scripts" "$BIN_DIR"
cp "${ROOT_DIR}/scripts/wish-execute.sh" "${REPO_DIR}/scripts/wish-execute.sh"
cp "${ROOT_DIR}/scripts/wish-net.sh" "${REPO_DIR}/scripts/wish-net.sh"

git init -q -b main "$REPO_DIR"
git -C "$REPO_DIR" config user.email "test@example.com"
git -C "$REPO_DIR" config user.name "Test User"
printf 'original\n' >"${REPO_DIR}/tracked.txt"
git -C "$REPO_DIR" add .
git -C "$REPO_DIR" commit -q -m "initial"
git init -q --bare "$REMOTE_DIR"
git -C "$REPO_DIR" remote add origin "$REMOTE_DIR"
git -C "$REPO_DIR" push -q -u origin main

cat >"${BIN_DIR}/curl" <<'STUB'
#!/bin/bash
if printf '%s\n' "$@" | grep -q '/api/wish/approved/claim'; then
	count=$(cat "$WISH_CLAIM_COUNT" 2>/dev/null || printf '0')
	count=$((count + 1))
	printf '%s' "$count" > "$WISH_CLAIM_COUNT"
	if [ "$count" -eq 1 ]; then
		echo "simulated claim timeout" >&2
		exit 28
	fi
	printf '%s\n' '{"task":{"id":1,"title":"兼容命令","body":"增加中文命令","wish_ids_json":"[1]","wishers_json":"[{\"userId\":\"12345\",\"firstName\":\"Alice & Bob\"}]"}}'
elif printf '%s\n' "$@" | grep -q '/api/wish/tasks/1/status'; then
	count=$(cat "$WISH_STATUS_COUNT" 2>/dev/null || printf '0')
	count=$((count + 1))
	printf '%s' "$count" > "$WISH_STATUS_COUNT"
	if [ "$count" -eq 1 ]; then
		echo "simulated status timeout" >&2
		exit 28
	fi
	while [ "$#" -gt 0 ]; do
		if [ "$1" = "--data-binary" ]; then
			shift
			printf '%s' "$1" > "$WISH_STATUS_LOG"
			break
		fi
		shift
	done
	printf '{"ok":true}\n'
elif printf '%s\n' "$@" | grep -q 'api.telegram.org/bottest-token/sendMessage'; then
	while [ "$#" -gt 0 ]; do
		if [ "$1" = "-d" ]; then
			shift
			printf '%s' "$1" > "$WISH_TELEGRAM_LOG"
			break
		fi
		shift
	done
	printf '{"ok":true}\n'
else
	printf '{"ok":true}\n'
fi
STUB
chmod +x "${BIN_DIR}/curl"

cat >"${BIN_DIR}/codex" <<'STUB'
#!/bin/bash
count=$(cat "$WISH_CODEX_COUNT" 2>/dev/null || printf '0')
count=$((count + 1))
printf '%s' "$count" > "$WISH_CODEX_COUNT"

if [ "$count" -eq 1 ]; then
	printf 'failed attempt\n' >> tracked.txt
	printf 'generated from failed attempt\n' > generated.txt
	exit 1
fi

printf 'retry success\n' > tracked.txt
exit 0
STUB
chmod +x "${BIN_DIR}/codex"

(
	cd "$REPO_DIR"
	PATH="${BIN_DIR}:$PATH" \
	WORKER_BASE_URL="https://worker.test" \
	EXTERNAL_API_KEY="test-key" \
	WISH_CLAIM_COUNT="$CLAIM_COUNT" \
	WISH_CODEX_COUNT="$CODEX_COUNT" \
	WISH_STATUS_LOG="$STATUS_LOG" \
	WISH_STATUS_COUNT="$STATUS_COUNT" \
	WISH_TELEGRAM_LOG="$TELEGRAM_LOG" \
	WISH_RETRY_DELAY="0" \
	WISH_EXEC_RETRY_DELAY="0" \
	BOT_TOKEN="test-token" \
	CHAT_ID="-1001" \
	TOPIC_ID="89" \
	WISH_VERIFY_CMD="test \"\$(cat tracked.txt)\" = \"retry success\"" \
	bash scripts/wish-execute.sh
)

if [ "$(cat "$CLAIM_COUNT")" -ne 2 ]; then
	echo "Expected claim request to retry once after a transient failure." >&2
	exit 1
fi

if [ "$(cat "$CODEX_COUNT")" -ne 2 ]; then
	echo "Expected codex execution to retry once after a failed attempt." >&2
	exit 1
fi

if [ "$(cat "$STATUS_COUNT")" -ne 2 ]; then
	echo "Expected final status update to retry once after a transient failure." >&2
	exit 1
fi

if [ "$(git -C "$REPO_DIR" show HEAD:tracked.txt)" != "retry success" ]; then
	echo "Expected committed tracked file to contain only successful retry output." >&2
	exit 1
fi

if git -C "$REPO_DIR" ls-tree -r --name-only HEAD | grep -qx 'generated.txt'; then
	echo "Expected generated failed-attempt file to be cleaned before retry." >&2
	exit 1
fi

TASK_STATUS=$(jq -r '.status' "$STATUS_LOG")
if [ "$TASK_STATUS" != "done" ]; then
	echo "Expected successful retry to mark task done, got: ${TASK_STATUS}" >&2
	exit 1
fi

TELEGRAM_TEXT=$(jq -r '.text' "$TELEGRAM_LOG")
if ! printf '%s' "$TELEGRAM_TEXT" | grep -q '<a href="tg://user?id=12345">Alice &amp; Bob</a>'; then
	echo "Expected completion notification to mention the wisher, got: ${TELEGRAM_TEXT}" >&2
	exit 1
fi

STATUS_RESULT=$(jq -r '.resultText' "$STATUS_LOG")
for required in "实现说明" "关键步骤" "简短描述" "兼容命令" "增加中文命令"; do
	if ! printf '%s' "$STATUS_RESULT" | grep -q "$required"; then
		echo "Expected status result to include ${required}, got: ${STATUS_RESULT}" >&2
		exit 1
	fi
	if ! printf '%s' "$TELEGRAM_TEXT" | grep -q "$required"; then
		echo "Expected completion notification to include ${required}, got: ${TELEGRAM_TEXT}" >&2
		exit 1
	fi
done

if [ "$(jq -r '.parse_mode' "$TELEGRAM_LOG")" != "HTML" ]; then
	echo "Expected completion notification to use HTML parse mode." >&2
	exit 1
fi
