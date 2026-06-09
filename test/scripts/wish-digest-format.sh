#!/bin/bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

SCRIPT_DIR="${TMP_DIR}/scripts"
BIN_DIR="${TMP_DIR}/bin"
TG_LOG="${TMP_DIR}/telegram.json"
SUMMARY_LOG="${TMP_DIR}/summary.json"

mkdir -p "$SCRIPT_DIR" "$BIN_DIR"
cp "${ROOT_DIR}/scripts/wish-digest.sh" "${SCRIPT_DIR}/wish-digest.sh"

cat >"${BIN_DIR}/curl" <<'STUB'
#!/bin/bash
ARGS=$(printf '%s\n' "$*")
if printf '%s\n' "$ARGS" | grep -q '/api/wish/pending'; then
	printf '{"wishes":[{"id":2,"body":"钓鱼的功能还是只要/fish 不要/钓鱼了"}]}\n'
elif printf '%s\n' "$ARGS" | grep -q 'api.telegram.org'; then
	while [ "$#" -gt 0 ]; do
		if [ "$1" = "-d" ]; then
			shift
			printf '%s' "$1" > "$WISH_TG_LOG"
			break
		fi
		shift
	done
	printf '{"ok":true,"result":{"message_id":537294}}\n'
elif printf '%s\n' "$ARGS" | grep -q '/api/wish/summaries'; then
	cat > "$WISH_SUMMARY_LOG"
	printf '{"summary":{"id":2}}\n'
else
	printf '{}\n'
fi
STUB
chmod +x "${BIN_DIR}/curl"

cat >"${BIN_DIR}/codex" <<'STUB'
#!/bin/bash
OUT_FILE=""
while [ "$#" -gt 0 ]; do
	if [ "$1" = "-o" ]; then
		shift
		OUT_FILE="$1"
	fi
	shift || true
done
cat > "$OUT_FILE" <<'JSON'
{
  "summary_text": "莉莉帮大家把愿望整理好啦：这次主要是想让钓鱼指令更统一、更好记。",
  "items": [
    {
      "itemNumber": 1,
      "title": "统一钓鱼指令为 /fish",
      "body": "将钓鱼功能保留为 /fish，并移除或停用中文指令 /钓鱼。",
      "wishIds": [2]
    }
  ]
}
JSON
STUB
chmod +x "${BIN_DIR}/codex"

PATH="${BIN_DIR}:$PATH" \
WORKER_BASE_URL="https://worker.test" \
EXTERNAL_API_KEY="test-key" \
BOT_TOKEN="bot-token" \
CHAT_ID="-1001" \
TOPIC_ID="89" \
WISH_TG_LOG="$TG_LOG" \
WISH_SUMMARY_LOG="$SUMMARY_LOG" \
bash "${SCRIPT_DIR}/wish-digest.sh" >/dev/null

TG_TEXT=$(jq -r '.text' "$TG_LOG")
SUMMARY_BODY=$(jq -r '.body' "$SUMMARY_LOG")

if ! printf '%s' "$TG_TEXT" | grep -Fq '1. 统一钓鱼指令为 /fish'; then
	echo "Expected Telegram digest to include numbered item title, got:" >&2
	echo "$TG_TEXT" >&2
	exit 1
fi

if ! printf '%s' "$TG_TEXT" | grep -Fq '将钓鱼功能保留为 /fish'; then
	echo "Expected Telegram digest to include item body, got:" >&2
	echo "$TG_TEXT" >&2
	exit 1
fi

if [ "$SUMMARY_BODY" != "$TG_TEXT" ]; then
	echo "Expected stored summary body to match Telegram text." >&2
	exit 1
fi
