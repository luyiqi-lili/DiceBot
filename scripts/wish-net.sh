#!/bin/bash
# Shared network helpers for local wish automation scripts.

WISH_CONNECT_TIMEOUT="${WISH_CONNECT_TIMEOUT:-10}"
WISH_MAX_TIME="${WISH_MAX_TIME:-60}"
WISH_RETRY_ATTEMPTS="${WISH_RETRY_ATTEMPTS:-3}"
WISH_RETRY_DELAY="${WISH_RETRY_DELAY:-5}"

curl_once() {
	curl -sS \
		--connect-timeout "$WISH_CONNECT_TIMEOUT" \
		--max-time "$WISH_MAX_TIME" \
		--fail-with-body \
		"$@"
}

curl_retry() {
	local attempt=1
	while true; do
		if curl_once "$@"; then
			return 0
		fi
		if [ "$attempt" -ge "$WISH_RETRY_ATTEMPTS" ]; then
			return 1
		fi
		echo "Network request failed, retrying ${attempt}/${WISH_RETRY_ATTEMPTS}..." >&2
		attempt=$((attempt + 1))
		sleep "$WISH_RETRY_DELAY"
	done
}
