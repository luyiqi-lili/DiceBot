#!/bin/bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

REPO_DIR="${TMP_DIR}/repo"
REMOTE_DIR="${TMP_DIR}/remote.git"
BIN_DIR="${TMP_DIR}/bin"
STATUS_LOG="${TMP_DIR}/status.json"

mkdir -p "$REPO_DIR/scripts" "$BIN_DIR"
cp "${ROOT_DIR}/scripts/wish-execute.sh" "${REPO_DIR}/scripts/wish-execute.sh"

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
	printf '{"task":{"id":1,"title":"兼容命令","body":"增加中文命令","wish_ids_json":"[1]"}}\n'
elif printf '%s\n' "$@" | grep -q '/api/wish/tasks/1/status'; then
	cat > "$WISH_STATUS_LOG"
	printf '{"ok":true}\n'
else
	printf '{"ok":true}\n'
fi
STUB
chmod +x "${BIN_DIR}/curl"

cat >"${BIN_DIR}/codex" <<'STUB'
#!/bin/bash
printf 'changed\n' >> tracked.txt
printf 'generated\n' > generated.txt
exit 1
STUB
chmod +x "${BIN_DIR}/codex"

set +e
(
	cd "$REPO_DIR"
	PATH="${BIN_DIR}:$PATH" \
	WORKER_BASE_URL="https://worker.test" \
	EXTERNAL_API_KEY="test-key" \
	WISH_STATUS_LOG="$STATUS_LOG" \
	BOT_TOKEN="" \
	CHAT_ID="" \
	TOPIC_ID="" \
	bash scripts/wish-execute.sh
)
EXIT_CODE=$?
set -e

if [ "$EXIT_CODE" -eq 0 ]; then
	echo "Expected wish-execute.sh to fail when codex fails." >&2
	exit 1
fi

STATUS=$(git -C "$REPO_DIR" status --short)
if [ -n "$STATUS" ]; then
	echo "Expected failed execution to clean generated changes, got:" >&2
	echo "$STATUS" >&2
	exit 1
fi

TASK_STATUS=$(jq -r '.status' "$STATUS_LOG")
if [ "$TASK_STATUS" != "approved" ]; then
	echo "Expected failed execution to requeue task as approved, got: ${TASK_STATUS}" >&2
	exit 1
fi
